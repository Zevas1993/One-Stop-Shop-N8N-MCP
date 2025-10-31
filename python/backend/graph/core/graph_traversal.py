"""
Graph Traversal Engine for Multi-Hop Reasoning

Provides graph traversal algorithms for finding relationships between nodes,
understanding workflow patterns, and generating multi-hop explanations.

Agent-Focused Features:
- BFS/DFS traversal for path finding
- Shortest path discovery
- Multi-hop relationship reasoning
- Pattern detection in workflows
- Confidence scoring across hops
- Circular dependency detection
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Set, Tuple
from enum import Enum
from collections import deque
import logging
import time

from ..storage import Database, Node, Edge, RelationshipType

logger = logging.getLogger(__name__)


class TraversalType(Enum):
    """Types of graph traversals"""
    BFS = "breadth_first"           # Breadth-first search
    DFS = "depth_first"             # Depth-first search
    SHORTEST_PATH = "shortest_path" # Dijkstra's shortest path
    MULTI_HOP = "multi_hop"         # Multi-hop reasoning


@dataclass
class Path:
    """Represents a path through the graph"""
    nodes: List[str]               # Node IDs in path order
    edges: List[str]               # Edge IDs connecting nodes
    length: int                    # Number of hops
    total_strength: float          # Sum of edge strengths
    confidence: float              # Overall confidence (0-1)
    reasoning: str                 # Why these nodes connect
    pattern: Optional[str] = None  # Detected pattern if any

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON"""
        return {
            "nodes": self.nodes,
            "edges": self.edges,
            "length": self.length,
            "total_strength": round(self.total_strength, 3),
            "confidence": round(self.confidence, 3),
            "reasoning": self.reasoning,
            "pattern": self.pattern,
        }


@dataclass
class TraversalNode:
    """Internal node for traversal"""
    node_id: str
    depth: int
    path: List[str] = field(default_factory=list)
    edges_in_path: List[str] = field(default_factory=list)
    confidence: float = 1.0
    visited_from: Optional[str] = None


