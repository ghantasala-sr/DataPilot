"""
User store — looks up user roles and tenant from the governed BigQuery table.

This ensures that roles are NEVER self-declared by the client.
"""

from google.cloud import bigquery

from app.config import settings


def get_user_from_store(uid: str) -> dict | None:
    """
    Look up user role and tenant_id from the governed user store in BigQuery.

    Args:
        uid: The Firebase UID of the authenticated user.

    Returns:
        dict with 'role' and 'tenant_id', or None if user not found / inactive.
    """
    client = bigquery.Client(project=settings.PROJECT_ID)

    query = f"""
        SELECT user_id, role, tenant_id
        FROM `{settings.PROJECT_ID}.{settings.SEMANTIC_DATASET}.user_accounts`
        WHERE user_id = @uid
        LIMIT 1
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("uid", "STRING", uid),
        ]
    )

    try:
        rows = list(client.query(query, job_config=job_config).result())
    except Exception:
        # If BigQuery is unreachable, deny access
        return None

    if not rows:
        return None

    row = dict(rows[0])
    return {"role": row["role"], "tenant_id": row["tenant_id"]}
