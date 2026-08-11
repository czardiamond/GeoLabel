class GeoLabelError(Exception):
    """Base exception for all GeoLabel SDK errors."""
    pass

class AuthenticationError(GeoLabelError):
    """Raised when API key is invalid or unauthorized (HTTP 401)."""
    pass

class NotFoundError(GeoLabelError):
    """Raised when task or resource is not found (HTTP 404)."""
    pass

class APIError(GeoLabelError):
    """Raised for general API errors (HTTP 4xx / 5xx)."""
    def __init__(self, message: str, status_code: int = None, response_body: str = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body
