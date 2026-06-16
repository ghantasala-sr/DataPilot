"""
Feedback endpoint — captures user ratings on query results.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.middleware import get_authenticated_user, AuthenticatedUser

router = APIRouter()


class FeedbackRequest(BaseModel):
    """User feedback on a query result."""
    query_id: str
    rating: int  # 1-5
    comment: str = ""


class FeedbackResponse(BaseModel):
    """Confirmation of recorded feedback."""
    feedback_id: str
    status: str


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(
    request: FeedbackRequest,
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """
    Record user feedback on a query result.

    Feedback is written to datapilot_observability.user_feedback
    and used to improve query quality over time.
    """
    # TODO: Write to BigQuery observability tables in Phase 7
    return FeedbackResponse(
        feedback_id="placeholder",
        status="recorded",
    )
