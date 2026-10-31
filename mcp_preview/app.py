"""Preview-only remote MCP app; the sole MCP route is protected by a bearer key."""
from __future__ import annotations

import os
import secrets
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI
from starlette.types import ASGIApp, Message, Receive, Scope, Send
from mcp.server.transport_security import TransportSecuritySettings

from geolabel_mcp.server import MAX_TOOL_PAYLOAD_BYTES, build_server

API_KEY_ENV = "GEOLABEL_MCP_API_KEY"
MIN_API_KEY_LENGTH = 32


def _allowed_hosts() -> list[str]:
    hosts: set[str] = set()
    if os.environ.get("VERCEL") != "1":
        hosts.update({
            "localhost",
            "localhost:*",
            "127.0.0.1",
            "127.0.0.1:*",
            "[::1]",
            "[::1]:*",
        })
    for name in ("VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"):
        value = os.environ.get(name, "").strip()
        if not value:
            continue
        candidate = value if "://" in value else f"https://{value}"
        host = urlsplit(candidate).netloc
        if host:
            hosts.add(host.lower())
    extra_hosts = os.environ.get("GEOLABEL_MCP_ALLOWED_HOSTS", "")
    hosts.update(host.strip().lower() for host in extra_hosts.split(",") if host.strip())
    return sorted(hosts)


def _allowed_origins() -> list[str]:
    value = os.environ.get("GEOLABEL_MCP_ALLOWED_ORIGINS", "")
    return sorted({origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()})


class BearerAuthMiddleware:
    """Protect only the MCP HTTP path; keep responses private and uncached."""

    def __init__(self, app: ASGIApp, expected_token: str | None) -> None:
        self.app = app
        self.expected_token = expected_token

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path") != "/mcp":
            await self.app(scope, receive, send)
            return

        token = self.expected_token
        if not token or len(token) < MIN_API_KEY_LENGTH or token.strip() != token:
            await self._respond(send, 503, {"error": "MCP bearer authentication is not configured"})
            return

        raw_headers = scope.get("headers", [])
        authorization_values = [value for name, value in raw_headers if name.lower() == b"authorization"]
        authorization = authorization_values[0] if len(authorization_values) == 1 else b""
        try:
            header_value = authorization.decode("ascii")
        except UnicodeDecodeError:
            header_value = ""
        scheme, separator, candidate = header_value.partition(" ")
        valid = (
            bool(separator)
            and scheme.casefold() == "bearer"
            and 0 < len(candidate) <= 512
            and secrets.compare_digest(candidate, token)
        )
        if not valid:
            await self._respond(
                send,
                401,
                {"error": "Unauthorized"},
                extra_headers=[(b"www-authenticate", b'Bearer realm="GeoLabel MCP"')],
            )
            return

        async def private_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                private_headers = {b"cache-control", b"x-content-type-options"}
                headers = [
                    (name, value)
                    for name, value in message.get("headers", [])
                    if name.lower() not in private_headers
                ]
                headers.extend([
                    (b"cache-control", b"no-store"),
                    (b"x-content-type-options", b"nosniff"),
                ])
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, private_send)

    @staticmethod
    async def _respond(
        send: Send,
        status_code: int,
        payload: dict[str, str],
        extra_headers: list[tuple[bytes, bytes]] | None = None,
    ) -> None:
        import json

        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers = [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode("ascii")),
            (b"cache-control", b"no-store"),
            (b"x-content-type-options", b"nosniff"),
        ]
        if extra_headers:
            headers.extend(extra_headers)
        await send({"type": "http.response.start", "status": status_code, "headers": headers})
        await send({"type": "http.response.body", "body": body})


def create_app(
    *,
    api_key: str | None = None,
    allowed_hosts: list[str] | None = None,
    allowed_origins: list[str] | None = None,
) -> FastAPI:
    """Build the small remote MCP app; a missing or short key fails closed."""
    server = build_server()
    security = TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=_allowed_hosts() if allowed_hosts is None else allowed_hosts,
        allowed_origins=_allowed_origins() if allowed_origins is None else allowed_origins,
    )
    mcp_app = server.streamable_http_app(
        streamable_http_path="/mcp",
        json_response=True,
        stateless_http=True,
        max_request_body_size=MAX_TOOL_PAYLOAD_BYTES + 65_536,
        transport_security=security,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        async with mcp_app.router.lifespan_context(mcp_app):
            yield

    web_app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    token = os.environ.get(API_KEY_ENV) if api_key is None else api_key
    web_app.add_middleware(BearerAuthMiddleware, expected_token=token)
    web_app.mount("/", mcp_app)
    return web_app


app = create_app()
