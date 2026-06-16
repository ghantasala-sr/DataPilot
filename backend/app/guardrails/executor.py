from typing import Any, Tuple
from google.cloud import bigquery
import os

class QueryExecutor:
    """Executes validated BigQuery SQL safely."""
    
    def __init__(self):
        self._bq_client = None
        self.max_bytes_processed = int(os.environ.get("MAX_BYTES_PROCESSED", 10737418240)) # Default 10GB

    @property
    def bq_client(self):
        if self._bq_client is None:
            self._bq_client = bigquery.Client()
        return self._bq_client

    def execute(self, sql: str) -> Tuple[bool, Any, str]:
        """Execute the query safely with hard limits."""
        
        job_config = bigquery.QueryJobConfig(
            maximum_bytes_billed=self.max_bytes_processed
        )
        
        try:
            query_job = self.bq_client.query(sql, job_config=job_config)
            
            # Fetch results
            results = [dict(row) for row in query_job.result()]
            
            # Simple summary for the LLM
            if not results:
                summary = "The query returned no results."
            elif len(results) == 1:
                summary = f"Result: {results[0]}"
            else:
                summary = f"Returned {len(results)} rows. First row: {results[0]}"
                
            return True, results, summary
            
        except Exception as e:
            print(f"Query execution failed: {e}")
            return False, None, str(e)

executor = QueryExecutor()
