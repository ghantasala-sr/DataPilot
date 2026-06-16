#!/bin/bash
set -e

PROJECT_ID=$(gcloud config get-value project)
DATASET="datapilot_semantic"

echo "Creating semantic tables in ${PROJECT_ID}:${DATASET}..."

# 1. user_accounts
bq query --use_legacy_sql=false \
"CREATE TABLE IF NOT EXISTS \`${PROJECT_ID}.${DATASET}.user_accounts\` (
    user_id STRING NOT NULL,
    email STRING NOT NULL,
    tenant_id STRING NOT NULL,
    role STRING NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);"

# 2. business_glossary
bq query --use_legacy_sql=false \
"CREATE TABLE IF NOT EXISTS \`${PROJECT_ID}.${DATASET}.business_glossary\` (
    term STRING NOT NULL,
    definition STRING NOT NULL,
    synonyms ARRAY<STRING>,
    domain STRING,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);"

# 3. access_policies
bq query --use_legacy_sql=false \
"CREATE TABLE IF NOT EXISTS \`${PROJECT_ID}.${DATASET}.access_policies\` (
    role STRING NOT NULL,
    allowed_domains ARRAY<STRING>,
    restricted_tables ARRAY<STRING>,
    row_level_filters STRING
);"

echo "Populating initial mock data..."

# Insert mock user for testing
bq query --use_legacy_sql=false \
"MERGE \`${PROJECT_ID}.${DATASET}.user_accounts\` T
USING (SELECT 'test-user-id' as user_id, 'admin@example.com' as email, 'tenant_1' as tenant_id, 'admin' as role) S
ON T.user_id = S.user_id
WHEN NOT MATCHED THEN
  INSERT(user_id, email, tenant_id, role) VALUES(S.user_id, S.email, S.tenant_id, S.role);"

echo "Done creating semantic tables."
