"""
Semantic Search Engine for Agentic GraphRAG

Provides semantic similarity search using embeddings and filtering.
Integrates with the graph database to return ranked node recommendations
with confidence scores.

Agent-Focused Features:
- Fast vector similarity search (<10ms)
- Category and type filtering
- Confidence scoring for decision support
- Ranked results with explanations
- Fallback to keyword search for unpopular queries
"""

from dataclasses import dataclass
from enum import Enum
from typing import List, Dict, Optional, Tuple
import numpy as np
from datetime import datetime
import json
import logging

from storage import Database, Node, Edge, RelationshipType

logger = logging.getLogger(__name__)


class SearchType(Enum):
    """Types of searches supported by the engine"""
    SEMANTIC = "semantic"          # Vector similarity
    KEYWORD = "keyword"             # Text matching
    HYBRID = "hybrid"               # Both combined
    CATEGORY = "category"           # Filter by category
    PATTERN = "pattern"             # Workflow patterns


@dataclass
class SearchResult:
    """Single search result with agent-useful information"""
    node_id: str
    node_label: str
    node_type: str
    category: str
    description: Optional[str]
    confidence: float              # 0.0-1.0 confidence score
    similarity_score: float        # Cosine similarity if semantic
    relevance_score: float         # Keyword relevance if hybrid
    rank: int                      # Position in results
    use_cases: List[str]          # Why agent might use this
    agent_tips: List[str]         # Practical guidance
    prerequisites: List[str]      # What to know first
    failure_modes: List[str]      # Common mistakes
    related_nodes: List[str]      # Alternative/compatible nodes
    why_match: str                # Explanation of match
    metadata: Dict

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            "node_id": self.node_id,
            "node_label": self.node_label,
            "node_type": self.node_type,
            "category": self.category,
            "description": self.description,
            "confidence": round(self.confidence, 3),
            "similarity_score": round(self.similarity_score, 3),
            "relevance_score": round(self.relevance_score, 3),
            "rank": self.rank,
            "use_cases": self.use_cases[:3],  # Top 3
            "agent_tips": self.agent_tips[:2],  # Top 2
            "prerequisites": self.prerequisites[:2],
            "failure_modes": self.failure_modes[:2],
            "related_nodes": self.related_nodes[:5],
            "why_match": self.why_match,
            "metadata": self.metadata,
        }


