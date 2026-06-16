"""
Authentication middleware — Firebase token verification and role resolution.

User roles are NEVER accepted from the client request body.
Roles are resolved server-side from the governed user store.
"""

from fastapi import Header, HTTPException
from pydantic import BaseModel
import firebase_admin
from firebase_admin import auth as firebase_auth

from app.config import settings
from app.auth.user_store import get_user_from_store

# Initialize Firebase Admin SDK (uses ADC in Cloud Run)
if not firebase_admin._apps:
    firebase_admin.initialize_app()


class AuthenticatedUser(BaseModel):
    """Verified user context resolved from the Firebase token + user store."""
    user_id: str
    role: str
    tenant_id: str
    email: str


def verify_firebase_token(token: str) -> AuthenticatedUser:
    """
    Verify a Firebase ID token and resolve the user's role
    from the governed user store in BigQuery.

    Returns:
        AuthenticatedUser with server-resolved role and tenant.

    Raises:
        HTTPException 401: Invalid or expired token.
        HTTPException 403: User not registered in DataPilot.
    """
    try:
        decoded = firebase_auth.verify_id_token(token)
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token.",
        )

    uid = decoded.get("uid")
    email = decoded.get("email", "")

    # Resolve role from governed user store — NOT from the request
    user_record = get_user_from_store(uid)

    if not user_record:
        raise HTTPException(
            status_code=403,
            detail="User not registered in DataPilot. Contact your administrator.",
        )

    return AuthenticatedUser(
        user_id=uid,
        role=user_record["role"],
        tenant_id=user_record["tenant_id"],
        email=email,
    )


def get_authenticated_user(
    authorization: str = Header(None, alias="Authorization"),
) -> AuthenticatedUser:
    """
    FastAPI dependency that extracts and validates the Firebase ID token
    from the Authorization header.

    Usage:
        @router.post("/query")
        async def run_query(user: AuthenticatedUser = Depends(get_authenticated_user)):
            ...
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header. Expected: Bearer <token>",
        )

    token = authorization.removeprefix("Bearer ").strip()
    if settings.ALLOW_MOCK_AUTH and token == "test-mock-token":
        return AuthenticatedUser(
            user_id="test-user-id",
            role="admin",
            tenant_id="tenant_1",
            email="admin@example.com",
        )

    return verify_firebase_token(token)
