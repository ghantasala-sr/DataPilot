#!/usr/bin/env bash
# create_gcs_buckets.sh — Create DataPilot GCS buckets
set -euo pipefail

# ─── Load environment ──────────────────────────────────────────
if [ -f .env ]; then
  set -a; source .env; set +a
fi

PROJECT_ID="${PROJECT_ID:?PROJECT_ID must be set}"
REGION="${REGION:-us-central1}"
RAW_BUCKET="${RAW_BUCKET:-datapilot-raw-${PROJECT_ID}}"
SNAPSHOT_BUCKET="${SNAPSHOT_BUCKET:-datapilot-snapshots-${PROJECT_ID}}"

echo "Creating GCS buckets in project: ${PROJECT_ID} (region: ${REGION})"

# ─── Raw data bucket ──────────────────────────────────────────
echo "  → gs://${RAW_BUCKET}"
gsutil mb -l "${REGION}" -p "${PROJECT_ID}" "gs://${RAW_BUCKET}" 2>/dev/null \
  || echo "    (already exists)"

# ─── Snapshot bucket ──────────────────────────────────────────
echo "  → gs://${SNAPSHOT_BUCKET}"
gsutil mb -l "${REGION}" -p "${PROJECT_ID}" "gs://${SNAPSHOT_BUCKET}" 2>/dev/null \
  || echo "    (already exists)"

# ─── Set lifecycle (auto-delete old snapshots after 90 days) ──
cat > /tmp/datapilot_lifecycle.json <<EOF
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {"age": 90, "matchesPrefix": ["marts/"]}
    }
  ]
}
EOF

echo "  → Setting 90-day lifecycle on snapshot bucket"
gsutil lifecycle set /tmp/datapilot_lifecycle.json "gs://${SNAPSHOT_BUCKET}" 2>/dev/null \
  || echo "    (lifecycle set failed — may need bucket to exist first)"
rm -f /tmp/datapilot_lifecycle.json

echo ""
echo "✓ All GCS buckets created."
echo ""
echo "Expected object layout:"
echo "  gs://${RAW_BUCKET}/olist/orders/"
echo "  gs://${RAW_BUCKET}/olist/order_items/"
echo "  gs://${RAW_BUCKET}/olist/payments/"
echo "  gs://${RAW_BUCKET}/olist/customers/"
echo "  gs://${RAW_BUCKET}/olist/products/"
echo "  gs://${RAW_BUCKET}/olist/sellers/"
echo "  gs://${RAW_BUCKET}/olist/reviews/"
echo "  gs://${RAW_BUCKET}/olist/geolocation/"
echo "  gs://${RAW_BUCKET}/synthetic/campaigns/"
echo "  gs://${RAW_BUCKET}/synthetic/support_tickets/"
echo "  gs://${SNAPSHOT_BUCKET}/marts/mart_revenue_daily/"
echo "  gs://${SNAPSHOT_BUCKET}/marts/mart_campaign_roi/"
