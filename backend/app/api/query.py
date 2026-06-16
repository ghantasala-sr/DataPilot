"""
Query endpoint — the core of DataPilot.

Accepts a natural-language question and returns a governed,
validated, explainable answer with the generated SQL.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth.middleware import get_authenticated_user, AuthenticatedUser
from app.orchestrator.query import orchestrator

router = APIRouter()


# ─── Request / Response Models ────────────────────────────────

class QueryRequest(BaseModel):
    """Natural-language question from the client."""
    question: str


class QueryResponse(BaseModel):
    """Full query response including SQL, assumptions, and metadata."""
    status: str = "success"
    query_id: str
    answer: str
    sql: str
    sql_generated: str = ""
    metric_used: str | None = None
    assumptions: list[str] = Field(default_factory=list)
    freshness: dict | None = None
    fallback_used: bool = False
    fallback_type: str | None = None
    execution_time_ms: int = 0
    bytes_processed: int = 0
    estimated_cost_usd: float = 0.0
    rows_returned: int = 0
    rows: list[dict] = Field(default_factory=list)
    results_summary: str = ""
    message: str | None = None
    intent: str | None = None


# ─── Endpoint ─────────────────────────────────────────────────

@router.post("/query", response_model=QueryResponse)
async def run_query(
    request: QueryRequest,
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """
    Process a natural-language analytics question.

    Lifecycle:
    1. Classify intent
    2. Resolve semantic context (metrics, joins, policies)
    3. Generate SQL via Gemini or template
    4. Validate SQL (guardrails, PII, cost)
    5. Execute against BigQuery
    6. Explain result
    7. Log to observability tables
    """
    result = orchestrator.process_query(
        request.question,
        {
            "user_id": user.user_id,
            "role": user.role,
            "tenant_id": user.tenant_id,
            "email": user.email,
        },
    )
    return QueryResponse(**result)
