# DataPilot: GCP-Native Ontology-Aware AI Query System

DataPilot is a production-grade AI query system that enables business users to ask natural-language questions over governed warehouse data while ensuring the answers are semantically correct, secure, explainable, cost-aware, and reliable.

The system combines:

```text
Data Engineering + BigQuery + Semantic Ontology + AI SQL Generation + Query Guardrails + Fallbacks + Observability
```

DataPilot is designed as a **GCP-native project** using BigQuery, Cloud Storage, Cloud Composer, dbt, Vertex AI/Gemini, Cloud Run, Cloud Logging, Cloud Monitoring, and BigQuery-based observability tables.

---

## 1. Problem Statement

Business users often ask simple questions:

```text
Why did sales drop in Texas last week?
Which campaign had the highest ROI?
What is revenue by product category?
Which products have high refunds and poor reviews?
```

But answering these questions safely is difficult because business language and technical warehouse schemas are disconnected.

A question like:

```text
Why did sales drop in Texas last week?
```

has many hidden assumptions:

```text
Does "sales" mean gross revenue, net revenue, or campaign-attributed revenue?
Is Texas based on customer address, shipping address, or seller location?
Should cancelled orders be excluded?
Should refunds be subtracted?
Which tables should be joined?
Is the latest pipeline successful?
Is the user allowed to access this data?
Will the query be too expensive?
```

Traditional AI-to-SQL systems may generate SQL directly, but they can hallucinate columns, use incorrect joins, expose restricted data, ignore metric definitions, or return stale results.

DataPilot solves the **trust problem in AI-powered analytics** by resolving business meaning before generating SQL and by validating every query before execution.

---

## 2. Solution Overview

DataPilot uses an ontology-aware query lifecycle:

```text
User Question
    ↓
Planning Agent Decomposition
    ↓
Intent Classification
    ↓
Semantic Understanding
    ↓
Business Concept Resolution
    ↓
Metric Definition Selection
    ↓
Ontology-Aware Join Mapping
    ↓
AI SQL Generation or Template Selection
    ↓
SQL Guardrails
    ↓
BigQuery Dry Run Cost Check
    ↓
BigQuery Execution
    ↓
Fallback Handling
    ↓
Result Explanation
    ↓
Observability and Feedback
```

Example:

```text
Question:
Why did sales drop in Texas last week?

Resolved meaning:
- sales = gross revenue for Sales users
- Texas = shipping region
- last week = previous completed calendar week
- order status = completed orders only
- approved join path = Orders → Customers → Location
- freshness = latest successful pipeline run
```

The final response includes:

```text
Answer
Generated SQL
Planning agent trace
Metric definition used
Semantic assumptions
Recommended visualization
Data freshness status
Fallback status
Execution time
Rows returned
```

---

## 3. Target Users

Primary users:

```text
Business users
Sales managers
Marketing managers
Product managers
Operations teams
Finance analysts
Customer success teams
```

Secondary users:

```text
Data engineers
Analytics engineers
AI engineers
Data platform teams
Governance teams
```

---

## 4. Key Capabilities

### 4.1 Natural-Language Analytics

Users ask questions in plain English.

Examples:

```text
What was monthly revenue by category?
Which region has the highest delivery delay rate?
Why did sales drop last week?
Show campaign ROI by channel.
Which products have high refund rates and low review scores?
```

### 4.2 Ontology-Aware Semantic Layer

DataPilot uses a semantic layer inspired by ontology and knowledge architecture concepts.

It includes:

```text
Controlled vocabulary
Taxonomy
Ontology relationships
Metric definitions
Metric context rules
Folksonomy mappings
Policies
Business owners
```

This prevents the AI from guessing business meaning.

### 4.3 Governed AI SQL Generation

The AI receives only approved context:

```text
Approved tables
Approved columns
Approved metrics
Approved join paths
User role
Access policies
Semantic assumptions
```

It generates BigQuery SQL only after concepts and metrics are resolved.

### 4.4 SQL Guardrails

Every generated query is validated before execution.

Checks include:

```text
SELECT-only enforcement
No destructive SQL
No multiple statements
No restricted tables
No PII columns
Valid tables and columns
Valid ontology join paths
Cost estimation with BigQuery dry run
Date filter enforcement for large fact tables
LIMIT enforcement for row-level queries
Timeout control
```

### 4.5 Production Fallbacks

DataPilot does not fail silently.

Fallbacks include:

