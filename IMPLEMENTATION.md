# DataPilot GCP Implementation Guide

This document explains how to implement DataPilot as a GCP-native ontology-aware AI query system.

The implementation is divided into practical phases so the project can be built incrementally and still remain production-quality.

---

## 1. High-Level Implementation Goal

Build a complete GCP-native system where:

```text
Business user asks a question
    ↓
Cloud Run FastAPI service receives it
    ↓
Semantic layer resolves business meaning
    ↓
Gemini generates or repairs SQL
    ↓
Guardrails validate SQL
    ↓
BigQuery dry run estimates cost
    ↓
BigQuery executes the query
    ↓
Gemini explains result
    ↓
Logs are written to BigQuery observability tables
    ↓
Next.js UI displays result, SQL, assumptions, and charts
```

---

## 2. Prerequisites

### 2.1 Local Tools

Install:

```bash
gcloud
python 3.11+
node 20+
docker
dbt-bigquery
git
```

Optional:

```bash
terraform
make
```

### 2.2 GCP APIs

Enable:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  bigquery.googleapis.com \
  storage.googleapis.com \
  composer.googleapis.com \
  aiplatform.googleapis.com \
  secretmanager.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  firestore.googleapis.com
```

### 2.3 GCP Variables

Use these environment variables:

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"
export BQ_LOCATION="US"
export RAW_BUCKET="datapilot-raw-${PROJECT_ID}"
export SNAPSHOT_BUCKET="datapilot-snapshots-${PROJECT_ID}"
export ARTIFACT_REPO="datapilot-containers"
```

---

## 3. GCP Resource Setup

### 3.1 Create GCS Buckets

```bash
gsutil mb -l ${REGION} gs://${RAW_BUCKET}
gsutil mb -l ${REGION} gs://${SNAPSHOT_BUCKET}
```

Suggested object layout:

```text
gs://datapilot-raw-<project>/
  olist/
    orders/
    order_items/
    payments/
    customers/
    products/
    sellers/
    reviews/
    geolocation/
  synthetic/
    campaigns/
    support_tickets/
    refund_reasons/
    inventory_snapshots/
    warehouse_fulfillment/

gs://datapilot-snapshots-<project>/
  marts/
    mart_revenue_daily/
    mart_campaign_roi/
    mart_delivery_delays/
```

### 3.2 Create BigQuery Datasets

```bash
bq --location=${BQ_LOCATION} mk --dataset ${PROJECT_ID}:datapilot_raw
bq --location=${BQ_LOCATION} mk --dataset ${PROJECT_ID}:datapilot_staging
bq --location=${BQ_LOCATION} mk --dataset ${PROJECT_ID}:datapilot_analytics
bq --location=${BQ_LOCATION} mk --dataset ${PROJECT_ID}:datapilot_semantic
bq --location=${BQ_LOCATION} mk --dataset ${PROJECT_ID}:datapilot_observability
```

### 3.3 Create Artifact Registry

```bash
gcloud artifacts repositories create ${ARTIFACT_REPO} \
  --repository-format=docker \
  --location=${REGION} \
  --description="DataPilot container images"
```

---

## 4. BigQuery Raw Tables

### 4.1 Olist Raw Tables

Create raw tables for:

```text
raw_orders
raw_order_items
raw_payments
raw_customers
raw_products
raw_sellers
raw_reviews
raw_geolocation
```

Example schema for `raw_orders`:

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_raw.raw_orders` (
  order_id STRING,
  customer_id STRING,
  order_status STRING,
  order_purchase_timestamp TIMESTAMP,
  order_approved_at TIMESTAMP,
  order_delivered_carrier_date TIMESTAMP,
  order_delivered_customer_date TIMESTAMP,
  order_estimated_delivery_date TIMESTAMP
);
```

Example schema for `raw_order_items`:

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_raw.raw_order_items` (
  order_id STRING,
  order_item_id INT64,
  product_id STRING,
  seller_id STRING,
  shipping_limit_date TIMESTAMP,
  price FLOAT64,
  freight_value FLOAT64
);
```

Example schema for `raw_payments`:

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_raw.raw_payments` (
  order_id STRING,
  payment_sequential INT64,
  payment_type STRING,
  payment_installments INT64,
  payment_value FLOAT64
);
```

Example schema for `raw_customers`:

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_raw.raw_customers` (
  customer_id STRING,
  customer_unique_id STRING,
  customer_zip_code_prefix INT64,
  customer_city STRING,
  customer_state STRING
);
```

### 4.2 Synthetic Raw Tables

Create `raw_campaigns`:

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_raw.raw_campaigns` (
  campaign_id STRING,
  campaign_name STRING,
  channel STRING,
  start_date DATE,
  end_date DATE,
  spend FLOAT64,
  target_state STRING
);
```

Create `raw_campaign_attribution`:

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_raw.raw_campaign_attribution` (
  attribution_id STRING,
  campaign_id STRING,
  order_id STRING,
  attribution_weight FLOAT64,
  revenue_credit FLOAT64,
  attribution_model STRING,
  created_at TIMESTAMP
);
```

Create `raw_support_tickets`:

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_raw.raw_support_tickets` (
  ticket_id STRING,
  customer_id STRING,
  order_id STRING,
  issue_type STRING,
  sentiment STRING,
  priority STRING,
  created_at TIMESTAMP,
  resolved_at TIMESTAMP
);
```

Create `raw_refund_reasons`:

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_raw.raw_refund_reasons` (
  refund_id STRING,
  order_id STRING,
  reason STRING,
  refund_amount FLOAT64,
  created_at TIMESTAMP
);
```

---

## 5. Loading Data into BigQuery

### 5.1 Upload CSVs to GCS

