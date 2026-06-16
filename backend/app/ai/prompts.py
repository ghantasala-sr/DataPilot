from typing import Dict, Any

def build_intent_prompt(query: str, vocabulary: Dict[str, Any]) -> str:
    """Builds a prompt to classify user intent."""
    return f"""
    You are an expert data analyst assistant. Classify the user's data query into one of the following intents:
    - METRIC_QUERY: Asking for a specific number, trend, or KPI (e.g., "What is our revenue this month?")
    - DIAGNOSTIC_QUERY: Asking why something happened (e.g., "Why did sales drop last week?")
    - PREDICTIVE_QUERY: Asking for a forecast (e.g., "What will revenue be next month?")
    - EXPLORATORY_QUERY: Open-ended data exploration (e.g., "Show me customer behavior patterns")
    - UNKNOWN: The query is not related to data or cannot be classified.

    User Query: "{query}"

    Respond ONLY with the classification label.
    """

def build_sql_prompt(query: str, schema_context: str, semantic_context: str) -> str:
    """Builds a prompt to generate BigQuery SQL."""
    return f"""
    You are an expert BigQuery SQL developer. Your task is to translate a user's natural language question into a valid, executable BigQuery SQL query.

    Use the following schema and semantic context to write the query.
    
    SCHEMA CONTEXT:
    {schema_context}
    
    SEMANTIC CONTEXT (Metrics, Definitions, Policies):
    {semantic_context}

    USER QUESTION: "{query}"

    CRITICAL RULES:
    1. Respond ONLY with the raw SQL code. No markdown formatting, no explanations, no code blocks (do not use ```sql ... ```).
    2. Use standard BigQuery SQL syntax.
    3. Ensure table names are fully qualified if necessary or use the provided table names exactly.
    4. Adhere to any data access policies or row-level filters specified in the semantic context.
    """

def build_explanation_prompt(query: str, sql: str, data_summary: str) -> str:
    """Builds a prompt to explain the data results to the user."""
    return f"""
    You are a helpful data analyst. Explain the results of a data query to a business user in a clear, concise, and actionable way.

    USER QUESTION: "{query}"
    
    SQL EXECUTED: 
    {sql}
    
    DATA SUMMARY (first few rows or aggregate):
    {data_summary}

    Provide a brief, human-readable answer. Highlight key takeaways. Do not show the SQL unless asked.
    """
