"""Explicitly gated, human-reviewable image inference for GeoLabel tasks.

This module performs no network request unless the deployment has enabled the
provider, allowlisted its exact HTTPS host, approved data transfer and spend,
and the task request carries both explicit user confirmations.
"""
from __future__ import annotations

import base64
import http.client
import ipaddress
from io import BytesIO
import json
import math
import re
import ssl
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit

import pyproj
from affine import Affine
from PIL import Image
from shapely.geometry import shape

from backend.config import settings

MAX_IMAGE_BYTES = 20_000_000
MAX_PROVIDER_RESPONSE_BYTES = 2_000_000
MAX_PROVIDER_FEATURES = 200
MAX_PROVIDER_COORDINATES = 50_000
SUPPORTED_GEOMETRIES = {"Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"}


@dataclass(frozen=True)
class ProviderConfig:
    base_url: str
    host: str
    model: str
    api_key: str


def _allowed_hosts() -> set[str]:
    return {host.strip().lower().rstrip(".") for host in settings.INFERENCE_ALLOWED_HOSTS.split(",") if host.strip()}


def _provider_config() -> tuple[ProviderConfig | None, str | None]:
    raw_url = settings.INFERENCE_PROVIDER_BASE_URL.strip()
    model = settings.INFERENCE_MODEL.strip()
    key = settings.INFERENCE_API_KEY.strip()
    if not settings.INFERENCE_ENABLED:
        return None, "provider_disabled"
    if not raw_url or not model or not key:
        return None, "provider_configuration_incomplete"
    if len(raw_url) > 2_048 or len(model) > 160 or len(key) > 4_096:
        return None, "provider_configuration_too_long"
    try:
        parsed = urlsplit(raw_url)
        host = (parsed.hostname or "").lower().rstrip(".")
        port = parsed.port
    except ValueError:
        return None, "provider_url_invalid"
    if (parsed.scheme.lower() != "https" or not host or parsed.username or parsed.password
            or parsed.query or parsed.fragment or port not in (None, 443)):
        return None, "provider_url_not_allowed"
    if host not in _allowed_hosts():
        return None, "provider_host_not_allowlisted"
    base_url = raw_url.rstrip("/")
    if not base_url:
        return None, "provider_url_invalid"
    return ProviderConfig(base_url=base_url, host=host, model=model, api_key=key), None


def get_inference_status() -> dict:
    config, config_error = _provider_config()
    transfer_approved = bool(settings.INFERENCE_DATA_TRANSFER_APPROVED)
    spend_approved = bool(settings.INFERENCE_SPEND_APPROVED)
    available = bool(config and transfer_approved and spend_approved)
    if not config:
        reason = config_error or "provider_configuration_incomplete"
    elif not transfer_approved:
        reason = "data_transfer_not_approved"
    elif not spend_approved:
        reason = "provider_spend_not_approved"
    else:
        reason = None
    return {
        "available": available,
        "provider_configured": config is not None,
        "model_configured": bool(config and config.model),
        "provider": config.host if config else None,
        "model": config.model if config else None,
        "external_data_transfer": transfer_approved,
        "provider_spend_approved": spend_approved,
        "human_review_required": True,
        "requires_per_request_data_transfer_confirmation": True,
        "requires_per_request_cost_confirmation": True,
        "reason_code": reason,
        "message": (
            "Provider suggestions can be requested only after the deployment has explicitly approved this provider, "
            "external image transfer, and provider spend, and the contributor confirms both for this task. "
            "Every result is stored as a pending candidate and requires human review."
            if available else
            "AI suggestions are unavailable. No inference request is made and no task imagery is sent unless an "
            "HTTPS provider with an exact allowlisted host, model credentials, deployment approvals for image "
            "transfer and provider spend, and per-task contributor confirmations are all present."
        ),
    }


def require_inference_authorization(*, confirm_data_transfer: bool, confirm_provider_costs: bool) -> ProviderConfig:
    config, error = _provider_config()
    if not config:
        raise PermissionError(error or "provider_configuration_incomplete")
    if not settings.INFERENCE_DATA_TRANSFER_APPROVED:
        raise PermissionError("data_transfer_not_approved")
    if not settings.INFERENCE_SPEND_APPROVED:
        raise PermissionError("provider_spend_not_approved")
    if not confirm_data_transfer:
        raise PermissionError("task_data_transfer_confirmation_required")
    if not confirm_provider_costs:
        raise PermissionError("task_provider_cost_confirmation_required")
    return config


