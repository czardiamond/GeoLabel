import json
from typing import List, Dict, Any, Optional

class Task:
    """
    Represents an individual GeoLabel Geospatial Annotation Task.
    """

    def __init__(self, data: Dict[str, Any], client):
        self._client = client
        self.id: str = data.get("id", "")
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
        """Returns the current status of the task ('queued', 'in_progress', 'completed')."""
        self.refresh()
        return self.current_status

    def refresh(self) -> "Task":
        """Fetches the latest task status and metadata from the backend."""
        updated = self._client.tasks.get(self.id)
        self.current_status = updated.current_status
        self.iaa_score = updated.iaa_score
        self.iaa_type = updated.iaa_type
        self.webhook_url = updated.webhook_url
        self.completed_at = updated.completed_at
        return self

    def download_results(self, format: str = "geojson", filename: Optional[str] = None) -> Dict[str, Any]:
        """
        Downloads completed vector annotations as GeoJSON with Inter-Annotator Agreement (IAA) scores.
        If filename is specified, saves the GeoJSON to disk.
        """
        results = self._client.tasks.get_results(self.id)

        if filename:
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(results.get("geojson", {}), f, indent=2)

        return results

    def register_webhook(self, webhook_url: str) -> Dict[str, Any]:
        """Registers or updates callback URL for completion notification."""
        return self._client.tasks.register_webhook(self.id, webhook_url)

    def submit_annotation(self, annotator_id: str, geojson: Dict[str, Any]) -> Dict[str, Any]:
        """Submits a human specialist annotation for this task."""
        resp = self._client._request(
            "POST",
            f"/tasks/{self.id}/annotations",
            data={"annotator_id": annotator_id, "geojson": geojson}
        )
        self.refresh()
        return resp

    def simulate_completion(self) -> "Task":
        """Helper to simulate human annotator completion for end-to-end SDK testing."""
        self._client._request("POST", f"/tasks/{self.id}/simulate-completion")
        return self.refresh()

    def __repr__(self) -> str:
        return f"<GeoLabel Task id='{self.id}' status='{self.current_status}' iaa_score={self.iaa_score}>"


class TasksResource:
    """
    Sub-client resource for creating and querying annotation tasks.
    """

    def __init__(self, client):
        self._client = client

    def create(
        self,
        raster_uri: Optional[str] = None,
        taxonomy: Optional[List[str]] = None,
        raster_url: Optional[str] = None,
        crs: str = "EPSG:4326",
        target_annotator_count: int = 2,
        webhook_url: Optional[str] = None
    ) -> Task:
        """
        Creates an annotation task.
        
        Args:
            raster_uri: URI or URL to imagery (S3, GCS, COG, HTTP)
            taxonomy: List of categories to annotate (e.g. ["building_footprint", "solar_pv"])
            crs: Coordinate Reference System (default: EPSG:4326)
            target_annotator_count: Number of human specialist annotators (default: 2)
            webhook_url: Optional callback URL for task completion webhook
        """
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
            "webhook_url": webhook_url
        }

        res = self._client._request("POST", "/tasks", data=payload)
        return Task(res, self._client)

    def get(self, task_id: str) -> Task:
        """Retrieves task details and status by task ID."""
        res = self._client._request("GET", f"/tasks/{task_id}")
        return Task(res, self._client)

    def get_results(self, task_id: str) -> Dict[str, Any]:
        """Fetches completed GeoJSON results and agreement scores for a task ID."""
        return self._client._request("GET", f"/tasks/{task_id}/results")

    def register_webhook(self, task_id: str, webhook_url: str) -> Dict[str, Any]:
        """Registers a completion webhook callback URL for a task ID."""
        payload = {"webhook_url": webhook_url}
        return self._client._request("POST", f"/tasks/{task_id}/webhook", data=payload)
