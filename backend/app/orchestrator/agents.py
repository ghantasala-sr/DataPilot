"""Deterministic query-planning agents for governed analytics requests."""

from __future__ import annotations

from typing import Any


class AgentCoordinator:
    """Builds lightweight plans and agent traces for every query."""

    def build_plan(
        self,
        question: str,
        metric: dict | None,
        policies: list[dict],
        template: dict | None,
    ) -> dict[str, Any]:
        normalized = question.lower()
        required_tables = self._infer_tables(normalized)
        metrics = self._infer_metrics(normalized, metric)
        dimensions = self._infer_dimensions(normalized)
        join_paths = self._infer_join_paths(required_tables)
        visualization = self._recommend_visualization(normalized)
        complexity = self._classify_complexity(normalized, template, len(required_tables), len(metrics))

        return {
            "complexity": complexity,
            "strategy": self._strategy(complexity, template),
            "steps": [
                "Resolve business terms, metric definition, and user policy scope.",
                "Choose an approved SQL template when the question matches a governed pattern.",
                "Generate SQL with only approved schema context when no template matches.",
                "Run SQL syntax, safety, and cost guardrails before warehouse execution.",
                "Execute in BigQuery and shape rows for chart, map, or table inspection.",
                "Format the answer with caveats, assumptions, SQL, and agent trace.",
            ],
            "required_tables": required_tables,
            "metrics": metrics,
            "dimensions": dimensions,
            "approved_join_paths": join_paths,
            "grain": self._infer_grain(normalized),
            "filters": self._infer_filters(normalized),
            "visualization": visualization,
            "policy_count": len(policies),
            "template_id": template.get("template_id") if template else None,
        }

    def initial_trace(
        self,
        plan: dict[str, Any],
        metric: dict | None,
        policies: list[dict],
        template: dict | None,
    ) -> list[dict[str, Any]]:
        return [
            {
                "agent": "Planning Agent",
                "role": "Decomposes complicated questions before SQL is selected.",
                "status": "completed",
                "summary": f"{plan['complexity'].title()} plan across {len(plan['required_tables'])} table(s) at {plan['grain']} grain.",
                "evidence": plan["steps"][:3],
            },
            {
                "agent": "Semantic Agent",
                "role": "Maps words to governed business definitions.",
                "status": "completed",
                "summary": self._semantic_summary(plan, metric),
                "evidence": [
                    f"{len(policies)} policy rule(s) considered.",
                    *(plan.get("approved_join_paths") or ["No multi-table join path required."]),
                ],
            },
            {
                "agent": "SQL Agent",
                "role": "Selects approved templates or prepares governed SQL generation.",
                "status": "completed" if template else "ready",
                "summary": (
                    f"Approved template selected: {template.get('template_name')}."
                    if template
                    else "No template matched; Gemini SQL generation will use approved schema context."
                ),
                "evidence": [template.get("template_id")] if template else ["semantic schema context"],
            },
            {
                "agent": "Guardrails Agent",
                "role": "Checks syntax, safety, PII, and BigQuery cost before execution.",
                "status": "ready",
                "summary": "Waiting for SQL validation and dry-run cost estimate.",
                "evidence": ["SELECT-only", "restricted-table checks", "BigQuery dry run"],
            },
        ]

    def final_trace(
        self,
        trace: list[dict[str, Any]],
        cost_estimate: dict[str, Any],
        rows: list[dict[str, Any]],
        fallback_type: str | None,
        explanation: str,
        visualization: dict[str, Any],
    ) -> list[dict[str, Any]]:
        completed = [dict(item) for item in trace]
        for item in completed:
            if item["agent"] == "Guardrails Agent":
                item["status"] = "completed"
                item["summary"] = "SQL passed guardrails and BigQuery dry run."
                item["evidence"] = [
                    f"{cost_estimate.get('bytes_processed', 0)} bytes estimated",
                    f"${cost_estimate.get('estimated_cost_usd', 0.0):.6f} estimated cost",
                ]

        completed.extend(
            [
                {
                    "agent": "Warehouse Agent",
                    "role": "Executes approved SQL against BigQuery.",
                    "status": "completed",
                    "summary": f"Returned {len(rows)} row(s) from BigQuery.",
                    "evidence": [fallback_type or "generated_sql"],
                },
                {
                    "agent": "Visualization Agent",
                    "role": "Chooses a first visual treatment for the returned shape.",
                    "status": "completed",
                    "summary": f"Recommended {visualization.get('type', 'table')} view.",
                    "evidence": [visualization.get("reason", "Based on returned dimensions and measures.")],
                },
                {
                    "agent": "Explanation Agent",
                    "role": "Formats the answer and keeps assumptions visible.",
                    "status": "completed",
                    "summary": explanation[:180],
                    "evidence": ["answer", "assumptions", "SQL"],
                },
            ]
        )
        return completed

    def error_trace(self, trace: list[dict[str, Any]], message: str) -> list[dict[str, Any]]:
        failed = [dict(item) for item in trace]
        failed.append(
            {
                "agent": "Recovery Agent",
                "role": "Captures failure state and returns explainable diagnostics.",
                "status": "blocked",
                "summary": message,
                "evidence": ["No warehouse rows returned."],
            }
        )
        return failed

    def _classify_complexity(self, normalized: str, template: dict | None, table_count: int, metric_count: int) -> str:
        investigative_terms = ["why", "driver", "explained", "change", "drop", "increase", "decrease", "correlat", "impact"]
        comparative_terms = ["compare", "versus", "vs", "month over month", "by ", "trend", "rate"]
        if any(term in normalized for term in investigative_terms):
            return "investigative"
        if table_count >= 3 or metric_count >= 3 or any(term in normalized for term in comparative_terms):
            return "compound"
        if template:
            return "simple"
        return "standard"

    def _infer_tables(self, normalized: str) -> list[str]:
        tables = ["fact_orders"]
        if any(term in normalized for term in ["revenue", "sales", "product", "category", "mix"]):
            tables.extend(["fact_order_items", "dim_products"])
        if any(term in normalized for term in ["state", "region", "customer", "geography", "map"]):
            tables.append("dim_customers")
        if any(term in normalized for term in ["campaign", "roi", "marketing"]):
            tables.extend(["dim_campaigns", "fact_campaign_attribution"])
        if any(term in normalized for term in ["delivery", "delay", "late"]):
            tables.append("dim_customers")
        if "review" in normalized or "rating" in normalized:
            tables.append("fact_reviews")
        if "payment" in normalized:
            tables.append("fact_payments")
        return sorted(set(tables), key=tables.index)

    def _infer_metrics(self, normalized: str, metric: dict | None) -> list[str]:
        metrics: list[str] = []
        if metric:
            metrics.append(metric.get("metric_name") or metric.get("metric_id") or "resolved_metric")
        keyword_metrics = {
            "revenue": "gross_revenue",
            "sales": "gross_revenue",
            "orders": "order_count",
            "volume": "order_count",
            "roi": "roi",
            "delay": "delivery_delay_rate",
            "late": "delivery_delay_rate",
            "refund": "refund_rate",
            "review": "average_review_score",
            "rating": "average_review_score",
        }
        for keyword, metric_name in keyword_metrics.items():
            if keyword in normalized and metric_name not in metrics:
                metrics.append(metric_name)
        return metrics or ["row_count"]

    def _infer_dimensions(self, normalized: str) -> list[str]:
        dimensions: list[str] = []
        if any(term in normalized for term in ["month", "monthly", "month over month"]):
            dimensions.append("calendar_month")
        if any(term in normalized for term in ["state", "region", "geography", "map", "brazil", "uf"]):
            dimensions.append("customer_state")
        if any(term in normalized for term in ["product category", "category", "category mix", "mix"]):
            dimensions.append("product_category_name_english")
        if any(term in normalized for term in ["campaign", "channel"]):
            dimensions.append("campaign_channel")
        return dimensions or ["aggregate"]

    def _infer_join_paths(self, required_tables: list[str]) -> list[str]:
        join_paths: list[str] = []
        if "dim_customers" in required_tables:
            join_paths.append("fact_orders.customer_id -> dim_customers.customer_id")
        if "fact_order_items" in required_tables:
            join_paths.append("fact_orders.order_id -> fact_order_items.order_id")
        if "dim_products" in required_tables:
            join_paths.append("fact_order_items.product_id -> dim_products.product_id")
        if "fact_campaign_attribution" in required_tables:
            join_paths.append("fact_campaign_attribution.order_id -> fact_orders.order_id")
        if "dim_campaigns" in required_tables:
            join_paths.append("dim_campaigns.campaign_id -> fact_campaign_attribution.campaign_id")
        return join_paths

    def _infer_grain(self, normalized: str) -> str:
        if "month" in normalized:
            if "state" in normalized:
                return "month x customer_state"
            if "category" in normalized:
                return "month x product_category"
            return "month"
        if "state" in normalized or "region" in normalized:
            return "customer_state"
        if "category" in normalized or "product" in normalized:
            return "product_category"
        if "campaign" in normalized:
            return "campaign"
        return "aggregate"

    def _infer_filters(self, normalized: str) -> list[str]:
        filters = ["delivered orders where applicable"]
        if "last week" in normalized:
            filters.append("previous completed calendar week")
        if "month" in normalized:
            filters.append("calendar month buckets")
        if "state" in normalized:
            filters.append("customer state present")
        if "delay" in normalized or "late" in normalized:
            filters.append("delivered timestamp present")
        return filters

    def _recommend_visualization(self, normalized: str) -> dict[str, str]:
        if any(term in normalized for term in ["state", "region", "map", "brazil", "uf"]):
            return {"type": "map", "reason": "The question resolves to Brazil customer-state geography.", "geo": "customer_state"}
        if any(term in normalized for term in ["month", "trend", "over time"]):
            return {"type": "chart", "reason": "The question includes a time-series grain.", "x": "month"}
        if any(term in normalized for term in ["why", "driver", "explained"]):
            return {"type": "table", "reason": "Driver questions need sortable evidence across multiple measures."}
        return {"type": "chart", "reason": "A numeric measure by one dimension is best scanned as a bar chart."}

    def _strategy(self, complexity: str, template: dict | None) -> str:
        if template:
            return "Use the approved template first, then validate, execute, visualize, and explain."
        if complexity == "investigative":
            return "Break the question into metric, grain, comparison, and driver measures before governed SQL generation."
        return "Resolve semantic context, generate governed SQL, validate, execute, and explain."

    def _semantic_summary(self, plan: dict[str, Any], metric: dict | None) -> str:
        metric_name = metric.get("metric_name", "No explicit metric resolved") if metric else "No explicit metric resolved"
        dimensions = ", ".join(plan.get("dimensions") or ["aggregate"])
        return f"{metric_name}; dimensions: {dimensions}."


agent_coordinator = AgentCoordinator()