class GraphTraversalEngine:
    """
    Graph traversal engine for multi-hop reasoning

    Enables agents to understand multi-step workflows, discover
    alternative paths, and reason about node relationships.
    """

    def __init__(self, db: Database):
        """
        Initialize traversal engine

        Args:
            db: Database instance
        """
        self.db = db
        self.traversal_stats = {
            "total_traversals": 0,
            "bfs_traversals": 0,
            "dfs_traversals": 0,
            "paths_found": 0,
            "avg_traversal_time_ms": 0,
        }

    async def find_shortest_path(
        self,
        start_node_id: str,
        end_node_id: str,
        max_hops: int = 5,
    ) -> Optional[Path]:
        """
        Find shortest path between two nodes using BFS

        Args:
            start_node_id: Starting node ID
            end_node_id: Target node ID
            max_hops: Maximum hops to explore

        Returns:
            Path if found, None otherwise
        """
        import time
        start_time = time.time()

        try:
            if start_node_id == end_node_id:
                return Path(
                    nodes=[start_node_id],
                    edges=[],
                    length=0,
                    total_strength=1.0,
                    confidence=1.0,
                    reasoning="Source and target are the same node",
                )

            # BFS queue
            queue = deque([TraversalNode(
                node_id=start_node_id,
                depth=0,
                path=[start_node_id],
                edges_in_path=[],
                confidence=1.0,
            )])

            visited = {start_node_id}

            while queue:
                current = queue.popleft()

                if current.depth >= max_hops:
                    continue

                # Get connected nodes
                out_edges = self.db.get_edges_from_node(current.node_id)
                in_edges = self.db.get_edges_to_node(current.node_id)

                # Try outgoing edges
                for edge in out_edges:
                    if edge.target_id == end_node_id:
                        # Found it!
                        path_nodes = current.path + [end_node_id]
                        path_edges = current.edges_in_path + [edge.id]
                        total_strength = current.confidence * edge.strength

                        elapsed = (time.time() - start_time) * 1000
                        self._update_stats("bfs", elapsed, True)

                        return Path(
                            nodes=path_nodes,
                            edges=path_edges,
                            length=current.depth + 1,
                            total_strength=total_strength,
                            confidence=min(1.0, total_strength),
                            reasoning=f"Path through {current.depth + 1} connections: {' → '.join(path_nodes)}",
                        )

                    if edge.target_id not in visited:
                        visited.add(edge.target_id)
                        queue.append(TraversalNode(
                            node_id=edge.target_id,
                            depth=current.depth + 1,
                            path=current.path + [edge.target_id],
                            edges_in_path=current.edges_in_path + [edge.id],
                            confidence=current.confidence * edge.strength,
                        ))

                # Try incoming edges
                for edge in in_edges:
                    if edge.source_id == end_node_id:
                        path_nodes = current.path + [end_node_id]
                        path_edges = current.edges_in_path + [edge.id]
                        total_strength = current.confidence * edge.strength

                        elapsed = (time.time() - start_time) * 1000
                        self._update_stats("bfs", elapsed, True)

                        return Path(
                            nodes=path_nodes,
                            edges=path_edges,
                            length=current.depth + 1,
                            total_strength=total_strength,
                            confidence=min(1.0, total_strength),
                            reasoning=f"Path through {current.depth + 1} connections",
                        )

                    if edge.source_id not in visited:
                        visited.add(edge.source_id)
                        queue.append(TraversalNode(
                            node_id=edge.source_id,
                            depth=current.depth + 1,
                            path=current.path + [edge.source_id],
                            edges_in_path=current.edges_in_path + [edge.id],
                            confidence=current.confidence * edge.strength,
                        ))

            elapsed = (time.time() - start_time) * 1000
            self._update_stats("bfs", elapsed, False)

            logger.info(f"No path found from {start_node_id} to {end_node_id}")
            return None

        except Exception as e:
            logger.error(f"Shortest path error: {e}")
            return None

    async def find_all_paths(
        self,
        start_node_id: str,
        end_node_id: str,
        max_hops: int = 4,
        max_paths: int = 5,
    ) -> List[Path]:
        """
        Find multiple paths between nodes (for alternatives)

        Args:
            start_node_id: Starting node ID
            end_node_id: Target node ID
            max_hops: Maximum hops per path
            max_paths: Maximum paths to find

        Returns:
            List of Path objects
        """
        import time
        start_time = time.time()

        try:
            paths = []

            # DFS to find all paths
            def dfs(
                current_id: str,
                target_id: str,
                path: List[str],
                edges_in_path: List[str],
                visited: Set[str],
                depth: int,
            ):
                if len(paths) >= max_paths:
                    return

                if depth > max_hops:
                    return

                if current_id == target_id:
                    total_strength = self._calculate_path_strength(edges_in_path)
                    path_obj = Path(
                        nodes=path,
                        edges=edges_in_path,
                        length=len(path) - 1,
                        total_strength=total_strength,
                        confidence=min(1.0, total_strength),
                        reasoning=f"Alternative path through {len(path) - 1} connections",
                    )
                    paths.append(path_obj)
                    return

                # Try outgoing edges
                out_edges = self.db.get_edges_from_node(current_id)
                for edge in out_edges:
                    if edge.target_id not in visited:
                        visited.add(edge.target_id)
                        dfs(
                            edge.target_id,
                            target_id,
                            path + [edge.target_id],
                            edges_in_path + [edge.id],
                            visited.copy(),
                            depth + 1,
                        )

                # Try incoming edges
                in_edges = self.db.get_edges_to_node(current_id)
                for edge in in_edges:
                    if edge.source_id not in visited:
                        visited.add(edge.source_id)
                        dfs(
                            edge.source_id,
                            target_id,
                            path + [edge.source_id],
                            edges_in_path + [edge.id],
                            visited.copy(),
                            depth + 1,
                        )

            dfs(start_node_id, end_node_id, [start_node_id], [], {start_node_id}, 0)

            # Sort by confidence
            paths.sort(key=lambda p: p.confidence, reverse=True)

            elapsed = (time.time() - start_time) * 1000
            self._update_stats("dfs", elapsed, len(paths) > 0)

            logger.info(f"Found {len(paths)} paths from {start_node_id} to {end_node_id}")
            return paths

        except Exception as e:
            logger.error(f"Find all paths error: {e}")
            return []

    async def get_neighbors(
        self,
        node_id: str,
        depth: int = 1,
        relationship_types: Optional[List[RelationshipType]] = None,
    ) -> Dict[str, List[str]]:
        """
        Get neighbors at specific depth

        Args:
            node_id: Starting node
            depth: Depth of neighborhood (1-3 typical)
            relationship_types: Filter by relationship types

        Returns:
            Dict mapping depth levels to node lists
        """
        try:
            result = {0: [node_id]}

            current_level = {node_id}

            for level in range(1, depth + 1):
                next_level = set()

                for current_id in current_level:
                    # Get outgoing
                    out_edges = self.db.get_edges_from_node(current_id)
                    for edge in out_edges:
                        if relationship_types is None or edge.type in relationship_types:
                            if edge.target_id not in result.get(0, []):
                                next_level.add(edge.target_id)

                    # Get incoming
                    in_edges = self.db.get_edges_to_node(current_id)
                    for edge in in_edges:
                        if relationship_types is None or edge.type in relationship_types:
                            if edge.source_id not in result.get(0, []):
                                next_level.add(edge.source_id)

                if next_level:
                    result[level] = list(next_level)

            return result

        except Exception as e:
            logger.error(f"Get neighbors error: {e}")
            return {0: [node_id]}

    async def detect_circular_dependencies(
        self,
        node_id: str,
    ) -> bool:
        """
        Detect if node has circular dependencies

        Useful for agents to avoid infinite loops in workflows

        Args:
            node_id: Node to check

        Returns:
            True if circular dependency found
        """
        try:
            visited = set()
            rec_stack = set()

            def has_cycle(current_id: str) -> bool:
                visited.add(current_id)
                rec_stack.add(current_id)

                # Check outgoing edges
                out_edges = self.db.get_edges_from_node(current_id)
                for edge in out_edges:
                    if edge.target_id not in visited:
                        if has_cycle(edge.target_id):
                            return True
                    elif edge.target_id in rec_stack:
                        return True

                rec_stack.remove(current_id)
                return False

            return has_cycle(node_id)

        except Exception as e:
            logger.error(f"Circular dependency check error: {e}")
            return False

    def _calculate_path_strength(self, edge_ids: List[str]) -> float:
        """Calculate total strength of a path"""
        if not edge_ids:
            return 1.0

        total = 1.0
        for edge_id in edge_ids:
            # Would need to retrieve edge and multiply strength
            # For now, return conservative estimate
            total *= 0.95  # Assume each edge is 95% confident

        return total

    def _update_stats(self, traversal_type: str, elapsed_ms: float, found: bool):
        """Update traversal statistics"""
        self.traversal_stats["total_traversals"] += 1

        if traversal_type == "bfs":
            self.traversal_stats["bfs_traversals"] += 1
        elif traversal_type == "dfs":
            self.traversal_stats["dfs_traversals"] += 1

        if found:
            self.traversal_stats["paths_found"] += 1

        # Update average
        total = self.traversal_stats["total_traversals"]
        avg = self.traversal_stats["avg_traversal_time_ms"]
        self.traversal_stats["avg_traversal_time_ms"] = (avg * (total - 1) + elapsed_ms) / total

    def get_stats(self) -> Dict:
        """Get traversal statistics"""
        return {
            **self.traversal_stats,
            "avg_traversal_time_ms": round(
                self.traversal_stats["avg_traversal_time_ms"], 2
            ),
        }
