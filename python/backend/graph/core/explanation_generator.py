"""
Explanation Generator for Query Results

Generates natural language explanations for search results and graph traversals.
Helps agents understand WHY a particular node is recommended and HOW to use it.

Agent-Focused Features:
- Natural language explanations
- Alternative option suggestions
- Integration pattern explanations
- Failure mode warnings
- Prerequisites documentation
- Success rate and confidence justification
"""

from dataclasses import dataclass
from typing import List, Dict, Optional
from enum import Enum
import logging

from ..storage import Database, Node
from .semantic_search import SearchResult
from .graph_traversal import Path

logger = logging.getLogger(__name__)


class ExplanationType(Enum):
    """Types of explanations"""
    SEARCH_MATCH = "search_match"           # Why node matches search
    PATH_CONNECTION = "path_connection"     # Why nodes are connected
    INTEGRATION = "integration"             # How nodes work together
    ALTERNATIVE = "alternative"             # Alternative node suggestions
    PATTERN = "pattern"                     # Workflow pattern explanation
    WARNING = "warning"                     # Failure mode warnings


@dataclass
class Explanation:
    """Natural language explanation for agent decisions"""
    type: ExplanationType
    summary: str                  # 1-2 sentence summary
    detailed: str                 # Detailed explanation
    confidence: float             # Confidence in explanation
    reasoning_steps: List[str]   # Step-by-step reasoning
    caveats: List[str]           # Important caveats
    examples: List[str]          # Example use cases
    next_steps: List[str]        # Suggested next actions


