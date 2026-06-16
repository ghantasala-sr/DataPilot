#!/usr/bin/env bash
# create_bq_datasets.sh — Create all DataPilot BigQuery datasets
set -euo pipefail

# ─── Load environment ──────────────────────────────────────────
if [ -f .env ]; then
  set -a; source .env; set +a
fi

PROJECT_ID="${PROJECT_ID:?PROJECT_ID must be set}"
BQ_LOCATION="${BQ_LOCATION:-US}"

echo "Creating BigQuery datasets in project: ${PROJECT_ID} (location: ${BQ_LOCATION})"

DATASETS=(
  "datapilot_raw"
  "datapilot_staging"
  "datapilot_analytics"
  "datapilot_semantic"
  "datapilot_observability"
)

for dataset in "${DATASETS[@]}"; do
  echo "  → ${dataset}"
  bq --location="${BQ_LOCATION}" mk \
    --dataset \
    --description="DataPilot ${dataset} dataset" \
    --default_table_expiration=0 \
    "${PROJECT_ID}:${dataset}" 2>/dev/null || echo "    (already exists)"
done

echo ""
echo "✓ All BigQuery datasets created."
