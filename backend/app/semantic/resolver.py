import yaml
import os
from typing import Dict, Any, List, Optional
from google.cloud import bigquery

class SemanticResolver:
    """
    Resolves business concepts, metrics, and policies from YAML configs and BigQuery.
    """
    def __init__(self, config_dir: str = "../../../semantic"):
        self.config_dir = os.environ.get(
            "SEMANTIC_CONFIG_DIR",
            os.path.abspath(os.path.join(os.path.dirname(__file__), config_dir)),
        )
        self.project_id = os.environ.get('PROJECT_ID', '')
        self.dataset_id = f"{self.project_id}.datapilot_semantic" if self.project_id else "datapilot_semantic"
        
        # Load local YAML configs
        self.vocabulary = self._load_yaml("vocabulary")
        self.taxonomy = self._load_yaml("taxonomy")
        self.ontology = self._load_yaml("ontology")
        self.metrics = self._load_yaml("metrics")
        self.policies = self._load_yaml("policies")
        self.templates = self._load_yaml("template_queries")

    @property
    def bq_client(self):
        if not hasattr(self, '_bq_client'):
            self._bq_client = bigquery.Client()
        return self._bq_client

    def _load_yaml(self, basename: str) -> Dict[str, Any]:
        candidates = [
            os.path.join(self.config_dir, f"{basename}.yml"),
            os.path.join(self.config_dir, f"{basename}.yaml"),
            os.path.join(self.config_dir, basename),
        ]
        filepath = next((path for path in candidates if os.path.exists(path)), None)
        if not filepath:
            print(f"Warning: Semantic config {candidates[0]} not found.")
            return {}
        with open(filepath, 'r') as f:
            return yaml.safe_load(f) or {}

    def list_terms(self) -> List[Dict[str, Any]]:
        """Return controlled vocabulary terms from local semantic YAML."""
        terms = self.vocabulary.get("terms", {})
        return [
            {
                "term": term,
                "canonical_term": definition.get("canonical_term", term),
                "definition": definition.get("definition", ""),
                "domain": definition.get("domain", ""),
                "approved_meanings": definition.get("approved_meanings", []),
                "default_by_role": definition.get("default_by_role", {}),
            }
            for term, definition in terms.items()
        ]

    def list_metrics(self) -> List[Dict[str, Any]]:
        """Return approved metric definitions from local semantic YAML."""
        metrics = self.metrics.get('metrics', {})
        if isinstance(metrics, dict):
            return [
                {"metric_id": metric_id, **definition}
                for metric_id, definition in metrics.items()
                if definition.get("status") == "approved"
            ]
        return [metric for metric in metrics if metric.get("status") == "approved"]

    def resolve_concept(self, term: str) -> Optional[Dict[str, Any]]:
        """Resolve a business concept from the BQ business glossary."""
        if not os.environ.get('PROJECT_ID'):
             # fallback for testing
             return None
        
        query = f"""
            SELECT definition, synonyms, domain
            FROM `{self.dataset_id}.business_glossary`
            WHERE LOWER(term) = LOWER(@term)
            OR LOWER(@term) IN UNNEST(synonyms)
            LIMIT 1
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("term", "STRING", term)
            ]
        )
        try:
            results = list(self.bq_client.query(query, job_config=job_config).result())
            
            if not results:
                return None
                
            row = results[0]
            return {
                "term": term,
                "definition": row.definition,
                "synonyms": row.synonyms,
                "domain": row.domain
            }
        except Exception as e:
            print(f"Error resolving concept {term}: {e}")
            return None

    def get_metric_definition(self, metric_name: str) -> Optional[Dict[str, Any]]:
        """Retrieve metric definition from metrics.yaml."""
        metrics = self.metrics.get('metrics', {})
        if isinstance(metrics, dict):
            metric = metrics.get(metric_name)
            return {"metric_id": metric_name, **metric} if metric else None

        for metric in metrics:
            if metric.get('name') == metric_name or metric.get("metric_name") == metric_name:
                return metric
        return None

    def get_policies_for_role(self, role: str) -> List[Dict[str, Any]]:
        """Retrieve policies that mention the user's role."""
        policies = self.policies.get('policies', [])
        return [
            policy for policy in policies
            if role in policy.get("allowed_roles", []) or role in policy.get("blocked_roles", [])
        ]

    def get_policy(self, policy_name: str) -> Optional[Dict[str, Any]]:
        """Retrieve policy definition by id for compatibility."""
        policies = self.policies.get('policies', [])
        for policy in policies:
            if policy.get('name') == policy_name or policy.get("policy_id") == policy_name:
                return policy
        return None
        
    def get_template(self, intent_name: str) -> Optional[str]:
        """Retrieve SQL template for a specific intent."""
        templates = self.templates.get('templates', [])
        for template in templates:
            if template.get('intent') == intent_name or template.get("intent_name") == intent_name:
                return template.get('sql_template') or template.get("sql")
        return None

    def match_template(self, question: str) -> Optional[Dict[str, Any]]:
        """Find a pre-approved template using configured trigger phrases."""
        normalized = question.lower()
        templates = self.templates.get('templates', [])
        for template in templates:
            triggers = template.get("trigger_phrases", [])
            if any(trigger.lower() in normalized for trigger in triggers):
                return template
        return None

    def resolve_metric_for_question(self, question: str, role: str) -> Optional[Dict[str, Any]]:
        """Resolve the best metric using role defaults and context trigger rules."""
        normalized = question.lower()
        terms = self.vocabulary.get("terms", {})
        synonyms = self.vocabulary.get("synonyms", {})
        for term, definition in terms.items():
            synonym_matches = [
                alias for alias, canonical in synonyms.items()
                if canonical == term and alias in normalized
            ]
            if term in normalized or synonym_matches:
                metric_id = definition.get("default_by_role", {}).get(role)
                if metric_id:
                    return self.get_metric_definition(metric_id)

        for rule in self.metrics.get("context_rules", []):
            if rule.get("user_role") == role and any(word.lower() in normalized for word in rule.get("trigger_words", [])):
                return self.get_metric_definition(rule.get("metric_id"))

        return None

resolver = SemanticResolver()
