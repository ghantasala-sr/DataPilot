"""
DataPilot API — GCP-Native Ontology-Aware AI Query System

Main FastAPI application entry point.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.query import router as query_router
from app.api.feedback import router as feedback_router
from app.api.semantic import router as semantic_router
from app.config import settings

app = FastAPI(
    title="DataPilot API",
    description=(
        "GCP-native ontology-aware AI query system for governed analytics. "
        "Converts natural-language business questions into validated, "
        "explainable SQL over BigQuery analytics marts."
    ),
    version="1.0.0",
)

# ─── CORS ─────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────
app.include_router(health_router, prefix="/api", tags=["Health"])
app.include_router(query_router, prefix="/api", tags=["Query"])
app.include_router(feedback_router, prefix="/api", tags=["Feedback"])
app.include_router(semantic_router, prefix="/api", tags=["Semantic"])
