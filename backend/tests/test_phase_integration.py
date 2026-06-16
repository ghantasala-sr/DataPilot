from fastapi.testclient import TestClient

from app.main import app
from app.orchestrator.query import orchestrator
from app.semantic.resolver import resolver


client = TestClient(app)


def test_semantic_layer_loads_local_yaml():
    terms = resolver.list_terms()
    metrics = resolver.list_metrics()

    assert any(term["term"] == "revenue" for term in terms)
    assert any(metric["metric_id"] == "gross_revenue" for metric in metrics)


def test_semantic_api_returns_terms_and_metrics():
    terms_response = client.get("/api/semantic/terms")
    metrics_response = client.get("/api/metrics")

    assert terms_response.status_code == 200
    assert metrics_response.status_code == 200
    assert terms_response.json()["terms"]
    assert metrics_response.json()["metrics"]


def test_query_endpoint_uses_local_mock_auth_and_template_fallback(monkeypatch):
    monkeypatch.setattr(
        orchestrator.validator,
        "estimate_cost",
        lambda sql: {"safe": True, "bytes_processed": 1024, "estimated_cost_usd": 0.0},
    )
    monkeypatch.setattr(
        orchestrator.executor,
        "execute",
        lambda sql: (True, [{"month": "2026-01", "gross_revenue": 1000}], "Returned 1 row."),
    )
    monkeypatch.setattr(orchestrator, "_explain", lambda question, sql, summary: summary)

    response = client.post(
        "/api/query",
        headers={"Authorization": "Bearer test-mock-token"},
        json={"question": "What was monthly revenue by product category?"},
    )

    payload = response.json()
    assert response.status_code == 200
    assert payload["query_id"]
    assert payload["fallback_used"] is True
    assert payload["fallback_type"] == "approved_template"
    assert "SELECT" in payload["sql"]
    assert payload["rows_returned"] == 1
    assert payload["assumptions"]
