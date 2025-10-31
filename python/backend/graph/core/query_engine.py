"""
Query Engine for Agentic GraphRAG

Orchestrates semantic search, graph traversal, and explanation generation
to provide intelligent node recommendations to n8n agents.

Agent-Focused Features:
- Semantic similarity search with embeddings
- Multi-hop path finding for integrations
- Natural language explanations
- Alternative suggestions
- Confidence scoring for decision support
- Performance optimized (<50ms target)
"""

from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple
from enum import Enum
import logging
import time
import uuid
import numpy as np

from ..storage import Database, Node
from .semantic_search import SemanticSearchEngine, SearchResult
from .graph_traversal import GraphTraversalEngine, Path
from .explanation_generator import ExplanationGenerator, Explanation
from .response_formatter import ResponseFormatter, ResponseFormat, QueryResponse

logger = logging.getLogger(__name__)


class QueryType(Enum):
    """Types of queries"""
    SEARCH = "search"              # Find nodes by meaning
    INTEGRATE = "integrate"        # Find integration paths
    SUGGEST = "suggest"            # Get suggestions
    VALIDATE = "validate"          # Validate workflow


@dataclass
class QueryRequest:
    """Query request structure"""
    query_id: str
    query_type: QueryType
    query_text: str
    embedding: Optional[np.ndarray] = None
    limit: int = 10
    category_filter: Optional[str] = None
    node_type_filter: Optional[str] = None
    min_confidence: float = 0.3
    include_explanations: bool = True
    include_paths: bool = False


@dataclass
class QueryStats:
    """Statistics for a query"""
    total_time_ms: float
    search_time_ms: float
    traversal_time_ms: float
    explanation_time_ms: float
    formatting_time_ms: float
    results_count: int
    paths_count: int


