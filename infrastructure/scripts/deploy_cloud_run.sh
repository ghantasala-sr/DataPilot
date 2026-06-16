#!/usr/bin/env bash
# deploy_cloud_run.sh — Build and deploy DataPilot to Cloud Run
set -euo pipefail

# ─── Load environment ──────────────────────────────────────────
if [ -f .env ]; then
  set -a; source .env; set +a
fi

PROJECT_ID="${PROJECT_ID:?PROJECT_ID must be set}"
REGION="${REGION:-us-central1}"
ARTIFACT_REPO="${ARTIFACT_REPO:-datapilot-containers}"

IMAGE_PREFIX="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}"
TAG="${1:-latest}"

echo "═══════════════════════════════════════════════════════"
echo "  DataPilot Cloud Run Deployment"
echo "  Project: ${PROJECT_ID}  Region: ${REGION}  Tag: ${TAG}"
echo "═══════════════════════════════════════════════════════"

# ─── Ensure Artifact Registry exists ──────────────────────────
echo ""
echo "1. Ensuring Artifact Registry repository..."
gcloud artifacts repositories create "${ARTIFACT_REPO}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="DataPilot container images" 2>/dev/null \
  || echo "   (already exists)"

# ─── Build and deploy backend ─────────────────────────────────
echo ""
echo "2. Building backend image..."
gcloud builds submit backend/ \
  --tag "${IMAGE_PREFIX}/datapilot-backend:${TAG}" \
  --quiet

echo ""
echo "3. Deploying backend to Cloud Run..."
gcloud run deploy datapilot-backend \
  --image "${IMAGE_PREFIX}/datapilot-backend:${TAG}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "PROJECT_ID=${PROJECT_ID},BQ_LOCATION=${BQ_LOCATION:-US},GEMINI_MODEL=${GEMINI_MODEL:-gemini-2.5-flash},SEMANTIC_DATASET=datapilot_semantic,ANALYTICS_DATASET=datapilot_analytics,OBSERVABILITY_DATASET=datapilot_observability,SNAPSHOT_BUCKET=datapilot-snapshots-${PROJECT_ID}" \
  --memory 1Gi \
  --cpu 1 \
  --timeout 60 \
  --max-instances 10 \
  --quiet

BACKEND_URL=$(gcloud run services describe datapilot-backend \
  --region "${REGION}" \
  --format 'value(status.url)')

echo "   Backend URL: ${BACKEND_URL}"

# ─── Build and deploy frontend ────────────────────────────────
echo ""
echo "4. Building frontend image..."
gcloud builds submit frontend/ \
  --tag "${IMAGE_PREFIX}/datapilot-frontend:${TAG}" \
  --quiet

echo ""
echo "5. Deploying frontend to Cloud Run..."
gcloud run deploy datapilot-frontend \
  --image "${IMAGE_PREFIX}/datapilot-frontend:${TAG}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "NEXT_PUBLIC_API_URL=${BACKEND_URL}" \
  --memory 512Mi \
  --cpu 1 \
  --timeout 30 \
  --max-instances 5 \
  --quiet

FRONTEND_URL=$(gcloud run services describe datapilot-frontend \
  --region "${REGION}" \
  --format 'value(status.url)')

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✓ Deployment complete!"
echo "  Backend:  ${BACKEND_URL}"
echo "  Frontend: ${FRONTEND_URL}"
echo "═══════════════════════════════════════════════════════"
