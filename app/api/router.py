from fastapi import APIRouter
from app.api.health import router as health_router
from app.api.audit import router as audit_router
from app.api.agent_simulator import router as simulator_router

api_router = APIRouter()

api_router.include_router(health_router)
api_router.include_router(audit_router)
api_router.include_router(simulator_router)