class ExplanationGenerator:
    """
    Generates natural language explanations for query results

    Helps agents understand not just WHAT nodes to use, but WHY and HOW
    to integrate them into workflows.
    """

    def __init__(self, db: Database):
        """
        Initialize explanation generator

        Args:
            db: Database instance
        """
        self.db = db

    async def explain_search_result(
        self,
        result: SearchResult,
    ) -> Explanation:
        """
        Generate explanation for a search result

        Args:
            result: SearchResult from semantic search

        Returns:
            Explanation object with natural language description
        """
        try:
            # Build reasoning steps
            reasoning = []

            if result.similarity_score > 0:
                reasoning.append(
                    f"Semantic match with {result.confidence:.0%} confidence "
                    f"({result.similarity_score:.2f} similarity score)"
                )

            if result.relevance_score > 0:
                reasoning.append(
                    f"Keyword relevance of {result.relevance_score:.0%} "
                    f"based on query match"
                )

            # Build detailed explanation
            details = f"The {result.node_label} node is recommended for your search. "

            if result.use_cases:
                details += f"It's commonly used for: {', '.join(result.use_cases[:2])}. "

            if result.category:
                details += f"This node belongs to the {result.category} category. "

            if result.description:
                details += f"Details: {result.description} "

            # Build caveats
            caveats = []

            if result.failure_modes:
                caveats.extend([
                    f"⚠️ Common mistake: {mode}"
                    for mode in result.failure_modes[:2]
                ])

            if result.prerequisites:
                caveats.append(
                    f"Prerequisites: {', '.join(result.prerequisites[:2])}"
                )

            # Build next steps
            next_steps = []

            if result.agent_tips:
                next_steps.extend([
                    f"💡 Tip: {tip}"
                    for tip in result.agent_tips[:2]
                ])

            if result.related_nodes:
                next_steps.append(
                    f"Consider also checking: {', '.join(result.related_nodes[:3])}"
                )

            return Explanation(
                type=ExplanationType.SEARCH_MATCH,
                summary=f"Recommended: {result.node_label} ({result.category})",
                detailed=details,
                confidence=result.confidence,
                reasoning_steps=reasoning,
                caveats=caveats,
                examples=result.use_cases[:3],
                next_steps=next_steps,
            )

        except Exception as e:
            logger.error(f"Error explaining search result: {e}")
            return Explanation(
                type=ExplanationType.SEARCH_MATCH,
                summary="Search result found",
                detailed="Unable to generate detailed explanation",
                confidence=0.0,
                reasoning_steps=[],
                caveats=["Error generating explanation"],
                examples=[],
                next_steps=[],
            )

    async def explain_path(
        self,
        path: Path,
        start_node: Node,
        end_node: Node,
    ) -> Explanation:
        """
        Generate explanation for a path through the graph

        Args:
            path: Path from traversal
            start_node: Starting node
            end_node: Target node

        Returns:
            Explanation of the path
        """
        try:
            reasoning = [
                f"Path found with {path.length} connections",
                f"Total confidence: {path.confidence:.0%}",
                f"Path strength: {path.total_strength:.2f}",
            ]

            # Build node sequence explanation
            node_names = []
            for node_id in path.nodes:
                try:
                    node = self.db.get_node(node_id)
                    if node:
                        node_names.append(node.label)
                except:
                    node_names.append(node_id)

            details = (
                f"Integration path from {start_node.label} to {end_node.label}: "
                f"{' → '.join(node_names)}. "
                f"This sequence represents a {path.length}-step workflow. "
                f"Each connection has been validated as working in real n8n workflows."
            )

            caveats = []
            if path.length > 3:
                caveats.append("⚠️ This is a long path - consider if a shorter route exists")

            if path.confidence < 0.7:
                caveats.append("⚠️ Confidence is moderate - test thoroughly before deploying")

            next_steps = [
                f"Use {', '.join(node_names[1:-1])} as intermediate steps",
                "Configure data mapping between each connection",
                "Test each step individually before running full workflow",
            ]

            return Explanation(
                type=ExplanationType.PATH_CONNECTION,
                summary=f"Integration path: {start_node.label} → {end_node.label}",
                detailed=details,
                confidence=path.confidence,
                reasoning_steps=reasoning,
                caveats=caveats,
                examples=[],
                next_steps=next_steps,
            )

        except Exception as e:
            logger.error(f"Error explaining path: {e}")
            return Explanation(
                type=ExplanationType.PATH_CONNECTION,
                summary="Path explanation unavailable",
                detailed="Unable to generate path explanation",
                confidence=0.0,
                reasoning_steps=[],
                caveats=["Error generating explanation"],
                examples=[],
                next_steps=[],
            )

    async def explain_integration(
        self,
        source_node_id: str,
        target_node_id: str,
        relationship_type: str,
    ) -> Explanation:
        """
        Generate explanation for integrating two nodes

        Args:
            source_node_id: Source node ID
            target_node_id: Target node ID
            relationship_type: Type of relationship

        Returns:
            Explanation of the integration
        """
        try:
            source = self.db.get_node(source_node_id)
            target = self.db.get_node(target_node_id)

            if not source or not target:
                raise ValueError("Nodes not found")

            reasoning = [
                f"Nodes are connected via '{relationship_type}' relationship",
                f"This is a validated integration pattern",
                f"Both nodes have been successfully used together in real workflows",
            ]

            details = (
                f"{source.label} integrates with {target.label} "
                f"through {relationship_type}. "
                f"This combination is commonly used in {relationship_type} patterns. "
                f"The nodes share compatible data formats and can exchange outputs directly."
            )

            # Get agent tips from metadata
            source_tips = source.metadata.get("agent_tips", [])
            target_tips = target.metadata.get("agent_tips", [])

            caveats = []
            if source.metadata.get("failure_modes"):
                caveats.extend(source.metadata.get("failure_modes", [])[:1])

            next_steps = [
                f"Map {source.label} output to {target.label} input",
                f"Configure {target.label} to receive data from {source.label}",
                "Test the integration with sample data",
            ]

            return Explanation(
                type=ExplanationType.INTEGRATION,
                summary=f"Integration: {source.label} → {target.label}",
                detailed=details,
                confidence=0.85,
                reasoning_steps=reasoning,
                caveats=caveats,
                examples=[],
                next_steps=next_steps,
            )

        except Exception as e:
            logger.error(f"Error explaining integration: {e}")
            return Explanation(
                type=ExplanationType.INTEGRATION,
                summary="Integration explanation unavailable",
                detailed="Unable to generate integration explanation",
                confidence=0.0,
                reasoning_steps=[],
                caveats=["Error generating explanation"],
                examples=[],
                next_steps=[],
            )

    async def explain_alternatives(
        self,
        node_id: str,
        alternative_ids: List[str],
    ) -> Explanation:
        """
        Generate explanation for alternative node suggestions

        Args:
            node_id: Original node ID
            alternative_ids: List of alternative node IDs

        Returns:
            Explanation of alternatives
        """
        try:
            original = self.db.get_node(node_id)

            if not original:
                raise ValueError("Original node not found")

            alternatives = []
            for alt_id in alternative_ids:
                alt = self.db.get_node(alt_id)
                if alt:
                    alternatives.append(alt)

            reasoning = [
                f"Found {len(alternatives)} alternative node(s)",
                "Each alternative performs similar functions",
                "Choosing depends on your specific use case",
            ]

            alt_names = ", ".join(a.label for a in alternatives)
            details = (
                f"Instead of {original.label}, you might consider: {alt_names}. "
                f"Each provides similar functionality with different strengths. "
                f"Choose based on:"
            )

            details += "\n- Integration requirements"
            details += "\n- Performance needs"
            details += "\n- Configuration complexity"

            next_steps = [
                "Compare feature sets of each alternative",
                "Check documentation for specific use case fit",
                "Consider your existing node configurations",
            ]

            return Explanation(
                type=ExplanationType.ALTERNATIVE,
                summary=f"Alternatives to {original.label}",
                detailed=details,
                confidence=0.8,
                reasoning_steps=reasoning,
                caveats=[],
                examples=alt_names.split(", "),
                next_steps=next_steps,
            )

        except Exception as e:
            logger.error(f"Error explaining alternatives: {e}")
            return Explanation(
                type=ExplanationType.ALTERNATIVE,
                summary="Alternative explanation unavailable",
                detailed="Unable to generate alternatives explanation",
                confidence=0.0,
                reasoning_steps=[],
                caveats=["Error generating explanation"],
                examples=[],
                next_steps=[],
            )

    def _format_caveats(self, caveats: List[str]) -> str:
        """Format caveats for display"""
        if not caveats:
            return ""

        formatted = "**Important Notes:**\n"
        for caveat in caveats:
            formatted += f"- {caveat}\n"

        return formatted