def _resolve_public_provider_dns(host: str) -> tuple[str, ...]:
    try:
        addresses = {record[4][0] for record in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
    except OSError as exc:
        raise ValueError("The configured provider hostname could not be resolved.") from exc
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError("The configured inference provider must resolve only to public IP addresses.")
    return tuple(sorted(addresses, key=lambda address: (ipaddress.ip_address(address).version, address)))


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """Connect to one validated numeric address while verifying TLS for the configured hostname."""
    def __init__(self, hostname: str, address: str, timeout: float):
        numeric_address = ipaddress.ip_address(address)
        if not numeric_address.is_global:
            raise ValueError("The configured inference provider must resolve only to public IP addresses.")
        super().__init__(hostname, port=443, timeout=timeout, context=ssl.create_default_context())
        self._pinned_address = str(numeric_address)

    def connect(self) -> None:
        raw_socket = socket.create_connection((self._pinned_address, self.port), timeout=self.timeout)
        raw_socket.settimeout(self.timeout)
        self.sock = self._context.wrap_socket(raw_socket, server_hostname=self.host)


def _post_pinned_provider_request(hostname: str, address: str, path: str, api_key: str,
                                  request_body: dict, timeout_seconds: int) -> bytes:
    payload = json.dumps(request_body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    connection = _PinnedHTTPSConnection(hostname, address, float(timeout_seconds))
    try:
        host_header = f"[{hostname}]" if ":" in hostname else hostname
        connection.request("POST", path, body=payload, headers={
            "Host": host_header,
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Connection": "close",
        })
        response = connection.getresponse()
        if not 200 <= response.status < 300:
            # Do not expose provider response bodies; they may contain task or prompt data.
            raise RuntimeError("The configured inference provider request failed.")
        response_bytes = bytearray()
        while True:
            chunk = response.read(min(65_536, MAX_PROVIDER_RESPONSE_BYTES - len(response_bytes) + 1))
            if not chunk:
                break
            if len(response_bytes) + len(chunk) > MAX_PROVIDER_RESPONSE_BYTES:
                raise ValueError(f"Provider response exceeds the {MAX_PROVIDER_RESPONSE_BYTES}-byte safety limit.")
            response_bytes.extend(chunk)
        return bytes(response_bytes)
    except (OSError, http.client.HTTPException, ssl.SSLError) as exc:
        raise RuntimeError("The configured inference provider request failed.") from exc
    finally:
        connection.close()


def _response_text(body: dict) -> str:
    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError("Provider response did not contain a supported chat-completion result.") from exc
    if isinstance(content, list):
        content = "\n".join(item.get("text", "") for item in content if isinstance(item, dict))
    if not isinstance(content, str) or not content.strip():
        raise ValueError("Provider response was empty.")
    text = content.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    return fenced.group(1) if fenced else text


def request_provider_suggestions(image_bytes: bytes, *, config: ProviderConfig,
                                 taxonomy: list[str], width: int, height: int,
                                 affine_transform: list[float] | tuple[float, ...] | None,
                                 bounds: list[float] | tuple[float, ...] | None,
                                 source_crs: str) -> dict:
    """Send one confirmed PNG preview to the configured OpenAI-compatible vision endpoint."""
    if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
        raise ValueError(f"Provider preview must be present and no larger than {MAX_IMAGE_BYTES} bytes.")
    if width <= 0 or height <= 0 or width * height > 100_000_000:
        raise ValueError("Source image dimensions are invalid for suggestion conversion.")
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            if image.format != "PNG" or image.width <= 0 or image.height <= 0:
                raise ValueError("The configured task preview is not a usable PNG image.")
            preview_width, preview_height = image.size
    except (OSError, ValueError) as exc:
        raise ValueError("The configured task preview is not a readable PNG image.") from exc
    if not math.isclose(preview_width / preview_height, width / height, rel_tol=1e-4, abs_tol=1e-4):
        raise ValueError("The task preview and source image aspect ratios do not match; refusing inexact georeferencing.")
    # Validate affine/bounds and CRS before sending the image or incurring provider charges.
    normalize_pixel_suggestions(
        {"features": []}, taxonomy=taxonomy, width=width, height=height,
        affine_transform=affine_transform, bounds=bounds, source_crs=source_crs,
    )
    provider_addresses = _resolve_public_provider_dns(config.host)

    system_message = (
        "You are proposing geospatial image annotation candidates, not final labels. "
        "Return only strict JSON: {\"features\":[{\"category\":<one exact allowed label>,"
        "\"geometry\":{\"type\":<GeoJSON geometry type>,\"coordinates\":...}}]}. "
        "Coordinates must be normalized pixel-edge x,y pairs in [0,1], with origin at the image top-left. "
        "Use only Point, MultiPoint, LineString, MultiLineString, Polygon, or MultiPolygon. "
        "Do not return confidence, CRS, properties, explanations, or markdown. Return an empty features array "
        "when no defensible candidate is visible. These are fallible suggestions and must be checked by a human."
    )
    user_message = (
        f"Allowed exact category labels: {json.dumps(taxonomy, ensure_ascii=False)}. "
        f"Preview dimensions: {preview_width} by {preview_height}; source dimensions: {width} by {height}. "
        "Suggest visible objects only."
    )
    request_body = {
        "model": config.model,
        "temperature": 0,
        "max_tokens": 4096,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_message},
            {"role": "user", "content": [
                {"type": "text", "text": user_message},
                {"type": "image_url", "image_url": {
                    "url": "data:image/png;base64," + base64.b64encode(image_bytes).decode("ascii"),
                    "detail": "high",
                }},
            ]},
        ],
    }
    endpoint = f"{config.base_url}/chat/completions"
    try:
        timeout_seconds = max(1, min(int(settings.INFERENCE_REQUEST_TIMEOUT_SECONDS), 120))
        parsed_endpoint = urlsplit(endpoint)
        if parsed_endpoint.scheme != "https" or parsed_endpoint.hostname != config.host or parsed_endpoint.port not in (None, 443):
            raise ValueError("The configured provider endpoint does not match its approved HTTPS host.")
        response_bytes = _post_pinned_provider_request(
            config.host, provider_addresses[0], parsed_endpoint.path or "/",
            config.api_key, request_body, timeout_seconds,
        )
    except (OSError, http.client.HTTPException, ssl.SSLError) as exc:
        # Never surface response bodies, which can contain provider or prompt data.
        raise RuntimeError("The configured inference provider request failed.") from exc
    try:
        body = json.loads(response_bytes)
        decoded = json.loads(_response_text(body))
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        raise ValueError("Provider response was not valid supported GeoLabel suggestion JSON.") from exc
    return normalize_pixel_suggestions(
        decoded, taxonomy=taxonomy, width=width, height=height,
        affine_transform=affine_transform, bounds=bounds, source_crs=source_crs,
    )