```text
Template query fallback
Similar query cache fallback
SQL repair loop
Query simplification fallback
Read-only safe mode
Human review fallback
BigQuery external table fallback over GCS snapshots
Last successful snapshot fallback
Data freshness warning fallback
```

### 4.6 Observability

The system tracks:

```text
Query latency
Validation failures
Fallback usage
SQL repair success
Cache hit rate
AI cost
Bytes processed
Pipeline freshness
Blocked unsafe queries
User feedback
Most common questions
Most failed questions
```

### 4.7 Authentication and Authorization

DataPilot enforces server-side authentication and role verification.

```text
Firebase Auth or Identity Platform for user authentication
JWT token validation on every API request
User roles resolved from a governed user store, never self-declared
Role-based metric disambiguation
Role-based PII access control
Tenant-level data isolation
Rate limiting per user and tenant
```

User roles are stored in BigQuery or Firestore and resolved server-side during authentication:

```text
User authenticates via Firebase Auth
Backend validates the Firebase ID token
Backend looks up user_id in the governed user store
user_role and tenant_id are resolved server-side
Role is passed to the semantic layer for metric and policy resolution
```

This prevents privilege escalation. A user cannot self-declare their role to access restricted data or bypass PII policies.

### 4.8 Multi-Agent Query Planning

DataPilot now returns a visible agent trace for each governed query.

```text
Planning Agent
Semantic Agent
SQL Agent
Guardrails Agent
Warehouse Agent
Visualization Agent
Explanation Agent
Recovery Agent
```

The Planning Agent decomposes complicated questions into metric, grain, required tables, filters, comparison logic, and visualization fit before SQL is selected. If the request matches an approved template, DataPilot uses that template first; otherwise, Gemini receives only the approved schema and semantic context.

Example complicated question:

```text
Why did gross revenue change month over month by customer state, and is the change explained more by order volume, product category mix, or delivery delays?
```

For this diagnostic question, DataPilot uses an approved BigQuery template that compares month-over-month gross revenue by customer state and surfaces order volume change, product category mix change, delivery delay rate change, and a primary driver field. The response includes `plan`, `agents`, `complexity`, and `recommended_visualization` so the frontend can show the reasoning path, map/table/chart recommendation, and execution status.

---

## 5. GCP Architecture

```text
┌────────────────────────────────────────────────────────────────────┐
│                            Frontend                                │
│                 Next.js hosted on Cloud Run                         │
│      Natural Language Query | SQL Preview | Results | Charts        │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│                         API Layer                                  │
│              Cloud Run FastAPI + Optional API Gateway               │
│              Auth | Rate Limit | Request Logging                    │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│                       Query Orchestrator                           │
│          Intent Classification | Fallback Routing | Lifecycle       │
└───────────────┬───────────────┬────────────────┬───────────────────┘
                │               │                │
                ▼               ▼                ▼
┌────────────────────┐ ┌────────────────┐ ┌─────────────────────────┐
│ Metadata Catalog   │ │ Semantic Layer │ │ Query History + Cache    │
│ BigQuery Metadata  │ │ BigQuery Tables│ │ Firestore / BigQuery     │
│ + Custom Tables    │ │ + YAML in GCS  │ │ + Optional Redis         │
└─────────┬──────────┘ └───────┬────────┘ └───────────┬─────────────┘
          │                    │                      │
          └────────────┬───────┴────────────┬─────────┘
                       │                    │
                       ▼                    ▼
          ┌────────────────────┐   ┌────────────────────┐
          │ Vertex AI Gemini   │   │ Template Query Bank │
          │ NL → SQL + Explain │   │ Approved SQL        │
          └─────────┬──────────┘   └──────────┬─────────┘
                    │                         │
                    └────────────┬────────────┘
                                 ▼
                    ┌────────────────────────┐
                    │ SQL Guardrails Layer   │
                    │ Parser | Validator |   │
                    │ PII | Cost | Access    │
                    └───────────┬────────────┘
                                │
                 ┌──────────────┴──────────────┐
                 │                             │
                 ▼                             ▼
       ┌──────────────────┐          ┌────────────────────┐
       │ SQL Repair Loop  │          │ Query Optimizer     │
       │ Gemini + Errors  │          │ Limits/Rewrites     │
       └────────┬─────────┘          └─────────┬──────────┘
                │                              │
                └──────────────┬───────────────┘
                               ▼
                    ┌────────────────────────┐
                    │ BigQuery Execution     │
                    │ Dry Run + Query Jobs   │
                    └───────────┬────────────┘
                                │
        ┌───────────────────────┼────────────────────────┐
        ▼                       ▼                        ▼
┌──────────────┐       ┌────────────────┐       ┌────────────────┐
│ BigQuery     │       │ BigQuery       │       │ Cached Results │
│ Analytics    │       │ External Tables│       │ BigQuery /     │
│ Warehouse    │       │ over GCS       │       │ Firestore      │
└──────┬───────┘       └───────┬────────┘       └───────┬────────┘
       │                       │                        │
       └───────────────────────┼────────────────────────┘
                               ▼
                    ┌────────────────────────┐
                    │ Result Explanation     │
                    │ Gemini Summary +       │
                    │ Assumptions + Charts   │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │ Observability Layer    │
                    │ Cloud Logging |        │
                    │ Cloud Monitoring |     │
                    │ BigQuery Audit Tables  │
                    └────────────────────────┘
```

