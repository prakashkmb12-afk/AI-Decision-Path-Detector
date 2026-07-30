import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.api.router import api_router
from app.core.exceptions import AuditBaseException, audit_exception_handler, generic_exception_handler

# Configure Logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("audit.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context managing database startup and shutdown."""
    logger.info("Initializing PS-7.1 Decision Path Auditor application...")
    await init_db()
    yield
    logger.info("Shutting down Decision Path Auditor application...")


app = FastAPI(
    title=settings.APP_NAME,
    description="Production-Ready AI Governance Audit Engine - PS-7.1 Decision Path Auditor",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Exception Handlers
app.add_exception_handler(AuditBaseException, audit_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# Include API Routers
app.include_router(api_router)

# Mount Static Files for Dashboard UI
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