def _coordinate_to_asset_crs(value, affine: Affine, width: int, height: int, counter: list[int]):
    if not isinstance(value, (list, tuple)):
        raise ValueError("Provider geometry coordinates must be nested numeric arrays.")
    if len(value) >= 2 and all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in value[:2]):
        x, y = float(value[0]), float(value[1])
        if not math.isfinite(x) or not math.isfinite(y) or not 0 <= x <= 1 or not 0 <= y <= 1:
            raise ValueError("Provider coordinates must be finite normalized pixel-edge values in [0,1].")
        counter[0] += 1
        if counter[0] > MAX_PROVIDER_COORDINATES:
            raise ValueError("Provider response contains too many geometry coordinates.")
        gx, gy = affine @ (x * width, y * height)
        return [gx, gy]
    return [_coordinate_to_asset_crs(item, affine, width, height, counter) for item in value]


def normalize_pixel_suggestions(payload: dict, *, taxonomy: list[str], width: int, height: int,
                                affine_transform: list[float] | tuple[float, ...] | None = None,
                                bounds: list[float] | tuple[float, ...] | None = None,
                                source_crs: str = "EPSG:4326") -> dict:
    """Validate provider pixel geometry and map pixel-edge coordinates through the asset affine."""
    if width <= 0 or height <= 0 or width * height > 100_000_000:
        raise ValueError("Source image dimensions are invalid for suggestion conversion.")
    if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
        raise ValueError("Provider response must contain a features array.")
    features = payload["features"]
    if len(features) > MAX_PROVIDER_FEATURES:
        raise ValueError(f"Provider response exceeds the {MAX_PROVIDER_FEATURES}-feature limit.")
    if affine_transform is not None:
        if len(affine_transform) != 6 or not all(math.isfinite(float(item)) for item in affine_transform):
            raise ValueError("Asset affine transform must contain six finite coefficients.")
        a, b, c, d, e, f = (float(item) for item in affine_transform)
        if abs(a * e - b * d) < 1e-15:
            raise ValueError("Asset affine transform is singular.")
        affine = Affine(a, b, c, d, e, f)
    else:
        if not bounds or len(bounds) != 4:
            raise ValueError("Asset has no usable affine transform or georeferenced bounds.")
        xmin, ymin, xmax, ymax = map(float, bounds)
        if not all(math.isfinite(item) for item in (xmin, ymin, xmax, ymax)) or xmin >= xmax or ymin >= ymax:
            raise ValueError("Asset bounds are not valid for suggestion conversion.")
        affine = Affine((xmax - xmin) / width, 0, xmin, 0, -(ymax - ymin) / height, ymax)
    try:
        pyproj.CRS.from_user_input(source_crs)
    except Exception as exc:
        raise ValueError("Asset CRS is invalid for suggestion conversion.") from exc

    result = []
    total_coordinates = [0]
    allowed_labels = set(taxonomy)
    for index, candidate in enumerate(features):
        if not isinstance(candidate, dict) or candidate.get("category") not in allowed_labels:
            raise ValueError(f"Provider feature {index} must use one exact task taxonomy label.")
        geometry = candidate.get("geometry")
        if not isinstance(geometry, dict) or geometry.get("type") not in SUPPORTED_GEOMETRIES:
            raise ValueError(f"Provider feature {index} has an unsupported geometry type.")
        coordinates = _coordinate_to_asset_crs(geometry.get("coordinates"), affine, width, height, total_coordinates)
        converted = {"type": geometry["type"], "coordinates": coordinates}
        try:
            parsed_geometry = shape(converted)
        except Exception as exc:
            raise ValueError(f"Provider feature {index} has invalid geometry coordinates.") from exc
        if parsed_geometry.is_empty or not parsed_geometry.is_valid:
            raise ValueError(f"Provider feature {index} is empty or geometrically invalid.")
        result.append({"type": "Feature", "properties": {"category": candidate["category"], "suggestion": True},
                       "geometry": converted})
    return {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": pyproj.CRS.from_user_input(source_crs).to_string()}},
        "features": result,
    }
