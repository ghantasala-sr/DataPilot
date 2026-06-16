"""
Semantic endpoint — exposes the governed business terms and metrics.
"""

from fastapi import APIRouter

from app.semantic.resolver import resolver

router = APIRouter()


@router.get("/semantic/terms")
async def list_terms():
    """
    List all approved business terms from the semantic layer.

    Returns canonical terms, definitions, domains, and synonyms.
    """
    return {
        "terms": resolver.list_terms(),
        "source": "semantic/vocabulary.yml",
    }


@router.get("/metrics")
async def list_metrics():
    """
    List all available metric definitions.

    Returns metric names, SQL formulas, owners, and grain.
    """
    return {
        "metrics": resolver.list_metrics(),
        "source": "semantic/metrics.yml",
    }