---

## 6. GCP Services Used

| Layer | GCP Service |
|---|---|
| Raw object storage | Cloud Storage |
| Data warehouse | BigQuery |
| Pipeline orchestration | Cloud Composer |
| Transformations | dbt Core |
| AI SQL generation | Vertex AI / Gemini |
| Backend API | Cloud Run + FastAPI |
| Frontend | Cloud Run + Next.js |
| Metadata and semantic tables | BigQuery |
| Query logs | BigQuery |
| Cache | Firestore, BigQuery, or Memorystore Redis |
| Secrets | Secret Manager |
| Container registry | Artifact Registry |
| CI/CD | Cloud Build |
| Logs | Cloud Logging |
| Metrics | Cloud Monitoring |
| Optional API control | API Gateway |
| Authentication | Firebase Auth / Identity Platform |
| Optional infra provisioning | Terraform |

---

## 7. Data Sources

### 7.1 Primary Dataset

Use the Olist Brazilian E-Commerce dataset as the main transactional dataset.

It provides:

```text
orders
order items
payments
customers
products
sellers
reviews
geolocation
delivery timestamps
```

### 7.2 Synthetic Data

Generate additional production-style data:

```text
campaigns
campaign attribution
support tickets
refund reasons
inventory snapshots
warehouse fulfillment
user accounts
user roles
query logs
pipeline runs
semantic terms
metric definitions
ontology relationships
policies
```

### 7.3 Optional Public BigQuery Data

Optional BigQuery public datasets can be used for reference, enrichment, or demo data.

---

## 8. BigQuery Dataset Layout

Create five main BigQuery datasets:

```text
datapilot_raw
datapilot_staging
datapilot_analytics
datapilot_semantic
datapilot_observability
```

### 8.1 datapilot_raw

Raw ingested data.

```text
raw_orders
raw_order_items
raw_payments
raw_customers
raw_products
raw_sellers
raw_reviews
raw_geolocation
raw_campaigns
raw_support_tickets
raw_refund_reasons
raw_inventory_snapshots
raw_warehouse_fulfillment
```

### 8.2 datapilot_staging

Cleaned staging tables.

```text
stg_orders
stg_order_items
stg_payments
stg_customers
stg_products
stg_sellers
stg_reviews
stg_geolocation
stg_campaigns
stg_support_tickets
stg_refund_reasons
stg_inventory_snapshots
stg_warehouse_fulfillment
```

### 8.3 datapilot_analytics

Modeled facts, dimensions, and marts.

```text
fact_orders
fact_order_items
fact_payments
fact_reviews
fact_support_tickets
fact_campaign_attribution
fact_inventory_snapshots

dim_customers
dim_products
dim_sellers
dim_campaigns
dim_date
dim_location
dim_warehouse

mart_revenue_daily
mart_delivery_delays
mart_product_quality
mart_customer_experience
mart_campaign_roi
mart_refund_analysis
```

### 8.4 datapilot_semantic

Semantic and ontology layer.

```text
business_terms
term_synonyms
metric_definitions
metric_context_rules
entities
relationships
user_phrase_mappings
policies
template_queries
```

### 8.5 datapilot_observability

Operational logs.

```text
query_logs
query_validation_logs
fallback_logs
pipeline_runs
ai_cost_logs
user_feedback
query_cache
result_cache
```

---

## 9. Semantic Layer

The semantic layer prevents the AI from guessing.

### Controlled Vocabulary

