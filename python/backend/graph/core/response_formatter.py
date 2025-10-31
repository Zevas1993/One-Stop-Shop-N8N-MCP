"""
Response Formatter for Query Engine

Formats query results into structured responses suitable for agents.
Provides multiple output formats (JSON, markdown, compact) with
consistent structure for agent consumption.

Agent-Focused Features:
- Structured JSON responses
- Confidence scoring for all results
- Agent tips and failure modes included
- Alternative suggestions ranked
- Pattern information included
- Performance metadata included
"""

from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional
from enum import Enum
import json
import logging
from datetime import datetime

from .semantic_search import SearchResult
from .graph_traversal import Path
from .explanation_generator import Explanation

logger = logging.getLogger(__name__)


class ResponseFormat(Enum):
    """Response format types"""
    JSON = "json"                  # Full JSON structure
    COMPACT = "compact"            # Minimal JSON
    MARKDOWN = "markdown"          # Human-readable markdown
    DETAILED = "detailed"          # Detailed with explanations


@dataclass
class QueryResponse:
    """Unified query response structure"""
    query_id: str
    query_type: str                # "search", "traverse", "integrate"
    query_text: str
    timestamp: str
    status: str                    # "success", "partial", "error"
    results: List[Dict[str, Any]]
    explanations: List[Dict[str, Any]]
    paths: List[Dict[str, Any]]
    stats: Dict[str, Any]
    confidence: float              # Overall confidence
    error: Optional[str] = None

    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return asdict(self)

    def to_json(self, indent: Optional[int] = 2) -> str:
        """Convert to JSON string"""
        return json.dumps(self.to_dict(), indent=indent, default=str)


