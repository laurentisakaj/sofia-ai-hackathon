#!/bin/bash
# deploy-gcp.sh — Automated deployment to Google Cloud Run
# Usage: ./deploy-gcp.sh [PROJECT_ID] [REGION]
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - Docker installed and running
#   - .env file with GEMINI_API_KEY

set -euo pipefail

PROJECT_ID="${1:-${GCP_PROJECT_ID:-sofia-hackathon-2026}}"
REGION="${2:-europe-west1}"
SERVICE_NAME="sofia-ai"
IMAGE="europe-west1-docker.pkg.dev/${PROJECT_ID}/sofia-ai/sofia-ai:latest"

echo "=== Sofia AI — Cloud Run Deployment ==="
echo "Project:  ${PROJECT_ID}"
echo "Region:   ${REGION}"
echo "Service:  ${SERVICE_NAME}"
echo ""

# 1. Enable required APIs
echo "[1/5] Enabling Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  --project="${PROJECT_ID}" --quiet

# 2. Create Artifact Registry repo (if not exists)
echo "[2/5] Ensuring Artifact Registry repository..."
gcloud artifacts repositories describe sofia-ai \
  --project="${PROJECT_ID}" \
  --location="${REGION}" 2>/dev/null || \
gcloud artifacts repositories create sofia-ai \
  --repository-format=docker \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --quiet

# Configure Docker auth
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet 2>/dev/null

# 3. Build Docker image
echo "[3/5] Building Docker image (linux/amd64)..."
docker build --platform linux/amd64 -t "${IMAGE}" .

# 4. Push to Artifact Registry
echo "[4/5] Pushing to Artifact Registry..."
docker push "${IMAGE}"

# 5. Deploy to Cloud Run
echo "[5/5] Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --timeout=3600 \
  --session-affinity \
  --min-instances=0 \
  --max-instances=3 \
  --quiet

# Get service URL
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(status.url)")

echo ""
echo "=== Deployment Complete ==="
echo "URL: ${SERVICE_URL}"
echo ""
echo "To set environment variables:"
echo "  gcloud run services update ${SERVICE_NAME} \\"
echo "    --region=${REGION} --project=${PROJECT_ID} \\"
echo "    --set-env-vars=\"GEMINI_API_KEY=your_key,COOKIE_SECRET=\$(openssl rand -hex 32)\""