```bash
gsutil cp data/olist/orders.csv gs://${RAW_BUCKET}/olist/orders/orders.csv
gsutil cp data/olist/order_items.csv gs://${RAW_BUCKET}/olist/order_items/order_items.csv
gsutil cp data/olist/payments.csv gs://${RAW_BUCKET}/olist/payments/payments.csv
gsutil cp data/olist/customers.csv gs://${RAW_BUCKET}/olist/customers/customers.csv
```

### 5.2 Load CSVs into BigQuery

```bash
bq load \
  --source_format=CSV \
  --skip_leading_rows=1 \
  --autodetect \
  ${PROJECT_ID}:datapilot_raw.raw_orders \
  gs://${RAW_BUCKET}/olist/orders/orders.csv
```

For production-quality loading, prefer explicit schemas instead of autodetect.

---

## 6. dbt Project

### 6.1 dbt Folder Structure

```text
dbt/
  models/
    staging/
      stg_orders.sql
      stg_order_items.sql
      stg_payments.sql
      stg_customers.sql
      stg_products.sql
      stg_reviews.sql
      stg_campaigns.sql
      stg_support_tickets.sql
    marts/
      fact_orders.sql
      fact_order_items.sql
      fact_payments.sql
      fact_campaign_attribution.sql
      dim_customers.sql
      dim_products.sql
      dim_campaigns.sql
      dim_date.sql
      mart_revenue_daily.sql
      mart_delivery_delays.sql
      mart_campaign_roi.sql
      mart_customer_experience.sql
    semantic/
      semantic_metrics.sql
      semantic_entities.sql
  tests/
  seeds/
```

### 6.2 dbt_project.yml

```yaml
name: "datapilot"
version: "1.0.0"
config-version: 2

profile: "datapilot"

model-paths: ["models"]
seed-paths: ["seeds"]
test-paths: ["tests"]

models:
  datapilot:
    staging:
      +dataset: datapilot_staging
      +materialized: view
    marts:
      +dataset: datapilot_analytics
      +materialized: table
    semantic:
      +dataset: datapilot_semantic
      +materialized: table
```

### 6.3 Example dbt Staging Model

`models/staging/stg_orders.sql`

```sql
SELECT
  order_id,
  customer_id,
  order_status,
  order_purchase_timestamp,
  order_approved_at,
  order_delivered_carrier_date,
  order_delivered_customer_date,
  order_estimated_delivery_date,
  DATE(order_purchase_timestamp) AS order_purchase_date,
  CURRENT_TIMESTAMP() AS loaded_at
FROM {{ source('datapilot_raw', 'raw_orders') }}
WHERE order_id IS NOT NULL
```

### 6.4 Example Analytics Mart

`models/marts/mart_revenue_daily.sql`

```sql
SELECT
  DATE(o.order_purchase_timestamp) AS revenue_date,
  c.customer_state,
  p.product_category_name,
  COUNT(DISTINCT o.order_id) AS total_orders,
  SUM(oi.price) AS gross_revenue,
  SUM(oi.freight_value) AS freight_revenue,
  SUM(pay.payment_value) AS payment_value
FROM {{ ref('fact_orders') }} o
JOIN {{ ref('fact_order_items') }} oi
  ON o.order_id = oi.order_id
LEFT JOIN {{ ref('fact_payments') }} pay
  ON o.order_id = pay.order_id
LEFT JOIN {{ ref('dim_customers') }} c
  ON o.customer_id = c.customer_id
LEFT JOIN {{ ref('dim_products') }} p
  ON oi.product_id = p.product_id
WHERE o.order_status = 'delivered'
GROUP BY 1, 2, 3
```

### 6.5 dbt Tests

Example `schema.yml`:

```yaml
version: 2

models:
  - name: fact_orders
    columns:
      - name: order_id
        tests:
          - not_null
          - unique
      - name: customer_id
        tests:
          - not_null

  - name: mart_revenue_daily
    columns:
      - name: revenue_date
        tests:
          - not_null
      - name: gross_revenue
        tests:
          - not_null
```

---

## 7. Semantic Layer Tables

### 7.1 business_terms

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_semantic.business_terms` (
  term_id STRING,
  canonical_term STRING,
  definition STRING,
  domain STRING,
  owner_team STRING,
  status STRING,
  created_at TIMESTAMP
);
```

### 7.2 term_synonyms

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_semantic.term_synonyms` (
  synonym_id STRING,
  term_id STRING,
  synonym STRING,
  source STRING,
  confidence FLOAT64,
  approved BOOL,
  created_at TIMESTAMP
);
```

### 7.3 metric_definitions

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_semantic.metric_definitions` (
  metric_id STRING,
  metric_name STRING,
  business_definition STRING,
  formula_sql STRING,
  owner_team STRING,
  grain STRING,
  default_date_column STRING,
  default_table STRING,
  status STRING,
  created_at TIMESTAMP
);
```

### 7.4 metric_context_rules

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_semantic.metric_context_rules` (
  rule_id STRING,
  metric_id STRING,
  user_role STRING,
  business_domain STRING,
  trigger_words ARRAY<STRING>,
  priority INT64,
  created_at TIMESTAMP
);
```

### 7.5 entities

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_semantic.entities` (
  entity_id STRING,
  entity_name STRING,
  source_dataset STRING,
  source_table STRING,
  primary_key STRING,
  description STRING,
  created_at TIMESTAMP
);
```

### 7.6 relationships

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_semantic.relationships` (
  relationship_id STRING,
  from_entity STRING,
  to_entity STRING,
  relationship_name STRING,
  join_condition STRING,
  cardinality STRING,
  approved BOOL,
  created_at TIMESTAMP
);
```

### 7.7 policies

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_semantic.policies` (
  policy_id STRING,
  object_type STRING,
  object_name STRING,
  policy_type STRING,
  rule_expression STRING,
  allowed_roles ARRAY<STRING>,
  blocked_roles ARRAY<STRING>,
  created_at TIMESTAMP
);
```

