"""
Health check endpoint.

Provides basic liveness and readiness probes for Cloud Run.
"""

from fastapi import APIRouter

from app.config import settings
from app.semantic.resolver import resolver

router = APIRouter()


@router.get("/health")
async def health_check():
    """Basic health check for liveness probes."""
    return {
        "status": "healthy",
        "service": "datapilot-api",
        "version": "1.0.0",
    }


@router.get("/health/ready")
async def readiness_check():
    """Readiness check for locally verifiable dependencies."""
    semantic_ready = bool(resolver.list_terms()) and bool(resolver.list_metrics())
    checks = {
        "semantic_layer": "ok" if semantic_ready else "missing_config",
        "bigquery": "configured" if settings.PROJECT_ID else "not_configured",
        "gemini": "configured" if settings.GEMINI_MODEL else "not_configured",
    }

    all_healthy = checks["semantic_layer"] == "ok"

    return {
        "status": "ready" if all_healthy else "degraded",
        "checks": checks,
    }
