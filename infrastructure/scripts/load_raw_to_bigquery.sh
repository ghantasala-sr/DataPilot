#!/usr/bin/env bash
# load_raw_to_bigquery.sh — Load local CSV data into DataPilot raw BigQuery tables.
set -euo pipefail

if [ -f .env ]; then
  set -a; source .env; set +a
fi

PROJECT_ID="${PROJECT_ID:?PROJECT_ID must be set}"
BQ_LOCATION="${BQ_LOCATION:-US}"
RAW_DATASET="${RAW_DATASET:-datapilot_raw}"

DATA_DIR="${DATA_DIR:-data}"

echo "Loading raw CSV data into ${PROJECT_ID}:${RAW_DATASET} (${BQ_LOCATION})"

bq --location="${BQ_LOCATION}" mk \
  --dataset \
  --description="DataPilot raw dataset" \
  --default_table_expiration=0 \
  "${PROJECT_ID}:${RAW_DATASET}" 2>/dev/null || echo "  Dataset already exists."

load_csv() {
  local table_name="$1"
  local csv_path="$2"

  if [ ! -f "${csv_path}" ]; then
    echo "Missing required CSV: ${csv_path}" >&2
    exit 1
  fi

  echo "  -> ${RAW_DATASET}.${table_name} <= ${csv_path}"
  bq --location="${BQ_LOCATION}" load \
    --replace \
    --source_format=CSV \
    --skip_leading_rows=1 \
    --allow_quoted_newlines \
    --autodetect \
    "${PROJECT_ID}:${RAW_DATASET}.${table_name}" \
    "${csv_path}"
}

load_csv_with_schema() {
  local table_name="$1"
  local csv_path="$2"
  local schema="$3"

  if [ ! -f "${csv_path}" ]; then
    echo "Missing required CSV: ${csv_path}" >&2
    exit 1
  fi

  echo "  -> ${RAW_DATASET}.${table_name} <= ${csv_path}"
  bq --location="${BQ_LOCATION}" load \
    --replace \
    --source_format=CSV \
    --skip_leading_rows=1 \
    --allow_quoted_newlines \
    "${PROJECT_ID}:${RAW_DATASET}.${table_name}" \
    "${csv_path}" \
    "${schema}"
}

load_csv raw_orders "${DATA_DIR}/olist/olist_orders_dataset.csv"
load_csv raw_order_items "${DATA_DIR}/olist/olist_order_items_dataset.csv"
load_csv raw_payments "${DATA_DIR}/olist/olist_order_payments_dataset.csv"
load_csv raw_customers "${DATA_DIR}/olist/olist_customers_dataset.csv"
load_csv raw_products "${DATA_DIR}/olist/olist_products_dataset.csv"
load_csv_with_schema raw_product_category_translation "${DATA_DIR}/olist/product_category_name_translation.csv" "product_category_name:STRING,product_category_name_english:STRING"
load_csv raw_sellers "${DATA_DIR}/olist/olist_sellers_dataset.csv"
load_csv raw_reviews "${DATA_DIR}/olist/olist_order_reviews_dataset.csv"
load_csv raw_geolocation "${DATA_DIR}/olist/olist_geolocation_dataset.csv"
load_csv raw_campaigns "${DATA_DIR}/synthetic/campaigns.csv"
load_csv raw_campaign_attribution "${DATA_DIR}/synthetic/campaign_attribution.csv"
load_csv raw_support_tickets "${DATA_DIR}/synthetic/support_tickets.csv"
load_csv raw_refund_reasons "${DATA_DIR}/synthetic/refund_reasons.csv"

echo ""
echo "Raw BigQuery load complete."
