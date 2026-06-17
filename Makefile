.PHONY: help setup-gcp load-raw-data backend-dev backend-test frontend-dev dbt-install dbt-debug dbt-parse dbt-compile dbt-run dbt-test docker-build deploy

PYTHON := .venv/bin/python
PIP := .venv/bin/pip
DBT := ../.venv-dbt/bin/dbt

-include .env
export

help: ## Show this help
	@grep -hE '^[a-zA-Z0-9_-]+:.*## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ─── GCP Setup ───────────────────────────────────────────────

setup-gcp: ## Run all GCP resource creation scripts
	@echo "Creating GCS buckets..."
	bash infrastructure/scripts/create_gcs_buckets.sh
	@echo "Creating BigQuery datasets..."
	bash infrastructure/scripts/create_bq_datasets.sh
	@echo "GCP setup complete."

load-raw-data: ## Load local Olist and synthetic CSVs into BigQuery raw tables
	bash infrastructure/scripts/load_raw_to_bigquery.sh

# ─── Backend ─────────────────────────────────────────────────

backend-install: ## Install backend dependencies
	$(PIP) install -r backend/requirements.txt -r backend/requirements-dev.txt

backend-dev: ## Run backend in dev mode
	cd backend && ../$(PYTHON) -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8080

backend-test: ## Run backend tests with coverage
	cd backend && ../$(PYTHON) -m pytest tests/ -v --tb=short --cov=app --cov-report=term-missing

backend-lint: ## Lint backend code
	cd backend && ../$(PYTHON) -m ruff check app/ tests/

# ─── Frontend ────────────────────────────────────────────────

frontend-install: ## Install frontend dependencies
	cd frontend && npm install

frontend-dev: ## Run frontend in dev mode
	cd frontend && npm run dev

frontend-build: ## Build frontend for production
	cd frontend && npm run build

# ─── dbt ─────────────────────────────────────────────────────

dbt-run: ## Run all dbt models
	cd dbt && $(DBT) run --profiles-dir .

dbt-test: ## Run dbt tests
	cd dbt && $(DBT) test --profiles-dir .

dbt-install: ## Install dbt dependencies into the Python 3.11 dbt venv
	/opt/homebrew/bin/python3.11 -m venv .venv-dbt
	cd dbt && ../.venv-dbt/bin/pip install -r requirements-dbt.txt

dbt-parse: ## Parse dbt project without running warehouse queries
	cd dbt && $(DBT) parse --profiles-dir .

dbt-debug: ## Check dbt profile and BigQuery connection
	cd dbt && $(DBT) debug --profiles-dir .

dbt-compile: ## Compile dbt project without building warehouse tables
	cd dbt && $(DBT) compile --profiles-dir .

dbt-docs: ## Generate and serve dbt docs
	cd dbt && $(DBT) docs generate --profiles-dir . && $(DBT) docs serve --profiles-dir .

# ─── Docker ──────────────────────────────────────────────────

docker-build-backend: ## Build backend Docker image
	docker build -f backend/Dockerfile -t datapilot-backend:latest .

docker-build-frontend: ## Build frontend Docker image
	docker build -t datapilot-frontend:latest frontend/

docker-build: docker-build-backend docker-build-frontend ## Build all Docker images

# ─── Deployment ──────────────────────────────────────────────

deploy: ## Deploy to Cloud Run
	bash infrastructure/scripts/deploy_cloud_run.sh