class QueryEngine:
    """
    Main query engine for Agentic GraphRAG

    Orchestrates semantic search, graph traversal, explanation generation,
    and response formatting to provide intelligent recommendations to agents.
    """

    def __init__(self, db: Database):
        """
        Initialize query engine

        Args:
            db: Database instance
        """
        self.db = db
        self.search_engine = SemanticSearchEngine(db)
        self.traversal_engine = GraphTraversalEngine(db)
        self.explanation_generator = ExplanationGenerator(db)
        self.response_formatter = ResponseFormatter()

        self.query_stats = {
            "total_queries": 0,
            "successful_queries": 0,
            "failed_queries": 0,
            "avg_query_time_ms": 0.0,
            "last_query_time": None,
        }

    async def query(
        self,
        query_text: str,
        query_type: QueryType = QueryType.SEARCH,
        embedding: Optional[np.ndarray] = None,
        limit: int = 10,
        category_filter: Optional[str] = None,
        include_explanations: bool = True,
        include_paths: bool = False,
        response_format: ResponseFormat = ResponseFormat.JSON,
    ) -> str:
        """
        Execute a query against the graph

        Args:
            query_text: Query text
            query_type: Type of query
            embedding: Pre-computed embedding (optional)
            limit: Max results
            category_filter: Filter by category
            include_explanations: Include natural language explanations
            include_paths: Include integration paths
            response_format: Output format

        Returns:
            Formatted response string
        """
        query_id = str(uuid.uuid4())[:8]
        start_time = time.time()

        try:
            logger.info(f"Query {query_id}: {query_type.value} - {query_text[:50]}")

            # Create request
            request = QueryRequest(
                query_id=query_id,
                query_type=query_type,
                query_text=query_text,
                embedding=embedding,
                limit=limit,
                category_filter=category_filter,
                min_confidence=0.3,
                include_explanations=include_explanations,
                include_paths=include_paths,
            )

            # Execute appropriate query
            if query_type == QueryType.SEARCH:
                response_data = await self._handle_search_query(request, response_format)
            elif query_type == QueryType.INTEGRATE:
                response_data = await self._handle_integrate_query(request, response_format)
            elif query_type == QueryType.SUGGEST:
                response_data = await self._handle_suggest_query(request, response_format)
            elif query_type == QueryType.VALIDATE:
                response_data = await self._handle_validate_query(request, response_format)
            else:
                raise ValueError(f"Unknown query type: {query_type}")

            # Update stats
            elapsed = (time.time() - start_time) * 1000
            self._update_stats(elapsed, success=True)

            logger.info(f"Query {query_id} completed in {elapsed:.2f}ms")

            return response_data

        except Exception as e:
            logger.error(f"Query {query_id} error: {e}")
            elapsed = (time.time() - start_time) * 1000
            self._update_stats(elapsed, success=False)

            return await self.response_formatter.format_error_response(
                query_id,
                query_text,
                str(e),
                response_format,
            )

    async def _handle_search_query(
        self,
        request: QueryRequest,
        response_format: ResponseFormat,
    ) -> str:
        """Handle semantic search query"""
        search_start = time.time()

        try:
            # Use embedding if provided, otherwise do keyword search
            if request.embedding is not None:
                results = await self.search_engine.semantic_search(
                    request.embedding,
                    limit=request.limit,
                    category_filter=request.category_filter,
                    min_confidence=request.min_confidence,
                )
            else:
                results = await self.search_engine.keyword_search(
                    request.query_text,
                    limit=request.limit,
                    category_filter=request.category_filter,
                )

            search_time = (time.time() - search_start) * 1000

            # Generate explanations if requested
            explanations = []
            explain_start = time.time()

            if request.include_explanations and results:
                for result in results[:3]:  # Only explain top 3
                    exp = await self.explanation_generator.explain_search_result(result)
                    explanations.append(exp)

            explain_time = (time.time() - explain_start) * 1000

            # Format response
            format_start = time.time()

            stats = {
                "search_time_ms": round(search_time, 2),
                "explanation_time_ms": round(explain_time, 2),
                "results_count": len(results),
            }

            response = await self.response_formatter.format_search_response(
                request.query_id,
                request.query_text,
                results,
                explanations,
                stats,
                response_format,
            )

            return response

        except Exception as e:
            logger.error(f"Search query error: {e}")
            raise

    async def _handle_integrate_query(
        self,
        request: QueryRequest,
        response_format: ResponseFormat,
    ) -> str:
        """Handle integration path query"""
        try:
            # Parse query to extract source and target
            parts = request.query_text.split(" to ")
            if len(parts) != 2:
                raise ValueError("Integration query must be in format: 'Node1 to Node2'")

            source_label = parts[0].strip()
            target_label = parts[1].strip()

            # Find nodes by label
            all_nodes = self.db.get_nodes()
            source = None
            target = None

            for node in all_nodes:
                if source_label.lower() in node.label.lower():
                    source = node
                if target_label.lower() in node.label.lower():
                    target = node

            if not source or not target:
                raise ValueError(f"Could not find nodes matching '{source_label}' or '{target_label}'")

            # Find paths
            traverse_start = time.time()

            # Try to find multiple paths
            paths = await self.traversal_engine.find_all_paths(
                source.id,
                target.id,
                max_hops=4,
                max_paths=3,
            )

            traverse_time = (time.time() - traverse_start) * 1000

            # Generate explanations
            explanations = []
            explain_start = time.time()

            if request.include_explanations and paths:
                for path in paths[:2]:
                    exp = await self.explanation_generator.explain_path(
                        path,
                        source,
                        target,
                    )
                    explanations.append(exp)

            explain_time = (time.time() - explain_start) * 1000

            # Format response
            stats = {
                "traversal_time_ms": round(traverse_time, 2),
                "explanation_time_ms": round(explain_time, 2),
                "paths_count": len(paths),
            }

            response = await self.response_formatter.format_traverse_response(
                request.query_id,
                request.query_text,
                paths,
                explanations,
                stats,
                response_format,
            )

            return response

        except Exception as e:
            logger.error(f"Integration query error: {e}")
            raise

    async def _handle_suggest_query(
        self,
        request: QueryRequest,
        response_format: ResponseFormat,
    ) -> str:
        """Handle suggestion query"""
        try:
            # Get node by label
            all_nodes = self.db.get_nodes()
            target_node = None

            for node in all_nodes:
                if request.query_text.lower() in node.label.lower():
                    target_node = node
                    break

            if not target_node:
                raise ValueError(f"Could not find node matching '{request.query_text}'")

            # Get alternatives from related nodes
            out_edges = self.db.get_edges_from_node(target_node.id)
            in_edges = self.db.get_edges_to_node(target_node.id)

            alternatives = []
            seen = set()

            for edge in out_edges + in_edges:
                other_id = edge.target_id if edge.source_id == target_node.id else edge.source_id
                if other_id not in seen:
                    alternatives.append(other_id)
                    seen.add(other_id)

            # Create result objects for alternatives
            results = []
            for alt_id in alternatives[:request.limit]:
                node = self.db.get_node(alt_id)
                if node:
                    result = SearchResult(
                        node_id=node.id,
                        node_label=node.label,
                        node_type=node.metadata.get("type", "unknown"),
                        category=node.metadata.get("category", "uncategorized"),
                        description=node.description,
                        confidence=0.7,
                        similarity_score=0.0,
                        relevance_score=0.0,
                        rank=len(results) + 1,
                        use_cases=node.metadata.get("use_cases", [])[:3],
                        agent_tips=node.metadata.get("agent_tips", [])[:2],
                        prerequisites=node.metadata.get("prerequisites", [])[:2],
                        failure_modes=node.metadata.get("failure_modes", [])[:2],
                        related_nodes=[],
                        why_match="Alternative to " + target_node.label,
                        metadata=node.metadata,
                    )
                    results.append(result)

            # Generate explanations
            explanations = []
            if request.include_explanations and results:
                exp = await self.explanation_generator.explain_alternatives(
                    target_node.id,
                    [r.node_id for r in results[:3]],
                )
                explanations.append(exp)

            stats = {"alternatives_count": len(results)}

            response = await self.response_formatter.format_search_response(
                request.query_id,
                request.query_text,
                results,
                explanations,
                stats,
                response_format,
            )

            return response

        except Exception as e:
            logger.error(f"Suggestion query error: {e}")
            raise

    async def _handle_validate_query(
        self,
        request: QueryRequest,
        response_format: ResponseFormat,
    ) -> str:
        """Handle validation query"""
        try:
            # For now, return success
            # This would validate workflow structure in production
            return await self.response_formatter.format_search_response(
                request.query_id,
                request.query_text,
                [],
                [],
                {"status": "valid"},
                response_format,
            )

        except Exception as e:
            logger.error(f"Validation query error: {e}")
            raise

    def _update_stats(self, elapsed_ms: float, success: bool):
        """Update query statistics"""
        self.query_stats["total_queries"] += 1

        if success:
            self.query_stats["successful_queries"] += 1
        else:
            self.query_stats["failed_queries"] += 1

        # Update average
        total = self.query_stats["total_queries"]
        avg = self.query_stats["avg_query_time_ms"]
        self.query_stats["avg_query_time_ms"] = (avg * (total - 1) + elapsed_ms) / total

    def get_stats(self) -> Dict:
        """Get query engine statistics"""
        return {
            **self.query_stats,
            "avg_query_time_ms": round(self.query_stats["avg_query_time_ms"], 2),
            "success_rate": round(
                self.query_stats["successful_queries"] / max(1, self.query_stats["total_queries"]),
                3
            ),
        }
