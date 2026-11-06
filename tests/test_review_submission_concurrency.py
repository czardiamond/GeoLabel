from test_workflows import create_org_and_owner, geotiff_bytes, polygon_collection


def test_submission_refreshes_task_state_after_competing_completion(api_client, tmp_path, monkeypatch):
    client, session_factory = api_client
    from backend import workflows
    from backend.config import settings
    from backend.models import Annotation, Task
    from backend.scoring import compute_task_iaa

    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(tmp_path / "race-assets"))
    organization, _, owner_headers = create_org_and_owner(
        client, "Submission race", "race-owner@example.com"
    )
    workers = []
    worker_ids = []
    for index in range(2):
        invitation = client.post(
            f"/organizations/{organization['id']}/invitations",
            headers=owner_headers,
            json={"email": f"race-worker-{index}@example.com", "role": "annotator"},
        )
        accepted = client.post("/auth/invitations/accept", json={
            "token": invitation.json()["token"],
            "display_name": f"Race Worker {index}",
            "password": f"correct-horse-race-{index}",
        })
        workers.append({"Authorization": f"Bearer {accepted.json()['access_token']}"})
        worker_ids.append(accepted.json()["user"]["id"])

    project = client.post(
        f"/organizations/{organization['id']}/projects", headers=owner_headers,
        json={"name": "Race project", "description": ""},
    ).json()
    dataset = client.post(
        f"/projects/{project['id']}/datasets", headers=owner_headers,
        json={"name": "Race dataset", "description": ""},
    ).json()
    asset = client.post(
        f"/datasets/{dataset['id']}/assets", headers=owner_headers,
        files={"file": ("scene.tif", geotiff_bytes(), "image/tiff")},
    ).json()
    task_response = client.post(f"/projects/{project['id']}/tasks", headers=owner_headers, json={
        "title": "Concurrent completion", "dataset_id": dataset["id"], "asset_id": asset["id"],
        "crs": "EPSG:4326", "taxonomy": ["building", "road"], "target_annotator_count": 2,
    })
    assert task_response.status_code == 201, task_response.text
    task_id = task_response.json()["id"]
    assigned = client.post(
        f"/work/tasks/{task_id}/assignments", headers=owner_headers,
        json={"user_ids": worker_ids},
    )
    assert assigned.status_code == 200, assigned.text

    first = client.post(
        f"/work/tasks/{task_id}/annotations", headers=workers[0],
        json={"geojson": polygon_collection()},
    )
    assert first.status_code == 200, first.text
    assert first.json()["review_status"] == "not_started"

    original_locked_task = workflows._locked_task
    concurrent_state = {}

    def complete_task_after_authorization(db, locked_task_id):
        assert locked_task_id == task_id
        with session_factory() as concurrent_db:
            task = concurrent_db.query(Task).filter_by(id=task_id).one()
            second_geojson = polygon_collection(shift=0.1)
            second = Annotation(task_id=task_id, annotator_id=worker_ids[1], review_status="pending")
            second.geojson = second_geojson
            concurrent_db.add(second)
            concurrent_db.flush()
            annotations = concurrent_db.query(Annotation).filter_by(task_id=task_id).all()
            task.iaa_score, task.iaa_type = compute_task_iaa(
                [{"annotator_id": row.annotator_id, "geojson": row.geojson} for row in annotations],
                task.taxonomy,
                crs=task.crs,
            )
            task.status = "completed"
            task.review_status = "pending_review"
            concurrent_db.commit()
            concurrent_state["iaa_score"] = task.iaa_score
            concurrent_state["annotations"] = {
                row.annotator_id: row.geojson for row in annotations
            }
        return original_locked_task(db, locked_task_id)

    # The route has read the task for membership checks before this hook runs.
    # Simulate the competing final annotator committing just before FOR UPDATE.
    monkeypatch.setattr(workflows, "_locked_task", complete_task_after_authorization)
    attempted_race = client.post(
        f"/work/tasks/{task_id}/annotations", headers=owner_headers,
        json={"geojson": polygon_collection()},
    )
    assert attempted_race.status_code == 409, attempted_race.text
    assert "pending review" in attempted_race.json()["detail"].lower()

    task_after_race = client.get(f"/work/tasks/{task_id}", headers=owner_headers).json()
    assert task_after_race["status"] == "completed"
    assert task_after_race["review_status"] == "pending_review"
    assert task_after_race["iaa_score"] == concurrent_state["iaa_score"]
    submissions = client.get(f"/work/tasks/{task_id}/annotations", headers=owner_headers)
    assert submissions.status_code == 200, submissions.text
    assert {row["annotator_id"]: row["geojson"] for row in submissions.json()} == concurrent_state["annotations"]
    history = client.get(f"/work/tasks/{task_id}/annotation-history", headers=owner_headers)
    assert history.status_code == 200, history.text
    assert len(history.json()["history"]) == 2
    assert all(row["current"] for row in history.json()["history"])


