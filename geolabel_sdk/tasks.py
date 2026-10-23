import json
from typing import Any, Dict, List, Optional
from urllib.parse import quote


class Task:
    """A task record returned by the GeoLabel API."""

    def __init__(self, data: Dict[str, Any], client):
        self._client = client
        self._apply(data)

    def _apply(self, data: Dict[str, Any]) -> None:
        self.id: str = data.get("id", self.id if hasattr(self, "id") else "")
        self.raster_url: str = data.get("raster_url", "")
        self.crs: str = data.get("crs", "EPSG:4326")
        self.taxonomy: List[str] = data.get("taxonomy", [])
        self.target_annotator_count: int = data.get("target_annotator_count", 2)
        self.current_status: str = data.get("status", "queued")
        self.webhook_url: Optional[str] = data.get("webhook_url")
        self.iaa_score: Optional[float] = data.get("iaa_score")
        self.iaa_type: Optional[str] = data.get("iaa_type")
        self.created_at: Optional[str] = data.get("created_at")
        self.completed_at: Optional[str] = data.get("completed_at")

    def status(self) -> str:
        """Fetch and return the latest status using the configured credential."""
        self.refresh()
        return self.current_status

    def refresh(self) -> "Task":
        """Fetch current metadata using a service key or this task's annotator key."""
        updated = (
            self._client.tasks.get(self.id)
            if self._client.api_key
            else self._client.tasks.get_for_annotator(self.id)
        )
        self._apply({
            "id": updated.id,
            "raster_url": updated.raster_url,
            "crs": updated.crs,
            "taxonomy": updated.taxonomy,
            "target_annotator_count": updated.target_annotator_count,
            "status": updated.current_status,
            "webhook_url": updated.webhook_url,
            "iaa_score": updated.iaa_score,
            "iaa_type": updated.iaa_type,
            "created_at": updated.created_at,
            "completed_at": updated.completed_at,
        })
        return self

    def submit_annotation(self, geojson: Dict[str, Any]) -> Dict[str, Any]:
        """Submit one real GeoJSON FeatureCollection using this task's annotator key."""
        if not self._client.annotator_api_key:
            raise ValueError("Configure annotator_api_key on GeoLabelClient to submit annotations.")
        result = self._client._request(
            "POST",
            f"/tasks/{quote(self.id, safe='')}/annotations",
            data={"geojson": geojson},
            annotator_api_key=self._client.annotator_api_key,
        )
        self._apply(result)
        return result

    def download_results(self, format: str = "geojson", filename: Optional[str] = None) -> Dict[str, Any]:
        """Fetch current consensus output; optionally write its GeoJSON to disk."""
        if format.lower() != "geojson":
            raise ValueError("Only GeoJSON export is currently supported.")
        results = self._client.tasks.get_results(self.id)
        if filename:
            with open(filename, "w", encoding="utf-8") as output:
                json.dump(results.get("geojson", {}), output, indent=2)
        return results

    def register_webhook(self, webhook_url: str) -> Dict[str, Any]:
        """Register a callback; the API requires HTTPS and a configured host allowlist."""
        return self._client.tasks.register_webhook(self.id, webhook_url)

    def __repr__(self) -> str:
        return f"<GeoLabel Task id='{self.id}' status='{self.current_status}' iaa_score={self.iaa_score}>"


class TasksResource:
    """Create tasks and manage service- or annotator-scoped task access."""

    def __init__(self, client):
        self._client = client

    def create(
        self,
        raster_uri: Optional[str] = None,
        taxonomy: Optional[List[str]] = None,
        raster_url: Optional[str] = None,
        crs: str = "EPSG:4326",
        target_annotator_count: int = 2,
        webhook_url: Optional[str] = None,
    ) -> Task:
        """Create a task record; imagery itself is not uploaded or copied."""
        uri = raster_uri or raster_url
        if not uri:
            raise ValueError("Must provide raster_uri or raster_url to create a task.")
        if not taxonomy:
            raise ValueError("Must provide at least one category in taxonomy.")
        payload = {
            "raster_url": uri,
            "crs": crs,
            "taxonomy": taxonomy,
            "target_annotator_count": target_annotator_count,
            "webhook_url": webhook_url,
        }
        response = self._client._request("POST", "/tasks", data=payload)
        return Task(response, self._client)

    def get(self, task_id: str) -> Task:
        """Retrieve a task by ID using the service key."""
        response = self._client._request("GET", f"/tasks/{quote(task_id, safe='')}")
        return Task(response, self._client)

    def get_for_annotator(self, task_id: str) -> Task:
        """Retrieve only the task assigned to the configured annotator key."""
        if not self._client.annotator_api_key:
            raise ValueError("Configure annotator_api_key on GeoLabelClient to read an assigned task.")
        response = self._client._request(
            "GET",
            f"/annotator/tasks/{quote(task_id, safe='')}",
            annotator_api_key=self._client.annotator_api_key,
        )
        return Task(response, self._client)

    def register_annotator(self, task_id: str) -> Dict[str, Any]:
        """Provision a one-time key scoped to a task; service key required."""
        return self._client._request(
            "POST",
            "/annotators/register",
            data={"task_id": task_id},
        )

    def revoke_annotator(self, annotator_id: str) -> Dict[str, Any]:
        """Revoke an annotator key; already-submitted annotations are retained."""
        return self._client._request(
            "DELETE",
            f"/annotators/{quote(annotator_id, safe='')}",
        )

    def get_results(self, task_id: str) -> Dict[str, Any]:
        """Fetch current consensus GeoJSON and agreement metadata using the service key."""
        return self._client._request("GET", f"/tasks/{quote(task_id, safe='')}/results")

    def register_webhook(self, task_id: str, webhook_url: str) -> Dict[str, Any]:
        """Register a callback for a task (HTTPS and host allowlist required)."""
        return self._client._request(
            "POST",
            f"/tasks/{quote(task_id, safe='')}/webhook",
            data={"webhook_url": webhook_url},
        )
