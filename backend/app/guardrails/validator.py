import sqlglot
import re
from typing import Dict, Any, Tuple
from google.cloud import bigquery

class SecurityValidator:
    """Validates and sanitizes generated SQL before execution."""
    
    def __init__(self):
        self._bq_client = None

    @property
    def bq_client(self):
        if self._bq_client is None:
            self._bq_client = bigquery.Client()
        return self._bq_client

    def parse_sql(self, sql: str) -> bool:
        """Check if SQL is syntactically valid."""
        try:
            sqlglot.parse_one(sql, read="bigquery")
            return True
        except sqlglot.errors.ParseError as e:
            print(f"SQL parsing error: {e}")
            return False

    def validate_safety(self, sql: str, policy: str) -> Tuple[bool, str]:
        """Check if SQL violates any security rules (e.g. DROP, DELETE)."""
        upper_sql = sql.upper()
        
        # Prevent destructive operations
        forbidden_keywords = ["DROP", "DELETE", "UPDATE", "INSERT", "TRUNCATE", "MERGE", "ALTER", "GRANT", "REVOKE"]
        for keyword in forbidden_keywords:
            if re.search(rf"\b{keyword}\b", upper_sql):
                return False, f"Forbidden operation detected: {keyword}. Only SELECT queries are allowed."

        # Very basic check for specific policy rules
        # In a real app, use sqlglot to walk the AST and enforce row-level security
        if "RESTRICT_PII" in policy and re.search(r"\b(EMAIL|PHONE|SSN|CREDIT_CARD)\b", upper_sql):
            return False, "Query attempts to access restricted PII fields based on user policy."
            
        return True, "Valid"

    def estimate_cost(self, sql: str) -> Dict[str, Any]:
        """Perform a BigQuery dry run to estimate bytes processed."""
        job_config = bigquery.QueryJobConfig(dry_run=True, use_query_cache=False)
        
        try:
            query_job = self.bq_client.query(sql, job_config=job_config)
            
            bytes_processed = query_job.total_bytes_processed
            
            # BigQuery cost: ~$6.25 per TB (as of 2024, adjust as needed)
            cost_usd = (bytes_processed / (1024**4)) * 6.25 if bytes_processed else 0.0
            
            return {
                "safe": True,
                "bytes_processed": bytes_processed,
                "estimated_cost_usd": cost_usd
            }
        except Exception as e:
            print(f"BigQuery dry run failed: {e}")
            return {
                "safe": False,
                "error": str(e)
            }

validator = SecurityValidator()
