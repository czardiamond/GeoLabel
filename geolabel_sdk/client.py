import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

from geolabel_sdk.exceptions import APIError, AuthenticationError, GeoLabelError, NotFoundError


class GeoLabelClient:
    """HTTP client for GeoLabel.

    Use ``api_key`` for creating and inspecting tasks. Supply the optional
    per-annotator key as ``annotator_api_key`` when submitting annotations.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "http://localhost:8000",
        annotator_api_key: Optional[str] = None,
    ):
        if not api_key and not annotator_api_key:
            raise AuthenticationError("Provide a service API key or annotator API key.")
        self.api_key = api_key
        self.annotator_api_key = annotator_api_key
        self.base_url = base_url.rstrip("/")
        from geolabel_sdk.tasks import TasksResource
        self.tasks = TasksResource(self)

    def _request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        annotator_api_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "GeoLabel-Python-SDK/1.1.0",
        }
        if annotator_api_key:
            headers["X-Annotator-API-Key"] = annotator_api_key
        elif self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        else:
            raise AuthenticationError("This operation requires a service API key.")

        body = json.dumps(data).encode("utf-8") if data is not None else None
        request = urllib.request.Request(url, data=body, headers=headers, method=method.upper())
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw_body = response.read().decode("utf-8")
                return json.loads(raw_body) if raw_body else {}
        except urllib.error.HTTPError as exc:
            response_body = exc.read().decode("utf-8", "replace") if exc.fp else ""
            if exc.code == 401:
                raise AuthenticationError(f"Unauthorized: {response_body}") from exc
            if exc.code == 404:
                raise NotFoundError(f"Resource not found at {endpoint}: {response_body}") from exc
            raise APIError(
                f"API HTTP {exc.code} Error: {response_body}",
                status_code=exc.code,
                response_body=response_body,
            ) from exc
        except urllib.error.URLError as exc:
            raise APIError(f"Failed to connect to GeoLabel API at {self.base_url}: {exc.reason}") from exc
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise GeoLabelError(f"GeoLabel API returned an invalid response: {exc}") from exc
        except Exception as exc:
            raise GeoLabelError(f"Unexpected error executing SDK request: {exc}") from exc

    def __repr__(self) -> str:
        return f"<GeoLabelClient base_url='{self.base_url}'>"


__all__ = ["GeoLabelClient"]
