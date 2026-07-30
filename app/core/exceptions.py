from fastapi import Request, status
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger("audit.exceptions")


class AuditBaseException(Exception):
    """Base exception class for Audit Auditor application."""
    def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class SessionNotFoundException(AuditBaseException):
    def __init__(self, session_id: str):
        super().__init__(
            message=f"Audit session '{session_id}' not found.",
            status_code=status.HTTP_404_NOT_FOUND
        )


class UnauthorizedException(AuditBaseException):
    def __init__(self, message: str = "Invalid or missing API key"):
        super().__init__(
            message=message,
            status_code=status.HTTP_401_UNAUTHORIZED
        )


async def audit_exception_handler(request: Request, exc: AuditBaseException):
    logger.error(f"Audit Exception on {request.url.path}: {exc.message}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.__class__.__name__,
            "message": exc.message,
            "path": str(request.url.path)
        }
    )


async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled Exception on {request.url.path}: {str(exc)}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "InternalServerError",
            "message": "An unexpected error occurred while processing the audit log.",
            "details": str(exc)
        }
    )