### 7.8 template_queries

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_semantic.template_queries` (
  template_id STRING,
  template_name STRING,
  intent_name STRING,
  trigger_phrases ARRAY<STRING>,
  sql_template STRING,
  required_parameters ARRAY<STRING>,
  owner_team STRING,
  approved BOOL,
  created_at TIMESTAMP
);
```

---

## 8. Observability Tables

### 8.1 query_logs

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_observability.query_logs` (
  query_id STRING,
  user_id STRING,
  user_role STRING,
  tenant_id STRING,
  user_question STRING,
  resolved_metric STRING,
  generated_sql STRING,
  validation_status STRING,
  execution_status STRING,
  fallback_used BOOL,
  fallback_type STRING,
  execution_time_ms INT64,
  bytes_processed INT64,
  rows_returned INT64,
  error_message STRING,
  created_at TIMESTAMP
);
```

### 8.2 query_validation_logs

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_observability.query_validation_logs` (
  validation_id STRING,
  query_id STRING,
  validation_type STRING,
  passed BOOL,
  reason STRING,
  created_at TIMESTAMP
);
```

### 8.3 fallback_logs

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_observability.fallback_logs` (
  fallback_id STRING,
  query_id STRING,
  fallback_type STRING,
  original_error STRING,
  fallback_action STRING,
  success BOOL,
  created_at TIMESTAMP
);
```

### 8.4 pipeline_runs

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_observability.pipeline_runs` (
  run_id STRING,
  pipeline_name STRING,
  status STRING,
  last_success_time TIMESTAMP,
  rows_loaded INT64,
  error_message STRING,
  created_at TIMESTAMP
);
```

### 8.5 ai_cost_logs

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_observability.ai_cost_logs` (
  cost_id STRING,
  query_id STRING,
  model_name STRING,
  input_tokens INT64,
  output_tokens INT64,
  estimated_cost FLOAT64,
  created_at TIMESTAMP
);
```

---

## 9. Backend FastAPI Implementation

### 9.1 Backend Dependencies

`backend/requirements.txt`

```text
fastapi
uvicorn[standard]
google-cloud-bigquery
google-cloud-aiplatform
google-cloud-logging
google-cloud-secret-manager
google-cloud-firestore
pydantic
sqlglot
python-dotenv
tenacity
pandas
db-dtypes
firebase-admin
```

Create `backend/requirements-dev.txt` for testing:

```text
pytest
pytest-asyncio
pytest-cov
httpx
```

### 9.2 Main App

`backend/app/main.py`

```python
from fastapi import FastAPI
from app.api.query import router as query_router
from app.api.feedback import router as feedback_router
from app.api.semantic import router as semantic_router
from app.api.health import router as health_router

app = FastAPI(title="DataPilot API", version="1.0.0")

app.include_router(health_router, prefix="/api")
app.include_router(query_router, prefix="/api")
app.include_router(feedback_router, prefix="/api")
app.include_router(semantic_router, prefix="/api")
```

### 9.3 Query Endpoint

`backend/app/api/query.py`

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.orchestrator.query_orchestrator import QueryOrchestrator
from app.auth.middleware import get_authenticated_user, AuthenticatedUser

router = APIRouter()

class QueryRequest(BaseModel):
    question: str

