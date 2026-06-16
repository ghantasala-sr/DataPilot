import re
import time
import uuid
from typing import Any

from app.ai.prompts import build_intent_prompt, build_sql_prompt, build_explanation_prompt
from app.ai.gemini import gemini_client
from app.config import settings
from app.semantic.resolver import resolver
from app.guardrails.validator import validator
from app.guardrails.executor import executor


class QueryOrchestrator:
    def __init__(self):
        self.resolver = resolver
        self.gemini = gemini_client
        self.validator = validator
        self.executor = executor

    def process_query(self, user_query: str, user_context: dict) -> dict:
        """Process a natural-language analytics question end to end."""
        started_at = time.perf_counter()
        query_id = str(uuid.uuid4())
        role = user_context.get("role", "standard_user")
        project = settings.PROJECT_ID or "your-gcp-project-id"

        metric = self.resolver.resolve_metric_for_question(user_query, role)
        policies = self.resolver.get_policies_for_role(role)
        assumptions = self._build_assumptions(metric, policies)

        template = self.resolver.match_template(user_query)
        fallback_used = False
        fallback_type = None
        intent = template.get("intent_name") if template else None

        if template:
            raw_sql = template["sql_template"].format(project=project)
            fallback_used = True
            fallback_type = "approved_template"
        else:
            try:
                intent_prompt = build_intent_prompt(user_query, self.resolver.vocabulary)
                intent = self.gemini.generate_text(intent_prompt).strip()
                if intent == "UNKNOWN":
                    return self._error_response(
                        query_id,
                        "I could not map that request to an approved analytics intent.",
                        started_at,
                        metric,
                        assumptions,
                    )

                schema_context = self._schema_context(project)
                semantic_context = f"Metric: {metric}\nPolicies: {policies}"
                sql_prompt = build_sql_prompt(user_query, schema_context, semantic_context)
                raw_sql = self.gemini.generate_text(sql_prompt, temperature=0.1)
            except Exception as exc:
                return self._error_response(
                    query_id,
                    f"SQL generation failed and no approved template matched: {exc}",
                    started_at,
                    metric,
                    assumptions,
                    fallback_used=True,
                    fallback_type="generation_unavailable",
                )

        clean_sql = self._clean_sql(raw_sql)
        if not self.validator.parse_sql(clean_sql):
            return self._error_response(
                query_id,
                "Generated SQL failed syntax validation.",
                started_at,
                metric,
                assumptions,
                sql=clean_sql,
                fallback_used=fallback_used,
                fallback_type=fallback_type,
            )

        is_safe, safety_msg = self.validator.validate_safety(clean_sql, str(policies))
        if not is_safe:
            return self._error_response(
                query_id,
                f"Security violation: {safety_msg}",
                started_at,
                metric,
                assumptions,
                sql=clean_sql,
                fallback_used=fallback_used,
                fallback_type=fallback_type,
            )

        cost_estimate = self.validator.estimate_cost(clean_sql)
        if not cost_estimate.get("safe"):
            return self._error_response(
                query_id,
                f"BigQuery dry run unavailable: {cost_estimate.get('error')}",
                started_at,
                metric,
                assumptions,
                sql=clean_sql,
                fallback_used=True,
                fallback_type=fallback_type or "bigquery_dry_run_unavailable",
            )

        success, rows, results_summary = self.executor.execute(clean_sql)
        if not success:
            return self._error_response(
                query_id,
                f"Query execution failed: {results_summary}",
                started_at,
                metric,
                assumptions,
                sql=clean_sql,
                bytes_processed=cost_estimate.get("bytes_processed", 0),
                estimated_cost_usd=cost_estimate.get("estimated_cost_usd", 0.0),
                fallback_used=True,
                fallback_type=fallback_type or "execution_unavailable",
            )

        explanation = self._explain(user_query, clean_sql, results_summary)
        return {
            "status": "success",
            "query_id": query_id,
            "answer": explanation,
            "explanation": explanation,
            "intent": intent,
            "sql": clean_sql,
            "sql_generated": clean_sql,
            "metric_used": metric.get("metric_name") if metric else None,
            "assumptions": assumptions,
            "freshness": {"status": "not_checked", "message": "Freshness observability starts in Phase 7."},
            "fallback_used": fallback_used,
            "fallback_type": fallback_type,
            "execution_time_ms": self._elapsed_ms(started_at),
            "bytes_processed": cost_estimate.get("bytes_processed", 0),
            "estimated_cost_usd": cost_estimate.get("estimated_cost_usd", 0.0),
            "rows_returned": len(rows or []),
            "rows": rows or [],
            "results_summary": results_summary,
        }

    def _build_assumptions(self, metric: dict | None, policies: list[dict]) -> list[str]:
        assumptions = [
            "Only approved semantic-layer tables and relationships are eligible for SQL generation.",
            "Generated SQL must pass SELECT-only, PII, and destructive-operation guardrails before execution.",
        ]
        if metric:
            assumptions.insert(0, f"Metric resolved to {metric.get('metric_name') or metric.get('metric_id')}.")
        if policies:
            assumptions.append(f"{len(policies)} role-based access policies considered.")
        return assumptions

    def _clean_sql(self, raw_sql: str) -> str:
        return re.sub(r"```sql\n|\n```|```", "", raw_sql).strip()

    def _schema_context(self, project: str) -> str:
        return f"""
        Table: `{project}.datapilot_analytics.dim_customers` (customer_id STRING, customer_state STRING)
        Table: `{project}.datapilot_analytics.dim_products` (product_id STRING, product_category_name STRING)
        Table: `{project}.datapilot_analytics.fact_orders` (order_id STRING, customer_id STRING, order_status STRING, order_purchase_timestamp TIMESTAMP)
        Table: `{project}.datapilot_analytics.fact_order_items` (order_id STRING, product_id STRING, seller_id STRING, price FLOAT64, freight_value FLOAT64)
        Table: `{project}.datapilot_analytics.dim_campaigns` (campaign_id STRING, campaign_name STRING, channel STRING, spend FLOAT64)
        Table: `{project}.datapilot_analytics.fact_campaign_attribution` (campaign_id STRING, order_id STRING, revenue_credit FLOAT64)
        """

    def _explain(self, user_query: str, sql: str, results_summary: str) -> str:
        try:
            explain_prompt = build_explanation_prompt(user_query, sql, results_summary)
            return self.gemini.generate_text(explain_prompt)
        except Exception:
            return results_summary

    def _error_response(
        self,
        query_id: str,
        message: str,
        started_at: float,
        metric: dict | None,
        assumptions: list[str],
        sql: str = "",
        bytes_processed: int = 0,
        estimated_cost_usd: float = 0.0,
        fallback_used: bool = False,
        fallback_type: str | None = None,
    ) -> dict[str, Any]:
        return {
            "status": "error",
            "query_id": query_id,
            "answer": message,
            "message": message,
            "sql": sql,
            "sql_generated": sql,
            "metric_used": metric.get("metric_name") if metric else None,
            "assumptions": assumptions,
            "freshness": {"status": "not_checked", "message": "Freshness observability starts in Phase 7."},
            "fallback_used": fallback_used,
            "fallback_type": fallback_type,
            "execution_time_ms": self._elapsed_ms(started_at),
            "bytes_processed": bytes_processed,
            "estimated_cost_usd": estimated_cost_usd,
            "rows_returned": 0,
            "rows": [],
            "results_summary": message,
        }

    def _elapsed_ms(self, started_at: float) -> int:
        return int((time.perf_counter() - started_at) * 1000)


orchestrator = QueryOrchestrator()