def test_reviewer_decisions_refresh_membership_after_resource_lock(api_client, tmp_path, monkeypatch):
    client, session_factory = api_client
    from backend import workflows
    from backend.config import settings
    from backend.models import Annotation, AuditEvent, OrganizationMembership, PreAnnotation, Task

    monkeypatch.setattr(settings, "ASSET_STORAGE_DIR", str(tmp_path / "reviewer-role-race"))
    organization, _, owner_headers = create_org_and_owner(
        client, "Reviewer race", "reviewer-race-owner@example.com"
    )
    org_id = organization["id"]
    invitation = client.post(
        f"/organizations/{org_id}/invitations", headers=owner_headers,
        json={"email": "reviewer-race-reviewer@example.com", "role": "reviewer"},
    )
    accepted_reviewer = client.post("/auth/invitations/accept", json={
        "token": invitation.json()["token"], "display_name": "Review Race", "password": "correct-horse-review-race",
    })
    reviewer_id = accepted_reviewer.json()["user"]["id"]
    reviewer_headers = {"Authorization": f"Bearer {accepted_reviewer.json()['access_token']}"}

    project = client.post(f"/organizations/{org_id}/projects", headers=owner_headers,
                          json={"name": "Review race project", "description": ""}).json()
    dataset = client.post(f"/projects/{project['id']}/datasets", headers=owner_headers,
                          json={"name": "Review race dataset", "description": ""}).json()
    asset = client.post(
        f"/datasets/{dataset['id']}/assets", headers=owner_headers,
        files={"file": ("review-race.tif", geotiff_bytes(), "image/tiff")},
    )
    assert asset.status_code == 201, asset.text
    task_response = client.post(f"/projects/{project['id']}/tasks", headers=owner_headers, json={
        "title": "Review race task", "dataset_id": dataset["id"], "asset_id": asset.json()["id"],
        "crs": "EPSG:4326", "taxonomy": ["building"], "target_annotator_count": 1,
    })
    assert task_response.status_code == 201, task_response.text
    task_id = task_response.json()["id"]
    submitted = client.post(f"/work/tasks/{task_id}/annotations", headers=owner_headers,
                            json={"geojson": polygon_collection()})
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["review_status"] == "pending_review"
    preannotation = client.post(f"/work/tasks/{task_id}/preannotations", headers=owner_headers, json={
        "source": "local-test", "model_version": "v1", "geojson": polygon_collection(),
    })
    assert preannotation.status_code == 201, preannotation.text

    original_locked_task = workflows._locked_task

    def downgrade_reviewer_before_task_lock(db, locked_task_id):
        assert locked_task_id == task_id
        with session_factory() as concurrent_db:
            membership = concurrent_db.query(OrganizationMembership).filter_by(
                organization_id=org_id, user_id=reviewer_id
            ).one()
            membership.role = "annotator"
            concurrent_db.commit()
        return original_locked_task(db, locked_task_id)

    monkeypatch.setattr(workflows, "_locked_task", downgrade_reviewer_before_task_lock)
    rejected_task_decision = client.post(
        f"/work/tasks/{task_id}/review", headers=reviewer_headers,
        json={"decision": "accept", "comment": "Must not be accepted after revocation."},
    )
    assert rejected_task_decision.status_code == 403, rejected_task_decision.text
    monkeypatch.setattr(workflows, "_locked_task", original_locked_task)

    with session_factory() as db:
        assert db.query(Task).filter_by(id=task_id).one().review_status == "pending_review"
        assert db.query(Annotation).filter_by(task_id=task_id).one().review_status == "pending"
        assert db.query(AuditEvent).filter_by(action="task.review.accept", resource_id=task_id).count() == 0

    restored_role = client.patch(f"/organizations/{org_id}/members/{reviewer_id}", headers=owner_headers,
                                 json={"role": "reviewer"})
    assert restored_role.status_code == 200, restored_role.text
    original_locked_preannotation = workflows._locked_preannotation

    def downgrade_reviewer_before_preannotation_lock(db, preannotation_id):
        assert preannotation_id == preannotation.json()["id"]
        with session_factory() as concurrent_db:
            membership = concurrent_db.query(OrganizationMembership).filter_by(
                organization_id=org_id, user_id=reviewer_id
            ).one()
            membership.role = "annotator"
            concurrent_db.commit()
        return original_locked_preannotation(db, preannotation_id)

    monkeypatch.setattr(workflows, "_locked_preannotation", downgrade_reviewer_before_preannotation_lock)
    rejected_preannotation_decision = client.post(
        f"/work/preannotations/{preannotation.json()['id']}/decision", headers=reviewer_headers,
        json={"decision": "accept"},
    )
    assert rejected_preannotation_decision.status_code == 403, rejected_preannotation_decision.text

    with session_factory() as db:
        assert db.query(PreAnnotation).filter_by(id=preannotation.json()["id"]).one().status == "pending"
        assert db.query(AuditEvent).filter_by(
            action="preannotation.accepted", resource_id=preannotation.json()["id"]
        ).count() == 0