@router.post("/query")
async def run_query(
    request: QueryRequest,
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    orchestrator = QueryOrchestrator()
    return await orchestrator.process(
        question=request.question,
        user_id=user.user_id,
        user_role=user.role,
        tenant_id=user.tenant_id,
    )
```

### 9.4 Query Orchestrator Pseudocode

`backend/app/orchestrator/query_orchestrator.py`

```python
class QueryOrchestrator:
    async def process(self, question: str, user_id: str, user_role: str, tenant_id: str):
        query_id = create_query_id()

        try:
            intent = classify_intent(question)

            freshness = get_pipeline_freshness()

            semantic_context = resolve_semantic_context(
                question=question,
                user_role=user_role
            )

            template_sql = find_template_query(
                question=question,
                intent=intent,
                semantic_context=semantic_context
            )

            if template_sql:
                sql = render_template(template_sql, semantic_context)
                generation_source = "template"
            else:
                sql = generate_sql_with_gemini(
                    question=question,
                    semantic_context=semantic_context
                )
                generation_source = "gemini"

            validation_result = validate_sql(
                sql=sql,
                user_role=user_role,
                semantic_context=semantic_context
            )

            if not validation_result.passed:
                sql = repair_sql_if_possible(
                    original_sql=sql,
                    error=validation_result.reason,
                    semantic_context=semantic_context
                )

                validation_result = validate_sql(
                    sql=sql,
                    user_role=user_role,
                    semantic_context=semantic_context
                )

            if not validation_result.passed:
                return safe_failure_response(
                    query_id=query_id,
                    reason=validation_result.reason
                )

            cost_result = bigquery_dry_run(sql)

            if cost_result.bytes_processed > MAX_BYTES_ALLOWED:
                return expensive_query_response(
                    query_id=query_id,
                    bytes_processed=cost_result.bytes_processed
                )

            result = execute_bigquery(sql)

            explanation = explain_result_with_gemini(
                question=question,
                sql=sql,
                result=result,
                semantic_context=semantic_context,
                freshness=freshness
            )

            write_query_log(
                query_id=query_id,
                question=question,
                sql=sql,
                status="success",
                fallback_used=False,
                bytes_processed=cost_result.bytes_processed
            )

            return {
                "query_id": query_id,
                "answer": explanation.answer,
                "sql": sql,
                "metric_used": semantic_context.metric_name,
                "assumptions": semantic_context.assumptions,
                "freshness": freshness,
                "fallback_used": False,
                "rows": result.rows,
                "bytes_processed": cost_result.bytes_processed,
            }

        except Exception as exc:
            return handle_fallback(
                query_id=query_id,
                question=question,
                user_role=user_role,
                error=exc
            )
```

### 9.5 User Accounts Table

Create a governed user store for role resolution:

```sql
CREATE TABLE IF NOT EXISTS `PROJECT_ID.datapilot_semantic.user_accounts` (
  user_id STRING,
  email STRING,
  user_role STRING,
  tenant_id STRING,
  is_active BOOL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 9.6 Authentication Middleware

`backend/app/auth/middleware.py`

```python
from fastapi import Header, HTTPException
from pydantic import BaseModel
import firebase_admin
from firebase_admin import auth as firebase_auth
from app.auth.user_store import get_user_from_store

if not firebase_admin._apps:
    firebase_admin.initialize_app()


class AuthenticatedUser(BaseModel):
    user_id: str
    role: str
    tenant_id: str
    email: str


def verify_firebase_token(token: str) -> AuthenticatedUser:
    """Verify Firebase ID token and resolve user role from the governed user store."""
    try:
        decoded = firebase_auth.verify_id_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    uid = decoded.get("uid")
    email = decoded.get("email", "")

    user_record = get_user_from_store(uid)

    if not user_record:
        raise HTTPException(
            status_code=403, detail="User not registered in DataPilot."
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
    """FastAPI dependency that extracts and validates the Firebase token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401, detail="Missing or invalid Authorization header."
        )

    token = authorization.removeprefix("Bearer ").strip()
    return verify_firebase_token(token)
```

### 9.7 User Store Lookup

`backend/app/auth/user_store.py`

```python
from google.cloud import bigquery


def get_user_from_store(uid: str) -> dict | None:
    """Look up user role and tenant from the governed user store in BigQuery."""
    client = bigquery.Client()

    query = """
        SELECT user_id, user_role AS role, tenant_id
        FROM `{project}.datapilot_semantic.user_accounts`
        WHERE user_id = @uid AND is_active = TRUE
        LIMIT 1
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("uid", "STRING", uid),
        ]
    )

    rows = list(client.query(query, job_config=job_config).result())

    if not rows:
        return None

    row = dict(rows[0])
    return {"role": row["role"], "tenant_id": row["tenant_id"]}
```

### 9.8 Security Design Principles

```text
User roles are NEVER accepted from the client request body
Firebase ID tokens are verified on every API request
User roles are resolved from a governed BigQuery table
Unregistered users receive 403 Forbidden
Expired or invalid tokens receive 401 Unauthorized
All authentication failures are logged
Rate limiting is enforced per user_id and tenant_id
```

---

## 10. Semantic Resolver Implementation

### 10.1 Concept Resolver

Responsibilities:

```text
Extract business terms from user question
Match against business_terms and term_synonyms
Return canonical concepts
Detect ambiguity
Assign confidence
```

Example logic:

```python
def resolve_terms(question: str, user_role: str):
    candidates = search_terms_and_synonyms(question)

    if has_ambiguous_metric(candidates):
        metric = resolve_by_context(
            candidates=candidates,
            user_role=user_role,
            trigger_words=extract_keywords(question)
        )
    else:
        metric = best_match(candidates)

    return metric
```

### 10.2 Metric Resolver

Responsibilities:

```text
Choose correct metric definition
Use user role
Use business domain
Use trigger words
Return formula_sql and assumptions
```

Example:

```text
sales_manager + "sales" → gross_revenue
finance_analyst + "revenue" → net_revenue
marketing_manager + "campaign revenue" → attributed_revenue
```

### 10.3 Ontology Resolver

Responsibilities:

```text
Identify required entities
Find approved join paths
Return table and join context for SQL generation
Block invalid joins
```

Example:

```text
Campaign → Order → Product
Customer → Order → Payment
Order → Shipment
```

---

## 11. Gemini Prompt Design

### 11.1 SQL Generation Prompt

```text
You are a BigQuery SQL generator for a governed analytics system.

Generate only one SELECT query.

Do not use destructive SQL.
Do not invent tables or columns.
Use only the provided tables, columns, metrics, and join rules.
Respect all access policies.
Use BigQuery Standard SQL.

User question:
{question}

Resolved metric:
{metric_name}
{metric_definition}
Formula:
{formula_sql}

Allowed entities:
{entities}

Allowed tables and columns:
{schema_context}

Approved joins:
{join_context}

Policies:
{policy_context}

Date interpretation:
{date_context}

Generate BigQuery SQL only.
```

### 11.2 SQL Repair Prompt

```text
The previous SQL failed validation or execution.

User question:
{question}

Previous SQL:
{sql}

Error:
{error}

Approved schema:
{schema_context}

Approved joins:
{join_context}

Fix the SQL.
Return only one BigQuery SELECT statement.
```

### 11.3 Result Explanation Prompt

```text
Explain the query result for a business user.

Question:
{question}

Metric used:
{metric_name}
Definition:
{metric_definition}

Assumptions:
{assumptions}

Result sample:
{result_sample}

Data freshness:
{freshness}

Write a concise explanation with:
1. Direct answer
2. Key drivers
3. Metric assumptions
4. Any freshness warning
5. Suggested follow-up questions
```

---

## 12. SQL Guardrails Implementation

### 12.1 Use sqlglot for Parsing

```python
import sqlglot

def parse_sql(sql: str):
    return sqlglot.parse_one(sql, read="bigquery")
```

### 12.2 SELECT-Only Enforcement

```python
def enforce_select_only(parsed):
    if parsed.key.upper() != "SELECT":
        raise ValueError("Only SELECT queries are allowed.")
```

### 12.3 Block Multiple Statements

```python
def reject_multiple_statements(sql: str):
    statements = sqlglot.parse(sql, read="bigquery")
    if len(statements) != 1:
        raise ValueError("Multiple SQL statements are not allowed.")
```

### 12.4 PII Blocking

Restricted columns:

```text
email
phone
address
customer_name
exact_location
payment_card
```

Policy logic:

```python
def check_pii_columns(columns, user_role):
    restricted = get_restricted_columns()

    for col in columns:
        if col in restricted and user_role not in restricted[col].allowed_roles:
            raise ValueError(f"Restricted PII column blocked: {col}")
```

### 12.5 BigQuery Dry Run

```python
from google.cloud import bigquery

def dry_run_query(sql: str, project_id: str):
    client = bigquery.Client(project=project_id)

    job_config = bigquery.QueryJobConfig(
        dry_run=True,
        use_query_cache=False
    )

    query_job = client.query(sql, job_config=job_config)

    return {
        "bytes_processed": query_job.total_bytes_processed
    }
```

### 12.6 Query Execution

```python
from google.cloud import bigquery

def execute_query(sql: str, project_id: str):
    client = bigquery.Client(project=project_id)

    job_config = bigquery.QueryJobConfig(
        use_query_cache=True
    )

    query_job = client.query(sql, job_config=job_config)
    rows = [dict(row) for row in query_job.result()]

    return rows
```

---

## 13. Fallback Manager

### 13.1 Fallback Priority

```text
1. Template query
2. Similar previous validated SQL
3. SQL repair loop
4. Query simplification
5. BigQuery external table over GCS snapshot
6. Last successful cached result
7. Human review / safe failure response
```

### 13.2 Fallback Manager Pseudocode

```python
def handle_fallback(query_id, question, user_role, error):
    log_fallback_attempt(query_id, "initial_failure", str(error))

    template = find_template_query(question)
    if template:
        return execute_template_fallback(query_id, template)

    cached = find_similar_successful_query(question)
    if cached:
        return execute_cached_sql_fallback(query_id, cached)

    if is_sql_error(error):
        repaired_sql = repair_sql_with_gemini(error)
        if repaired_sql and validate_sql(repaired_sql):
            return execute_repaired_sql(query_id, repaired_sql)

    if is_pipeline_stale_or_failed():
        snapshot_result = query_last_successful_snapshot(question)
        if snapshot_result:
            return snapshot_response(query_id, snapshot_result)

    return {
        "query_id": query_id,
        "answer": "I could not safely answer this question with the available governed data.",
        "fallback_used": True,
        "fallback_type": "safe_failure"
    }
```

---

## 14. Cloud Composer DAGs

### 14.1 Main DAGs

```text
load_olist_to_bigquery.py
generate_synthetic_data.py
run_dbt_transformations.py
snapshot_marts.py
semantic_layer_load.py
```

### 14.2 DAG Flow

```text
Start
  ↓
Check GCS files
  ↓
Load raw tables to BigQuery
  ↓
Generate synthetic data
  ↓
Run dbt staging models
  ↓
Run dbt marts
  ↓
Run dbt tests
  ↓
Snapshot critical marts
  ↓
Write pipeline_runs status
  ↓
End
```

### 14.3 Pipeline Run Logging

Every DAG writes to:

```text
datapilot_observability.pipeline_runs
```

Example statuses:

```text
success
failed
partial_success
stale
running
```

---

## 15. Snapshot Fallback Implementation

### 15.1 Snapshot Critical Marts

Export critical marts to GCS:

```sql
EXPORT DATA OPTIONS(
  uri='gs://SNAPSHOT_BUCKET/marts/mart_revenue_daily/*.parquet',
  format='PARQUET',
  overwrite=true
) AS
SELECT *
FROM `PROJECT_ID.datapilot_analytics.mart_revenue_daily`;
```

### 15.2 BigQuery External Table

```sql
CREATE OR REPLACE EXTERNAL TABLE `PROJECT_ID.datapilot_analytics_ext.mart_revenue_daily_snapshot`
OPTIONS (
  format = 'PARQUET',
  uris = ['gs://SNAPSHOT_BUCKET/marts/mart_revenue_daily/*.parquet']
);
```

Use this when current marts are unavailable or stale.

---

## 16. Frontend Implementation

### 16.1 UI Features

Build a Next.js UI with:

```text
Question input
Generated SQL panel
Metric definition panel
Semantic assumptions panel
Result table
Chart view
Fallback status badge
Freshness status badge
Query history
Feedback buttons
```

### 16.2 Main Components

```text
components/
  QueryInput.tsx
  SqlPreview.tsx
  ResultTable.tsx
  ResultChart.tsx
  MetricAssumptions.tsx
  FreshnessBadge.tsx
  FallbackBadge.tsx
  QueryHistory.tsx
  FeedbackButtons.tsx
```

### 16.3 Frontend Request

```typescript
async function askQuestion(question: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question,
      user_id: "demo_user",
      user_role: "sales_manager",
      tenant_id: "demo_company",
    }),
  });

  return response.json();
}
```

---

## 17. Cloud Run Deployment

### 17.1 Backend Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### 17.2 Build and Push Backend

```bash
gcloud builds submit backend \
  --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/datapilot-backend:latest
```

### 17.3 Deploy Backend

```bash
gcloud run deploy datapilot-backend \
  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/datapilot-backend:latest \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars PROJECT_ID=${PROJECT_ID},BQ_LOCATION=${BQ_LOCATION}
```

### 17.4 Frontend Dockerfile

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
CMD ["npm", "start"]
```

### 17.5 Deploy Frontend

```bash
gcloud builds submit frontend \
  --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/datapilot-frontend:latest

gcloud run deploy datapilot-frontend \
  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/datapilot-frontend:latest \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NEXT_PUBLIC_API_URL=https://YOUR_BACKEND_URL
```

---

## 18. IAM Permissions

### 18.1 Backend Service Account

Required roles:

```text
BigQuery Data Viewer
BigQuery Job User
BigQuery Metadata Viewer
Vertex AI User
Secret Manager Secret Accessor
Cloud Logging Writer
Firestore User
```

Optional:

```text
Storage Object Viewer
Monitoring Metric Writer
```

### 18.2 Composer Service Account

Required roles:

```text
BigQuery Data Editor
BigQuery Job User
Storage Object Admin
Cloud Composer Worker
Logging Writer
```

---

## 19. Environment Variables

Backend:

```text
PROJECT_ID
BQ_LOCATION
GEMINI_MODEL
MAX_BYTES_PROCESSED
SEMANTIC_DATASET
ANALYTICS_DATASET
OBSERVABILITY_DATASET
SNAPSHOT_BUCKET
```

Frontend:

```text
NEXT_PUBLIC_API_URL
```

---

## 20. Testing Strategy

### 20.1 Test Dependencies

`backend/requirements-dev.txt`

```text
pytest
pytest-asyncio
pytest-cov
httpx
```

### 20.2 Shared Test Fixtures

`backend/tests/conftest.py`

```python
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.auth.middleware import AuthenticatedUser


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mock_bigquery_client():
    with patch("google.cloud.bigquery.Client") as mock:
        client = MagicMock()
        mock.return_value = client

        dry_run_job = MagicMock()
        dry_run_job.total_bytes_processed = 1024 * 1024  # 1 MB
        client.query.return_value = dry_run_job

        yield client


@pytest.fixture
def mock_gemini():
    with patch("app.ai.gemini_client.GeminiClient") as mock:
        client = AsyncMock()
        mock.return_value = client

        client.generate_sql.return_value = (
            "SELECT revenue_date, SUM(gross_revenue) "
            "FROM `project.datapilot_analytics.mart_revenue_daily` "
            "GROUP BY 1 ORDER BY 1"
        )
        client.explain_result.return_value = {
            "answer": "Monthly revenue shows steady growth.",
            "drivers": ["Electronics category leads growth"],
        }

        yield client


@pytest.fixture
def mock_authenticated_user():
    return AuthenticatedUser(
        user_id="test_user_001",
        role="sales_manager",
        tenant_id="demo_company",
        email="test@example.com",
    )


@pytest.fixture
def sample_semantic_context():
    return {
        "metric_name": "gross_revenue",
        "metric_definition": "Total order value before refunds",
        "formula_sql": "SUM(fact_order_items.price)",
        "assumptions": [
            "Sales means gross order revenue",
            "Cancelled orders excluded",
        ],
        "entities": ["Order", "Product"],
        "join_paths": [
            "fact_order_items.product_id = dim_products.product_id"
        ],
    }
```

### 20.3 Unit Tests: SQL Guardrails

`backend/tests/test_sql_guardrails.py`

```python
import pytest
from app.sql_guardrails.sql_validator import (
    enforce_select_only,
    reject_multiple_statements,
)
from app.sql_guardrails.pii_checker import check_pii_columns


class TestSelectOnlyEnforcement:
    def test_valid_select(self):
        sql = "SELECT * FROM mart_revenue_daily LIMIT 10"
        assert enforce_select_only(sql) is True

    def test_rejects_drop(self):
        with pytest.raises(ValueError, match="Only SELECT"):
            enforce_select_only("DROP TABLE mart_revenue_daily")

    def test_rejects_delete(self):
        with pytest.raises(ValueError, match="Only SELECT"):
            enforce_select_only("DELETE FROM mart_revenue_daily WHERE 1=1")

    def test_rejects_update(self):
        with pytest.raises(ValueError, match="Only SELECT"):
            enforce_select_only(
                "UPDATE mart_revenue_daily SET gross_revenue = 0"
            )

    def test_rejects_insert(self):
        with pytest.raises(ValueError, match="Only SELECT"):
            enforce_select_only(
                "INSERT INTO mart_revenue_daily VALUES (1)"
            )


class TestMultipleStatements:
    def test_single_statement_passes(self):
        sql = "SELECT * FROM mart_revenue_daily"
        assert reject_multiple_statements(sql) is True

    def test_rejects_semicolon_injection(self):
        sql = "SELECT 1; DROP TABLE mart_revenue_daily"
        with pytest.raises(ValueError, match="Multiple SQL"):
            reject_multiple_statements(sql)


class TestPiiBlocking:
    def test_blocks_email_for_sales_role(self):
        with pytest.raises(ValueError, match="Restricted PII"):
            check_pii_columns(
                columns=["email"], user_role="sales_manager"
            )

    def test_blocks_phone_for_sales_role(self):
        with pytest.raises(ValueError, match="Restricted PII"):
            check_pii_columns(
                columns=["phone"], user_role="sales_manager"
            )

    def test_allows_non_pii_columns(self):
        result = check_pii_columns(
            columns=["customer_id", "order_id", "revenue"],
            user_role="sales_manager",
        )
        assert result is True
```

### 20.4 Unit Tests: Authentication

`backend/tests/test_auth.py`

```python
import pytest
from unittest.mock import patch
from fastapi import HTTPException
from app.auth.middleware import (
    get_authenticated_user,
    verify_firebase_token,
)


class TestAuthentication:
    def test_missing_token_returns_401(self):
        with pytest.raises(HTTPException) as exc:
            get_authenticated_user(authorization=None)
        assert exc.value.status_code == 401

    def test_malformed_token_returns_401(self):
        with pytest.raises(HTTPException) as exc:
            get_authenticated_user(authorization="NotBearer token")
        assert exc.value.status_code == 401

    def test_invalid_firebase_token_returns_401(self):
        with patch(
            "firebase_admin.auth.verify_id_token",
            side_effect=Exception("Invalid"),
        ):
            with pytest.raises(HTTPException) as exc:
                verify_firebase_token("invalid_token")
            assert exc.value.status_code == 401

    def test_valid_token_resolves_role_from_store(self):
        with patch("firebase_admin.auth.verify_id_token") as mock_verify:
            mock_verify.return_value = {
                "uid": "user_001",
                "email": "user@example.com",
            }
            with patch(
                "app.auth.middleware.get_user_from_store"
            ) as mock_store:
                mock_store.return_value = {
                    "role": "sales_manager",
                    "tenant_id": "demo_company",
                }
                user = verify_firebase_token("valid_token")
                assert user.user_id == "user_001"
                assert user.role == "sales_manager"

    def test_unregistered_user_returns_403(self):
        with patch("firebase_admin.auth.verify_id_token") as mock_verify:
            mock_verify.return_value = {
                "uid": "unknown",
                "email": "x@y.com",
            }
            with patch(
                "app.auth.middleware.get_user_from_store",
                return_value=None,
            ):
                with pytest.raises(HTTPException) as exc:
                    verify_firebase_token("valid_token")
                assert exc.value.status_code == 403

    def test_role_comes_from_store_not_request(self):
        """Verify roles are looked up server-side, not from request."""
        with patch("firebase_admin.auth.verify_id_token") as mock_verify:
            mock_verify.return_value = {
                "uid": "user_123",
                "email": "user@example.com",
            }
            with patch(
                "app.auth.middleware.get_user_from_store"
            ) as mock_store:
                mock_store.return_value = {
                    "role": "finance_analyst",
                    "tenant_id": "acme_corp",
                }
                user = verify_firebase_token("token")
                assert user.role == "finance_analyst"
                assert user.tenant_id == "acme_corp"
```

### 20.5 Unit Tests: Semantic Resolver

`backend/tests/test_semantic_resolver.py`

```python
import pytest
from app.semantic_layer.metric_resolver import resolve_metric


class TestMetricResolver:
    def test_sales_manager_gets_gross_revenue(self):
        metric = resolve_metric(
            term="revenue", user_role="sales_manager"
        )
        assert metric.metric_name == "gross_revenue"

    def test_finance_analyst_gets_net_revenue(self):
        metric = resolve_metric(
            term="revenue", user_role="finance_analyst"
        )
        assert metric.metric_name == "net_revenue"

    def test_marketing_gets_attributed_revenue(self):
        metric = resolve_metric(
            term="campaign revenue",
            user_role="marketing_manager",
        )
        assert metric.metric_name == "attributed_revenue"
```

### 20.6 Integration Tests: Query Lifecycle

`backend/tests/test_query_lifecycle.py`

```python
import pytest
from unittest.mock import patch


class TestQueryLifecycle:
    def test_successful_query(
        self,
        client,
        mock_bigquery_client,
        mock_gemini,
        mock_authenticated_user,
    ):
        with patch(
            "app.auth.middleware.get_authenticated_user",
            return_value=mock_authenticated_user,
        ):
            response = client.post(
                "/api/query",
                json={"question": "What was monthly revenue?"},
                headers={"Authorization": "Bearer test_token"},
            )

        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
        assert "sql" in data
        assert data["fallback_used"] is False

    def test_pii_query_is_blocked(
        self,
        client,
        mock_bigquery_client,
        mock_gemini,
        mock_authenticated_user,
    ):
        mock_gemini.generate_sql.return_value = (
            "SELECT email, phone FROM dim_customers"
        )

        with patch(
            "app.auth.middleware.get_authenticated_user",
            return_value=mock_authenticated_user,
        ):
            response = client.post(
                "/api/query",
                json={"question": "Show customer emails"},
                headers={"Authorization": "Bearer test_token"},
            )

        data = response.json()
        assert (
            data.get("validation_status") == "blocked"
            or "blocked" in data.get("answer", "").lower()
        )

    def test_expensive_query_is_rejected(
        self,
        client,
        mock_bigquery_client,
        mock_gemini,
        mock_authenticated_user,
    ):
        dry_run_job = mock_bigquery_client.query.return_value
        dry_run_job.total_bytes_processed = (
            100 * 1024 * 1024 * 1024  # 100 GB
        )

        with patch(
            "app.auth.middleware.get_authenticated_user",
            return_value=mock_authenticated_user,
        ):
            response = client.post(
                "/api/query",
                json={"question": "Select everything"},
                headers={"Authorization": "Bearer test_token"},
            )

        data = response.json()
        assert data.get("fallback_used") or "expensive" in data.get(
            "answer", ""
        ).lower()

    def test_unauthenticated_request_rejected(self, client):
        response = client.post(
            "/api/query",
            json={"question": "What was revenue?"},
        )
        assert response.status_code in [401, 403]
```

### 20.7 Running Tests

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest tests/ -v --tb=short --cov=app --cov-report=term-missing
```

### 20.8 CI/CD Pipeline

`infrastructure/cloudbuild.yaml`

```yaml
steps:
  - name: 'python:3.11-slim'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        cd backend
        pip install -r requirements.txt -r requirements-dev.txt
        python -m pytest tests/ -v --tb=short --junitxml=test-results.xml
    id: 'backend-tests'

  - name: 'ghcr.io/dbt-labs/dbt-bigquery:latest'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        cd dbt
        dbt deps
        dbt test --target staging
    id: 'dbt-tests'

  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_ARTIFACT_REPO}/datapilot-backend:${SHORT_SHA}'
      - 'backend/'
    id: 'build-backend'
    waitFor: ['backend-tests']

  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_ARTIFACT_REPO}/datapilot-frontend:${SHORT_SHA}'
      - 'frontend/'
    id: 'build-frontend'
    waitFor: ['backend-tests']

  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_ARTIFACT_REPO}/datapilot-backend:${SHORT_SHA}'
    id: 'push-backend'
    waitFor: ['build-backend']

  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_ARTIFACT_REPO}/datapilot-frontend:${SHORT_SHA}'
    id: 'push-frontend'
    waitFor: ['build-frontend']

  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'datapilot-backend'
      - '--image'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_ARTIFACT_REPO}/datapilot-backend:${SHORT_SHA}'
      - '--region'
      - '${_REGION}'
      - '--platform'
      - 'managed'
    id: 'deploy-backend'
    waitFor: ['push-backend', 'dbt-tests']

  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'datapilot-frontend'
      - '--image'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_ARTIFACT_REPO}/datapilot-frontend:${SHORT_SHA}'
      - '--region'
      - '${_REGION}'
      - '--platform'
      - 'managed'
    id: 'deploy-frontend'
    waitFor: ['push-frontend']

substitutions:
  _REGION: us-central1
  _ARTIFACT_REPO: datapilot-containers

options:
  logging: CLOUD_LOGGING_ONLY
```

### 20.9 Pipeline Flow

```text
Push to main branch
  ↓
Cloud Build trigger fires
  ↓
Run backend pytest suite (unit + integration)
  ↓ (parallel)
Run dbt tests against staging dataset
  ↓
Build backend Docker image
  ↓ (parallel)
Build frontend Docker image
  ↓
Push images to Artifact Registry
  ↓
Deploy backend to Cloud Run
  ↓ (parallel)
Deploy frontend to Cloud Run
```

### 20.10 Test Gate Policy

```text
All pytest tests must pass before container build starts
All dbt tests must pass before Cloud Run deployment
Failed tests block the entire pipeline
Test results are stored as Cloud Build artifacts
Coverage reports are generated on every run
```

### 20.11 Demo Test Cases

```text
What was monthly revenue by product category?
Why did sales drop in Texas last week?
Show customer emails for high-value customers.
What is revenue according to Finance?
Which campaign had the highest ROI?
Show delayed deliveries by state.
```

---

## 21. Monitoring Dashboard

Create dashboard panels for:

```text
Query count
Query success rate
Average latency
P95 latency
Bytes processed
AI estimated cost
Fallback usage count
Validation failure count
Blocked PII requests
Pipeline freshness
Top questions
Most failed questions
```

Use:

```text
Cloud Monitoring
Cloud Logging
BigQuery observability tables
Looker Studio optional
```

---

## 22. MVP Scope

Build this first:

```text
Olist data loaded into BigQuery
dbt staging and revenue mart
Semantic tables for revenue, sales, customer, product, region
FastAPI /api/query endpoint
Gemini SQL generation
SELECT-only validation
BigQuery dry run
BigQuery execution
Query logs
Simple Next.js UI
```

MVP demo questions:

```text
What was monthly revenue by product category?
Show top states by sales.
What are the top 10 products by gross revenue?
```

---

## 23. Production-Quality Scope

After MVP, add:

```text
Metric ambiguity resolver
Ontology join validator
PII policies
Template query fallback
SQL repair loop
Pipeline freshness
Snapshot fallback
Query observability dashboard
Feedback loop
```

---

## 24. Suggested Build Order by Week

### Week 1

```text
GCP setup
GCS buckets
BigQuery datasets
Load Olist data
Create dbt project
Build staging models
```

### Week 2

```text
Build analytics marts
Add dbt tests
Generate synthetic campaigns/support data
Create semantic tables
Load initial semantic configs
```

### Week 3

```text
Build FastAPI backend
Connect to BigQuery
Implement metadata retrieval
Implement Gemini SQL generation
Implement BigQuery execution
```

### Week 4

```text
Add SQL guardrails
Add BigQuery dry run
Add PII blocking
Add query logs
Add result explanation
```

### Week 5

```text
Add fallbacks
Template query fallback
SQL repair loop
Snapshot fallback
Freshness warnings
```

### Week 6

```text
Build Next.js UI
Deploy backend/frontend to Cloud Run
Add Cloud Logging/Monitoring
Prepare demo video and final README
```

---

## 25. Final Demo Script

### Step 1: Data Pipeline

Show:

```text
GCS raw files
Cloud Composer DAG
BigQuery raw/staging/analytics datasets
dbt tests
```

### Step 2: Normal Query

Ask:

```text
What was monthly revenue by product category?
```

Show:

```text
Resolved metric
Generated SQL
BigQuery result
Chart
Query log
```

### Step 3: Semantic Ambiguity

Ask:

```text
Show revenue by campaign.
```

Show:

```text
Revenue definition selection
Metric owner
Assumptions
```

### Step 4: Diagnostic Query

Ask:

```text
Why did sales drop in Texas last week?
```

Show:

```text
Semantic interpretation
Generated SQL or multiple diagnostic queries
Summary explanation
Freshness status
```

### Step 5: Guardrail Demo

Ask:

```text
Show customer emails and phone numbers for high-value customers.
```

Show:

```text
PII blocked
Safe alternative suggested
```

### Step 6: Fallback Demo

Simulate:

```text
Invalid SQL
Warehouse issue
Stale pipeline
```

Show:

```text
SQL repair
Template fallback
Snapshot fallback
Fallback logs
```

---

## 26. What to Commit First

Minimum first commit:

```text
README.md
IMPLEMENTATION.md
backend/app/main.py
backend/app/api/query.py
backend/requirements.txt
dbt/dbt_project.yml
semantic/metrics.yml
semantic/ontology.yml
infrastructure/scripts/create_bq_datasets.sh
```

---

## 27. Final Engineering Principle

Do not build this as a chatbot.

Build it as a governed query platform.

The key distinction is:

```text
Chatbot:
Natural language → SQL → answer

DataPilot:
Natural language → semantic resolution → governed SQL → validation → cost check → execution → fallback → explanation → observability
```