```yaml
terms:
  sales:
    canonical_term: revenue
    approved_meanings:
      - gross_revenue
      - net_revenue
      - attributed_revenue
    default_by_role:
      sales_manager: gross_revenue
      finance_analyst: net_revenue
      marketing_manager: attributed_revenue
```

### Metrics

```yaml
metrics:
  gross_revenue:
    definition: "Total order value before refunds and discounts"
    formula_sql: "SUM(fact_order_items.price)"
    owner_team: "Sales"
    grain: "order_item"
    default_date_column: "order_purchase_timestamp"

  net_revenue:
    definition: "Payment revenue after refunds and discounts"
    formula_sql: "SUM(fact_payments.payment_value) - SUM(fact_refunds.refund_amount)"
    owner_team: "Finance"
    grain: "payment"
    default_date_column: "payment_timestamp"

  attributed_revenue:
    definition: "Campaign-attributed revenue based on attribution weights"
    formula_sql: "SUM(fact_campaign_attribution.revenue_credit)"
    owner_team: "Marketing"
    grain: "campaign_order"
    default_date_column: "order_purchase_timestamp"
```

### Ontology

```yaml
entities:
  Customer:
    table: dim_customers
    primary_key: customer_id

  Order:
    table: fact_orders
    primary_key: order_id

  Product:
    table: dim_products
    primary_key: product_id

  Campaign:
    table: dim_campaigns
    primary_key: campaign_id

relationships:
  customer_places_order:
    from_entity: Customer
    to_entity: Order
    join_condition: "dim_customers.customer_id = fact_orders.customer_id"

  order_contains_product:
    from_entity: Order
    to_entity: Product
    join_condition: "fact_order_items.product_id = dim_products.product_id"

  campaign_influences_order:
    from_entity: Campaign
    to_entity: Order
    join_condition: "fact_campaign_attribution.order_id = fact_orders.order_id"
```

---

## 10. Query Guardrails

Before any SQL is executed, DataPilot validates it.

### Blocked SQL

```sql
DROP
DELETE
UPDATE
INSERT
ALTER
TRUNCATE
CREATE
MERGE
CALL
COPY
EXPORT
```

### Required Checks

```text
Only SELECT statements
No multiple SQL statements
No restricted datasets
No restricted PII columns
Tables exist in BigQuery
Columns exist in BigQuery
Joins are approved by ontology
Large fact tables require date filters
Row-level queries require LIMIT
BigQuery dry run must stay under byte threshold
Query timeout is enforced
```

---

## 11. Fallback Strategy

| Failure | Detection | Fallback |
|---|---|---|
| Gemini unavailable | API timeout/error | Use template query bank or similar cached SQL |
| Invalid SQL | Parser or BigQuery error | Run SQL repair loop |
| Hallucinated column | Metadata validation | Regenerate SQL with corrected schema context |
| Expensive query | BigQuery dry run bytes exceed limit | Add filters, LIMIT, or return narrowed suggestion |
| Warehouse issue | BigQuery query failure | Use external table over GCS snapshot |
| Pipeline stale | pipeline_runs status failed/stale | Use last successful snapshot and warn user |
| PII request | Policy checker | Block or aggregate result |
| Ambiguous metric | Multiple metric matches | Resolve by user role or ask clarification |
| Empty result | Query returns zero rows | Explain likely causes and suggest filters |
| Repeated failure | Repair loop exhausted | Route to human review or safe failure response |

---

## 12. API Design

### POST /api/query

Ask a natural-language question.

Request headers:

```text
Authorization: Bearer <Firebase_ID_Token>
Content-Type: application/json
```

Request body:

```json
{
  "question": "Why did sales drop in Texas last week?"
}
```

The server resolves `user_id`, `user_role`, and `tenant_id` from the verified Firebase token. These values are never accepted from the request body.

Response:

```json
{
  "answer": "Texas sales dropped 18.4% last week, mainly due to lower electronics orders in Dallas and Austin.",
  "sql": "SELECT ...",
  "metric_used": "gross_revenue",
  "complexity": "investigative",
  "plan": {
    "grain": "month x customer_state",
    "required_tables": ["fact_orders", "fact_order_items", "dim_products", "dim_customers"],
    "metrics": ["gross_revenue", "order_count", "delivery_delay_rate"]
  },
  "agents": [
    {
      "agent": "Planning Agent",
      "status": "completed",
      "summary": "Investigative plan across 4 table(s) at month x customer_state grain."
    }
  ],
  "recommended_visualization": {
    "type": "map",
    "reason": "The question includes a geographic state dimension."
  },
  "assumptions": [
    "\"Sales\" means gross order revenue.",
    "Cancelled orders were excluded.",
    "Region is based on shipping address.",
    "Data is current through the latest successful pipeline run."
  ],
  "fallback_used": false,
  "fallback_type": null,
  "execution_time_ms": 842,
  "bytes_processed": 12983712,
  "rows_returned": 12
}
```