class ResponseFormatter:
    """
    Formats query engine responses for agent consumption

    Ensures consistent structure across different query types
    and output formats.
    """

    def __init__(self):
        """Initialize response formatter"""
        self.response_count = 0
        self.total_response_time_ms = 0.0

    async def format_search_response(
        self,
        query_id: str,
        query_text: str,
        results: List[SearchResult],
        explanations: Optional[List[Explanation]] = None,
        stats: Optional[Dict] = None,
        format_type: ResponseFormat = ResponseFormat.JSON,
    ) -> Any:
        """
        Format search results into response

        Args:
            query_id: Unique query ID
            query_text: Original query
            results: SearchResult objects
            explanations: Optional explanations
            stats: Performance statistics
            format_type: Output format

        Returns:
            Formatted response
        """
        try:
            # Convert results to dicts
            result_dicts = [r.to_dict() for r in results]

            # Convert explanations if provided
            explanation_dicts = []
            if explanations:
                for exp in explanations:
                    explanation_dicts.append({
                        "type": exp.type.value,
                        "summary": exp.summary,
                        "detailed": exp.detailed,
                        "confidence": exp.confidence,
                        "reasoning_steps": exp.reasoning_steps,
                        "caveats": exp.caveats,
                        "examples": exp.examples,
                        "next_steps": exp.next_steps,
                    })

            # Determine status
            if not results:
                status = "no_results"
            elif len(results) < 5:
                status = "partial"
            else:
                status = "success"

            # Calculate overall confidence
            overall_confidence = (
                sum(r.confidence for r in results) / len(results)
                if results else 0.0
            )

            # Create response
            response = QueryResponse(
                query_id=query_id,
                query_type="search",
                query_text=query_text,
                timestamp=datetime.now().isoformat(),
                status=status,
                results=result_dicts,
                explanations=explanation_dicts,
                paths=[],
                stats=stats or {},
                confidence=overall_confidence,
            )

            # Format based on type
            if format_type == ResponseFormat.JSON:
                return response.to_json()
            elif format_type == ResponseFormat.COMPACT:
                return self._format_compact(response)
            elif format_type == ResponseFormat.MARKDOWN:
                return self._format_markdown_search(response)
            elif format_type == ResponseFormat.DETAILED:
                return response.to_dict()
            else:
                return response.to_dict()

        except Exception as e:
            logger.error(f"Error formatting search response: {e}")
            return {
                "error": str(e),
                "status": "error",
            }

    async def format_traverse_response(
        self,
        query_id: str,
        query_text: str,
        paths: List[Path],
        explanations: Optional[List[Explanation]] = None,
        stats: Optional[Dict] = None,
        format_type: ResponseFormat = ResponseFormat.JSON,
    ) -> Any:
        """
        Format traversal results into response

        Args:
            query_id: Unique query ID
            query_text: Original query
            paths: Path objects found
            explanations: Optional explanations
            stats: Performance statistics
            format_type: Output format

        Returns:
            Formatted response
        """
        try:
            # Convert paths to dicts
            path_dicts = [p.to_dict() for p in paths]

            # Convert explanations
            explanation_dicts = []
            if explanations:
                for exp in explanations:
                    explanation_dicts.append({
                        "type": exp.type.value,
                        "summary": exp.summary,
                        "detailed": exp.detailed,
                        "confidence": exp.confidence,
                        "reasoning_steps": exp.reasoning_steps,
                        "caveats": exp.caveats,
                    })

            # Determine status
            if not paths:
                status = "no_paths"
            elif len(paths) == 1:
                status = "partial"
            else:
                status = "success"

            # Calculate overall confidence
            overall_confidence = (
                sum(p.confidence for p in paths) / len(paths)
                if paths else 0.0
            )

            # Create response
            response = QueryResponse(
                query_id=query_id,
                query_type="traverse",
                query_text=query_text,
                timestamp=datetime.now().isoformat(),
                status=status,
                results=[],
                explanations=explanation_dicts,
                paths=path_dicts,
                stats=stats or {},
                confidence=overall_confidence,
            )

            # Format based on type
            if format_type == ResponseFormat.JSON:
                return response.to_json()
            elif format_type == ResponseFormat.COMPACT:
                return self._format_compact(response)
            elif format_type == ResponseFormat.MARKDOWN:
                return self._format_markdown_traverse(response)
            elif format_type == ResponseFormat.DETAILED:
                return response.to_dict()
            else:
                return response.to_dict()

        except Exception as e:
            logger.error(f"Error formatting traverse response: {e}")
            return {
                "error": str(e),
                "status": "error",
            }

    def _format_compact(self, response: QueryResponse) -> Dict:
        """Format response in compact form"""
        compact = {
            "query_id": response.query_id,
            "status": response.status,
            "confidence": round(response.confidence, 3),
            "result_count": len(response.results),
            "path_count": len(response.paths),
        }

        # Add top result if available
        if response.results:
            top = response.results[0]
            compact["top_result"] = {
                "label": top.get("node_label"),
                "confidence": top.get("confidence"),
            }

        # Add shortest path if available
        if response.paths:
            shortest = min(response.paths, key=lambda p: p["length"])
            compact["shortest_path_length"] = shortest["length"]

        return compact

    def _format_markdown_search(self, response: QueryResponse) -> str:
        """Format search response as markdown"""
        markdown = f"# Search Results\n\n"
        markdown += f"**Query:** {response.query_text}\n"
        markdown += f"**Status:** {response.status}\n"
        markdown += f"**Confidence:** {response.confidence:.0%}\n\n"

        if response.results:
            markdown += "## Results\n\n"
            for i, result in enumerate(response.results, 1):
                markdown += f"### {i}. {result['node_label']}\n\n"
                markdown += f"- **Type:** {result['node_type']}\n"
                markdown += f"- **Category:** {result['category']}\n"
                markdown += f"- **Confidence:** {result['confidence']:.0%}\n"

                if result.get('description'):
                    markdown += f"- **Description:** {result['description']}\n"

                if result.get('use_cases'):
                    markdown += f"- **Use Cases:** {', '.join(result['use_cases'])}\n"

                if result.get('agent_tips'):
                    markdown += f"- **Tips:** {', '.join(result['agent_tips'])}\n"

                markdown += "\n"

        if response.explanations:
            markdown += "## Explanations\n\n"
            for exp in response.explanations:
                markdown += f"### {exp['summary']}\n\n"
                markdown += f"{exp['detailed']}\n\n"

                if exp.get('caveats'):
                    markdown += "**Important:**\n"
                    for caveat in exp['caveats']:
                        markdown += f"- {caveat}\n"
                    markdown += "\n"

        return markdown

    def _format_markdown_traverse(self, response: QueryResponse) -> str:
        """Format traverse response as markdown"""
        markdown = f"# Integration Paths\n\n"
        markdown += f"**Query:** {response.query_text}\n"
        markdown += f"**Status:** {response.status}\n"
        markdown += f"**Confidence:** {response.confidence:.0%}\n\n"

        if response.paths:
            markdown += "## Paths Found\n\n"
            for i, path in enumerate(response.paths, 1):
                markdown += f"### Path {i} ({path['length']} hops)\n\n"
                markdown += f"- **Nodes:** {' → '.join(path['nodes'])}\n"
                markdown += f"- **Confidence:** {path['confidence']:.0%}\n"
                markdown += f"- **Strength:** {path['total_strength']:.2f}\n"
                markdown += f"- **Reasoning:** {path['reasoning']}\n\n"

        if response.explanations:
            markdown += "## Guidance\n\n"
            for exp in response.explanations:
                markdown += f"### {exp['summary']}\n\n"
                markdown += f"{exp['detailed']}\n\n"

                if exp.get('next_steps'):
                    markdown += "**Next Steps:**\n"
                    for step in exp['next_steps']:
                        markdown += f"- {step}\n"
                    markdown += "\n"

        return markdown

    def format_error_response(
        self,
        query_id: str,
        query_text: str,
        error: str,
        format_type: ResponseFormat = ResponseFormat.JSON,
    ) -> Any:
        """
        Format error response

        Args:
            query_id: Query ID
            query_text: Original query
            error: Error message
            format_type: Output format

        Returns:
            Formatted error response
        """
        response = QueryResponse(
            query_id=query_id,
            query_type="error",
            query_text=query_text,
            timestamp=datetime.now().isoformat(),
            status="error",
            results=[],
            explanations=[],
            paths=[],
            stats={},
            confidence=0.0,
            error=error,
        )

        if format_type == ResponseFormat.JSON:
            return response.to_json()
        else:
            return response.to_dict()
