from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.config import settings

router = APIRouter(tags=["Health Check"])


@router.get("/health", summary="System Health Probe")
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Primary Health Probe for AWS Application Load Balancers and Monitoring Systems.
    """
    db_status = "healthy"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    groq_status = "configured" if settings.GROQ_API_KEY else "fallback_mode"
    is_healthy = db_status == "healthy"

    return {
        "status": "healthy" if is_healthy else "degraded",
        "app_name": settings.APP_NAME,
        "version": "1.0.0",
        "environment": settings.APP_ENV,
        "database": db_status,
        "llm_service": groq_status,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/health/database", summary="Database Connection Probe")
async def db_health_check(db: AsyncSession = Depends(get_db)):
    """
    Dedicated database health check endpoint.
    """
    try:
        await db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database_engine": "async",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database connection failed: {str(e)}"
        )


@router.get("/health/llm", summary="LLM Service Probe")
async def llm_health_check():
    """
    Dedicated LLM configuration health check endpoint.
    """
    is_configured = bool(settings.GROQ_API_KEY)
    return {
        "status": "configured" if is_configured else "fallback_mode",
        "model": settings.GROQ_MODEL,
        "provider": "Groq",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