### GET /api/query/{query_id}

Fetch query history and result metadata.

### POST /api/feedback

Capture user feedback.

```json
{
  "query_id": "q_123",
  "rating": 5,
  "comment": "Correct metric definition."
}
```

### GET /api/semantic/terms

List approved business terms.

### GET /api/metrics

List available metrics and definitions.

### GET /api/health

Service health check.

---

## 13. Repository Structure

```text
datapilot-gcp/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── query.py
│   │   │   ├── feedback.py
│   │   │   ├── semantic.py
│   │   │   └── health.py
│   │   ├── orchestrator/
│   │   │   ├── query_orchestrator.py
│   │   │   ├── intent_classifier.py
│   │   │   └── fallback_manager.py
│   │   ├── ai/
│   │   │   ├── gemini_client.py
│   │   │   ├── prompt_builder.py
│   │   │   ├── sql_generator.py
│   │   │   └── result_explainer.py
│   │   ├── semantic_layer/
│   │   │   ├── concept_resolver.py
│   │   │   ├── metric_resolver.py
│   │   │   ├── ontology_resolver.py
│   │   │   └── policy_resolver.py
│   │   ├── sql_guardrails/
│   │   │   ├── sql_parser.py
│   │   │   ├── sql_validator.py
│   │   │   ├── cost_estimator.py
│   │   │   └── pii_checker.py
│   │   ├── query_execution/
│   │   │   ├── bigquery_executor.py
│   │   │   ├── dry_run.py
│   │   │   └── external_table_executor.py
│   │   ├── metadata/
│   │   │   ├── bigquery_metadata.py
│   │   │   └── schema_catalog.py
│   │   ├── observability/
│   │   │   ├── logger.py
│   │   │   ├── metrics.py
│   │   │   └── audit_writer.py
│   │   ├── config.py
│   │   └── main.py
│   ├── Dockerfile
│   ├── requirements.txt
│   └── tests/
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── Dockerfile
│   └── package.json
│
├── dbt/
│   ├── models/
│   │   ├── staging/
│   │   ├── marts/
│   │   └── semantic/
│   ├── seeds/
│   ├── tests/
│   ├── macros/
│   ├── dbt_project.yml
│   └── profiles.yml.example
│
├── pipelines/
│   ├── dags/
│   │   ├── load_olist_to_bigquery.py
│   │   ├── generate_synthetic_data.py
│   │   ├── run_dbt_transformations.py
│   │   └── snapshot_marts.py
│   └── scripts/
│
├── semantic/
│   ├── vocabulary.yml
│   ├── taxonomy.yml
│   ├── ontology.yml
│   ├── metrics.yml
│   ├── policies.yml
│   └── template_queries.yml
│
├── infrastructure/
│   ├── cloudbuild.yaml
│   ├── terraform/
│   └── scripts/
│       ├── create_bq_datasets.sh
│       ├── create_gcs_buckets.sh
│       └── deploy_cloud_run.sh
│
├── docs/
│   ├── architecture.md
│   ├── implementation.md
│   ├── fallback-design.md
│   ├── semantic-layer.md
│   └── demo-script.md
│
├── README.md
└── IMPLEMENTATION.md
```

---

## 14. Implementation Roadmap

### Phase 1: GCP Foundation

```text
Create GCP project
Enable required APIs
Create GCS buckets
Create BigQuery datasets
Create service accounts
Configure IAM roles
Set up Secret Manager
```

### Phase 2: Data Warehouse

```text
Upload Olist CSV files to GCS
Load raw CSVs into BigQuery
Generate synthetic data
Load synthetic data into BigQuery
Build dbt staging models
Build dbt analytics marts
Add dbt tests
```

### Phase 3: Semantic Layer

```text
Create semantic BigQuery tables
Load vocabulary, metrics, ontology, policies
Build concept resolver
Build metric resolver
Build ontology join resolver
Build policy resolver
```

### Phase 4: Query Orchestrator

