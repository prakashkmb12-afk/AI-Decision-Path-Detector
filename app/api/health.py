from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.config import settings

router = APIRouter(tags=["Health Check"])


@router.get("/health", summary="System & Database Health Probe")
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Health Probe for Cloud Load Balancers and ECS readiness probes.
    Verifies:
    1. FastAPI app status
    2. PostgreSQL / Database connectivity
    3. Groq LLM API configuration status
    """
    db_status = "healthy"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    groq_status = "configured" if settings.GROQ_API_KEY else "api_key_missing_fallback_mode"

    return {
        "status": "healthy" if db_status == "healthy" else "degraded",
        "app_name": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "database": db_status,
        "groq_llm": groq_status,
    }
