import json
import urllib.request
import urllib.error
from typing import Dict, Any, Optional
from geolabel_sdk.exceptions import GeoLabelError, AuthenticationError, NotFoundError, APIError

class GeoLabelClient:
    """
    Official Python SDK Client for GeoLabel Specialist Annotation API.
    
    Usage:
        client = GeoLabelClient(api_key="gl_live_...", base_url="https://your-deployed-app.up.railway.app")
        task = client.tasks.create(raster_uri="s3://...", taxonomy=["building_footprint"])
        print(task.status())
        geojson = task.download_results(format="geojson")
    """

    def __init__(self, api_key: str, base_url: str = "http://localhost:8000"):
        if not api_key:
            raise AuthenticationError("API key must be provided when initializing GeoLabelClient.")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

        # Lazy import of TasksResource to avoid circular dependencies
        from geolabel_sdk.tasks import TasksResource
        self.tasks = TasksResource(self)

    def _request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Executes HTTP requests with Bearer token authentication."""
        url = f"{self.base_url}{endpoint}"
        
        if params:
            query_str = urllib.parse.urlencode(params)
            url = f"{url}?{query_str}"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "GeoLabel-Python-SDK/1.0.0"
        }

        json_bytes = json.dumps(data).encode("utf-8") if data is not None else None
        req = urllib.request.Request(url, data=json_bytes, headers=headers, method=method.upper())

        try:
            with urllib.request.urlopen(req) as response:
                body = response.read().decode("utf-8")
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            body_text = e.read().decode("utf-8") if e.fp else ""
            if e.code == 401:
                raise AuthenticationError(f"Unauthorized: Invalid API key ({body_text})")
            elif e.code == 404:
                raise NotFoundError(f"Resource not found at {endpoint}: {body_text}")
            else:
                raise APIError(f"API HTTP {e.code} Error: {body_text}", status_code=e.code, response_body=body_text)
        except urllib.error.URLError as e:
            raise APIError(f"Failed to connect to GeoLabel API at {self.base_url}: {str(e.reason)}")
        except Exception as e:
            raise GeoLabelError(f"Unexpected error executing SDK request: {str(e)}")