```text
Create FastAPI backend
Build metadata retrieval
Build prompt builder
Integrate Gemini
Generate SQL
Validate SQL
Run BigQuery dry run
Execute BigQuery SQL
Return result
```

### Phase 5: Guardrails and Fallbacks

```text
Add SELECT-only validation
Add PII blocking
Add cost limits
Add SQL repair loop
Add template fallback
Add cached query fallback
Add snapshot fallback
Add data freshness warnings
```

### Phase 6: Frontend

```text
Build Next.js UI
Add natural language query input
Show generated SQL
Show metric definition
Show assumptions
Show results table
Show charts
Show query history
```

### Phase 7: Observability

```text
Write query logs to BigQuery
Write fallback logs
Write AI cost logs
Write pipeline run logs
Add Cloud Logging
Add Cloud Monitoring metrics
Create dashboard
```

### Phase 8: Deployment

```text
Build backend container
Deploy backend to Cloud Run
Build frontend container
Deploy frontend to Cloud Run
Configure environment variables
Configure IAM
Test end-to-end flow
```

### Phase 9: Testing and CI/CD

```text
Unit tests with pytest for semantic resolvers, guardrails, and auth middleware
Integration tests for query lifecycle with mocked BigQuery and Gemini
Pytest fixtures with BigQuery client and Gemini response mocking
Cloud Build CI/CD pipeline with automated test gates
Pre-deployment validation in staging environment
Test coverage enforcement
```

---

## 15. Demo Flow

1. Show GCS raw data files.
2. Show Cloud Composer DAG.
3. Show BigQuery raw, staging, and analytics datasets.
4. Show dbt models and tests.
5. Ask: `What was monthly revenue by product category?`
6. Show generated SQL and BigQuery result.
7. Ask: `Why did sales drop in Texas last week?`
8. Show semantic assumptions.
9. Ask: `Show customer emails for high-value customers.`
10. Show PII blocking.
11. Simulate invalid SQL and show repair loop.
12. Simulate stale pipeline and show snapshot fallback.
13. Show BigQuery observability logs.

---

## 16. Success Metrics

| Metric | Target |
|---|---|
| SQL validation success rate | > 85% |
| SQL repair success rate | > 60% |
| Template fallback coverage | > 20 common questions |
| Unsafe query blocking | 100% for destructive SQL |
| PII protection | 100% for restricted columns |
| Average cached/template query latency | < 2 seconds |
| Data freshness visibility | 100% when pipeline status is relevant |
| Query observability coverage | 100% of executed queries logged |

---

## 17. Resume Positioning

### Project Title

**DataPilot: GCP-Native Ontology-Aware AI Query System**

### Resume Summary

Built a production-grade AI query platform using BigQuery, Vertex AI/Gemini, Cloud Run, Cloud Composer, dbt, and Cloud Storage to convert natural-language business questions into governed, validated, and explainable SQL over analytics marts.

### Resume Bullets

- Engineered a GCP-native AI query platform using BigQuery, Vertex AI/Gemini, Cloud Run, Cloud Composer, dbt, and Cloud Storage to convert natural-language business questions into validated SQL over governed analytics marts.

- Designed BigQuery-based semantic ontology tables for business terms, metric definitions, entity relationships, policies, and user phrase mappings, enabling context-aware SQL generation with validated join paths and metric disambiguation.

- Implemented production-grade reliability controls including BigQuery dry-run cost estimation, SQL repair loops, template-query fallback, cached-result recovery, external-table fallback over GCS snapshots, and data freshness warnings.

- Built SQL guardrails with schema validation, PII blocking, SELECT-only enforcement, cost thresholds, timeout handling, and audit logging to safely support self-service analytics over warehouse data.

- Developed observability using BigQuery audit tables, Cloud Logging, and Cloud Monitoring to track latency, validation failures, fallback usage, cache hit rate, AI cost, blocked unsafe queries, and pipeline freshness.

---

## 18. Final Pitch

DataPilot is not a simple AI SQL chatbot.

It is a GCP-native, ontology-aware AI query system for governed analytics.

It bridges the gap between business language and technical warehouse systems by resolving meaning, validating metric definitions, enforcing query guardrails, handling production failures through fallbacks, and explaining results with assumptions.

The project demonstrates:

```text
Data Engineering
BigQuery
GCP Cloud Architecture
AI Engineering
Query Systems
Semantic Modeling
Knowledge Graph Concepts
Data Governance
SQL Optimization
Observability
Production-Grade System Design
```