class SemanticSearchEngine:
    """
    Semantic search engine for finding n8n nodes by meaning

    Performs vector similarity search using pre-computed embeddings
    with intelligent ranking and agent-focused explanations.
    """

    def __init__(self, db: Database):
        """
        Initialize semantic search engine

        Args:
            db: Database instance with nodes and embeddings
        """
        self.db = db
        self.embedding_cache = {}  # Cache for frequently accessed embeddings
        self.search_stats = {
            "total_searches": 0,
            "semantic_searches": 0,
            "keyword_searches": 0,
            "hybrid_searches": 0,
            "avg_query_time_ms": 0,
            "last_search_time": None,
        }

    async def semantic_search(
        self,
        query_embedding: np.ndarray,
        limit: int = 10,
        category_filter: Optional[str] = None,
        node_type_filter: Optional[str] = None,
        min_confidence: float = 0.3,
    ) -> List[SearchResult]:
        """
        Perform semantic similarity search using vector embeddings

        Args:
            query_embedding: Query vector (384-dimensional for all-MiniLM-L6-v2)
            limit: Max results to return
            category_filter: Optional category filter
            node_type_filter: Optional node type filter
            min_confidence: Minimum confidence threshold (0.0-1.0)

        Returns:
            List of SearchResult objects ranked by similarity
        """
        import time
        start_time = time.time()

        try:
            # Get all nodes (would be optimized in production)
            all_nodes = self.db.get_nodes()

            results = []

            for node in all_nodes:
                # Apply filters
                if category_filter and node.metadata.get("category") != category_filter:
                    continue
                if node_type_filter and node.metadata.get("type") != node_type_filter:
                    continue

                # Get node embedding
                embedding = self.db.get_embedding(node.id)
                if embedding is None:
                    continue

                # Calculate cosine similarity
                similarity = self._cosine_similarity(
                    query_embedding,
                    embedding.vector
                )

                # Calculate confidence (higher similarity = higher confidence)
                confidence = max(0.0, min(1.0, similarity))

                if confidence < min_confidence:
                    continue

                # Get related information
                use_cases = node.metadata.get("use_cases", [])[:3]
                agent_tips = node.metadata.get("agent_tips", [])[:2]
                prerequisites = node.metadata.get("prerequisites", [])[:2]
                failure_modes = node.metadata.get("failure_modes", [])[:2]

                # Get related nodes (from edges)
                related = self._get_related_nodes(node.id, limit=5)

                # Create explanation
                explanation = f"Found '{node.label}' with {confidence:.1%} confidence based on semantic similarity"

                result = SearchResult(
                    node_id=node.id,
                    node_label=node.label,
                    node_type=node.metadata.get("type", "unknown"),
                    category=node.metadata.get("category", "uncategorized"),
                    description=node.description,
                    confidence=confidence,
                    similarity_score=similarity,
                    relevance_score=0.0,  # Not used in semantic search
                    rank=0,  # Will be set after sorting
                    use_cases=use_cases,
                    agent_tips=agent_tips,
                    prerequisites=prerequisites,
                    failure_modes=failure_modes,
                    related_nodes=related,
                    why_match=explanation,
                    metadata=node.metadata,
                )
                results.append(result)

            # Sort by confidence and limit
            results.sort(key=lambda r: r.confidence, reverse=True)
            results = results[:limit]

            # Set ranks
            for idx, result in enumerate(results, 1):
                result.rank = idx

            # Update stats
            elapsed = (time.time() - start_time) * 1000  # ms
            self._update_stats("semantic", elapsed)

            logger.info(f"Semantic search returned {len(results)} results in {elapsed:.2f}ms")
            return results

        except Exception as e:
            logger.error(f"Semantic search error: {e}")
            return []

    async def keyword_search(
        self,
        query: str,
        limit: int = 10,
        category_filter: Optional[str] = None,
    ) -> List[SearchResult]:
        """
        Perform keyword-based search (fallback for uncommon queries)

        Args:
            query: Search query text
            limit: Max results to return
            category_filter: Optional category filter

        Returns:
            List of SearchResult objects ranked by relevance
        """
        import time
        start_time = time.time()

        try:
            query_lower = query.lower()
            all_nodes = self.db.get_nodes()

            results = []

            for node in all_nodes:
                # Apply category filter
                if category_filter and node.metadata.get("category") != category_filter:
                    continue

                # Calculate relevance
                relevance = self._calculate_keyword_relevance(
                    query_lower,
                    node,
                )

                if relevance < 0.1:
                    continue

                # Confidence is lower for keyword matches
                confidence = max(0.2, min(1.0, relevance * 0.8))

                use_cases = node.metadata.get("use_cases", [])[:3]
                agent_tips = node.metadata.get("agent_tips", [])[:2]
                prerequisites = node.metadata.get("prerequisites", [])[:2]
                failure_modes = node.metadata.get("failure_modes", [])[:2]
                related = self._get_related_nodes(node.id, limit=5)

                explanation = f"Found '{node.label}' matching keyword '{query}' ({relevance:.1%} match)"

                result = SearchResult(
                    node_id=node.id,
                    node_label=node.label,
                    node_type=node.metadata.get("type", "unknown"),
                    category=node.metadata.get("category", "uncategorized"),
                    description=node.description,
                    confidence=confidence,
                    similarity_score=0.0,
                    relevance_score=relevance,
                    rank=0,
                    use_cases=use_cases,
                    agent_tips=agent_tips,
                    prerequisites=prerequisites,
                    failure_modes=failure_modes,
                    related_nodes=related,
                    why_match=explanation,
                    metadata=node.metadata,
                )
                results.append(result)

            # Sort by relevance
            results.sort(key=lambda r: r.relevance_score, reverse=True)
            results = results[:limit]

            # Set ranks
            for idx, result in enumerate(results, 1):
                result.rank = idx

            elapsed = (time.time() - start_time) * 1000
            self._update_stats("keyword", elapsed)

            logger.info(f"Keyword search returned {len(results)} results in {elapsed:.2f}ms")
            return results

        except Exception as e:
            logger.error(f"Keyword search error: {e}")
            return []

    async def hybrid_search(
        self,
        query_text: str,
        query_embedding: Optional[np.ndarray] = None,
        limit: int = 10,
        category_filter: Optional[str] = None,
        semantic_weight: float = 0.7,  # Semantic is 70%, keyword is 30%
    ) -> List[SearchResult]:
        """
        Perform hybrid search combining semantic and keyword matching

        Args:
            query_text: Search query text
            query_embedding: Optional pre-computed embedding
            limit: Max results
            category_filter: Optional category filter
            semantic_weight: Weight for semantic vs keyword (0-1)

        Returns:
            List of SearchResult objects with combined ranking
        """
        import time
        start_time = time.time()

        try:
            # Get both result types
            semantic_results = []
            keyword_results = []

            if query_embedding is not None:
                semantic_results = await self.semantic_search(
                    query_embedding,
                    limit=limit * 2,
                    category_filter=category_filter,
                    min_confidence=0.2,
                )

            keyword_results = await self.keyword_search(
                query_text,
                limit=limit * 2,
                category_filter=category_filter,
            )

            # Create merged result map
            merged = {}

            # Add semantic results with weight
            for result in semantic_results:
                key = result.node_id
                merged[key] = result
                merged[key].confidence = result.confidence * semantic_weight

            # Add/merge keyword results with weight
            for result in keyword_results:
                key = result.node_id
                if key in merged:
                    # Combine scores
                    merged[key].confidence += result.confidence * (1 - semantic_weight)
                    merged[key].relevance_score = result.relevance_score
                else:
                    merged[key] = result
                    merged[key].confidence = result.confidence * (1 - semantic_weight)

            # Sort by combined confidence
            results = sorted(
                merged.values(),
                key=lambda r: r.confidence,
                reverse=True
            )[:limit]

            # Set ranks
            for idx, result in enumerate(results, 1):
                result.rank = idx

            elapsed = (time.time() - start_time) * 1000
            self._update_stats("hybrid", elapsed)

            logger.info(f"Hybrid search returned {len(results)} results in {elapsed:.2f}ms")
            return results

        except Exception as e:
            logger.error(f"Hybrid search error: {e}")
            return []

    def _cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """
        Calculate cosine similarity between two vectors

        Args:
            vec1: First vector
            vec2: Second vector

        Returns:
            Cosine similarity score (0-1)
        """
        try:
            # Normalize vectors
            vec1_norm = vec1 / (np.linalg.norm(vec1) + 1e-8)
            vec2_norm = vec2 / (np.linalg.norm(vec2) + 1e-8)

            # Cosine similarity is dot product of normalized vectors
            similarity = np.dot(vec1_norm, vec2_norm)

            # Clamp to [0, 1] and convert from [-1, 1] range
            return max(0.0, min(1.0, (similarity + 1) / 2))

        except Exception as e:
            logger.error(f"Cosine similarity error: {e}")
            return 0.0

    def _calculate_keyword_relevance(self, query: str, node: Node) -> float:
        """
        Calculate keyword relevance score

        Args:
            query: Search query
            node: Node to evaluate

        Returns:
            Relevance score (0-1)
        """
        score = 0.0

        # Check label (highest weight)
        if query in node.label.lower():
            score += 0.5

        # Check description
        if node.description and query in node.description.lower():
            score += 0.2

        # Check keywords
        keywords = node.metadata.get("keywords", [])
        keyword_matches = sum(1 for k in keywords if query in k.lower())
        score += min(0.2, keyword_matches * 0.1)

        # Check use cases
        use_cases = node.metadata.get("use_cases", [])
        use_case_matches = sum(1 for u in use_cases if query in u.lower())
        score += min(0.1, use_case_matches * 0.05)

        return min(1.0, score)

    def _get_related_nodes(self, node_id: str, limit: int = 5) -> List[str]:
        """
        Get related nodes from graph edges

        Args:
            node_id: Node to find relations for
            limit: Max related nodes to return

        Returns:
            List of related node IDs
        """
        try:
            related_set = set()

            # Get outgoing edges
            out_edges = self.db.get_edges_from_node(node_id)
            for edge in out_edges:
                related_set.add(edge.target_id)

            # Get incoming edges
            in_edges = self.db.get_edges_to_node(node_id)
            for edge in in_edges:
                related_set.add(edge.source_id)

            return list(related_set)[:limit]

        except Exception as e:
            logger.error(f"Error getting related nodes: {e}")
            return []

    def _update_stats(self, search_type: str, elapsed_ms: float):
        """Update search statistics"""
        self.search_stats["total_searches"] += 1

        if search_type == "semantic":
            self.search_stats["semantic_searches"] += 1
        elif search_type == "keyword":
            self.search_stats["keyword_searches"] += 1
        elif search_type == "hybrid":
            self.search_stats["hybrid_searches"] += 1

        # Update average
        total = self.search_stats["total_searches"]
        avg = self.search_stats["avg_query_time_ms"]
        self.search_stats["avg_query_time_ms"] = (avg * (total - 1) + elapsed_ms) / total
        self.search_stats["last_search_time"] = datetime.now().isoformat()

    def get_stats(self) -> Dict:
        """Get search engine statistics"""
        return {
            **self.search_stats,
            "avg_query_time_ms": round(self.search_stats["avg_query_time_ms"], 2),
        }
