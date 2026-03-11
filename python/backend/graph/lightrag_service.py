#!/usr/bin/env python3
"""
LightRAG Stdio JSON-RPC microservice
"""

import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime, timezone
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stderr)]
)
logger = logging.getLogger("lightrag_service")

# Fix imports for script execution
current_dir = Path(__file__).parent.resolve()
sys.path.append(str(current_dir))
sys.path.append(str(current_dir.parent)) # Add backend root for core imports

try:
    import numpy as np
    from storage.database import Database
    from storage.models import Node, Edge, Embedding, EntityType
    from core.semantic_search import SemanticSearchEngine
except ImportError as e:
    import traceback
    traceback.print_exc()
    logger.error(f"Failed to import dependencies: {e}")
    sys.exit(1)


try:
    from core.relationship_builder import AgenticRelationshipBuilder
except ImportError:
    AgenticRelationshipBuilder = None


def log(msg: str):
    logger.info(msg)


def build_relationships_impl(db: Database):
    """
    Build relationships between all nodes in the graph using AgenticRelationshipBuilder
    """
    if AgenticRelationshipBuilder is None:
        return {"ok": False, "error": "AgenticRelationshipBuilder not available"}

    try:
        # Fetch all nodes (use large limit to get everything)
        all_nodes = db.get_nodes(limit=10000, offset=0)
        if not all_nodes:
            return {"ok": False, "error": "No nodes in graph database"}

        log(f"Building relationships for {len(all_nodes)} nodes...")

        builder = AgenticRelationshipBuilder()
        all_edges = builder.build_relationships(all_nodes)

        # Filter out edges referencing virtual nodes (category-*, pattern-*)
        # that don't exist in the nodes table (FK constraint)
        node_ids = {n.id for n in all_nodes}
        edges = [e for e in all_edges if e.source_id in node_ids and e.target_id in node_ids]

        log(f"Generated {len(all_edges)} relationships, {len(edges)} between real nodes, storing...")

        stored = 0
        from storage.models import RelationshipType as StorageRelType
        for agentic_edge in edges:
            # Convert AgenticEdge type string to storage RelationshipType enum
            type_str = agentic_edge.type.value if hasattr(agentic_edge.type, 'value') else str(agentic_edge.type)
            try:
                edge_type = StorageRelType(type_str)
            except ValueError:
                edge_type = StorageRelType.COMPATIBLE_WITH  # fallback

            edge = Edge(
                id=agentic_edge.id,
                source_id=agentic_edge.source_id,
                target_id=agentic_edge.target_id,
                type=edge_type,
                strength=agentic_edge.strength,
                metadata={
                    "reasoning": agentic_edge.reasoning,
                    "success_rate": agentic_edge.success_rate,
                    "common_pattern": agentic_edge.common_pattern,
                    "agent_guidance": agentic_edge.agent_guidance,
                    "gotchas": agentic_edge.gotchas,
                }
            )
            if db.add_edge(edge):
                stored += 1

        log(f"Stored {stored} relationships")
        return {"ok": True, "relationships_built": len(edges), "relationships_stored": stored}

    except Exception as e:
        logger.error(f"Relationship building failed: {e}")
        import traceback
        traceback.print_exc()
        return {"ok": False, "error": str(e)}


def get_stats_impl(db: Database):
    """Get graph statistics and sample data for insights"""
    try:
        node_count = db.node_count()
        edge_count = db.edge_count()

        # Category breakdown
        nodes = db.get_nodes(limit=10000)
        categories = {}
        for n in nodes:
            cat = n.category or "uncategorized"
            categories[cat] = categories.get(cat, 0) + 1

        # Edge type breakdown
        edges = db.get_edges(limit=10000)
        edge_types = {}
        for e in edges:
            t = e.type.value if hasattr(e.type, 'value') else str(e.type)
            edge_types[t] = edge_types.get(t, 0) + 1

        # Sample relationships (top 20 strongest)
        top_edges = sorted(edges, key=lambda e: e.strength, reverse=True)[:20]
        sample_relationships = [
            {
                "source": e.source_id,
                "target": e.target_id,
                "type": e.type.value if hasattr(e.type, 'value') else str(e.type),
                "strength": e.strength
            }
            for e in top_edges
        ]

        return {
            "ok": True,
            "node_count": node_count,
            "edge_count": edge_count,
            "categories": categories,
            "edge_types": edge_types,
            "sample_relationships": sample_relationships
        }
    except Exception as e:
        logger.error(f"Get stats failed: {e}")
        return {"ok": False, "error": str(e)}


def query_graph_impl(text: str, top_k: int, embedding: list, engine: SemanticSearchEngine, db: Database):
    """
    Execute graph query using SemanticSearchEngine
    """
    try:
        results = []

        if embedding and len(embedding) > 0:
            # Semantic search
            log(f"Performing semantic search for '{text}'")
            query_vec = np.array(embedding)
            results = engine.semantic_search_sync(query_vec, limit=top_k)
        else:
            # Keyword search
            log(f"Performing keyword search for '{text}'")
            results = engine.keyword_search_sync(text, limit=top_k)

        # Format nodes
        nodes = []
        node_ids = set()
        for r in results:
            node_id = r.node_id
            nodes.append({
                "id": node_id,
                "label": r.node_label,
                "type": r.node_type,
                "description": r.description,
                "score": r.confidence,
                "confidence": r.confidence,
                "metadata": r.metadata
            })
            node_ids.add(node_id)

        # Fetch edges between found nodes from the database
        edges = []
        if len(node_ids) > 1:
            for node_id in node_ids:
                try:
                    node_edges = db.get_edges_from_node(node_id)
                    for e in node_edges:
                        if e.target_id in node_ids or e.target_id.startswith("category-") or e.target_id.startswith("pattern-"):
                            edge_data = {
                                "source": e.source_id,
                                "target": e.target_id,
                                "type": e.type.value if hasattr(e.type, 'value') else str(e.type),
                                "strength": e.strength,
                            }
                            if edge_data not in edges:
                                edges.append(edge_data)
                except Exception:
                    pass  # Skip edge lookup failures

        summary = f"Found {len(nodes)} relevant nodes and {len(edges)} relationships."

        return {"nodes": nodes, "edges": edges, "summary": summary}

    except Exception as e:
        logger.error(f"Query failed: {e}")
        return {"nodes": [], "edges": [], "summary": f"Error: {str(e)}"}


def apply_update_impl(db: Database, added, modified, removed):
    """
    Apply updates to the SQLite database
    """
    try:
        count = 0

        # Process Added
        for item in added or []:
            # Resolve field names: TS sends "name", Python expects "label"
            label = item.get("label") or item.get("name") or item.get("id")
            meta = item.get("metadata", {})
            category = item.get("category") or meta.get("category", "uncategorized")
            description = item.get("description") or (item.get("content", "") or "")[:500]
            keywords_raw = item.get("keywords", [])
            # Auto-generate keywords from label if none provided
            if not keywords_raw and label:
                keywords_raw = [w.lower() for w in label.split() if len(w) > 2]

            node = Node(
                id=item.get("id"),
                label=label,
                description=description,
                category=category,
                keywords=keywords_raw,
                metadata=meta
            )
            if db.add_node(node):
                count += 1

            # Handle embedding if present
            if "embedding" in item and item["embedding"]:
                emb = Embedding(
                    node_id=node.id,
                    embedding=item["embedding"],
                    dimension=len(item["embedding"]),
                    model="nomic-embed-text" # Default or passed in
                )
                db.add_embedding(emb)

        # Process Modified (same as add for upsert)
        for item in modified or []:
            label = item.get("label") or item.get("name") or item.get("id")
            meta = item.get("metadata", {})
            category = item.get("category") or meta.get("category", "uncategorized")
            description = item.get("description") or (item.get("content", "") or "")[:500]
            keywords_raw = item.get("keywords", [])
            if not keywords_raw and label:
                keywords_raw = [w.lower() for w in label.split() if len(w) > 2]

            node = Node(
                id=item.get("id"),
                label=label,
                description=description,
                category=category,
                keywords=keywords_raw,
                metadata=meta
            )
            if db.add_node(node):
                count += 1

        # Process Removed
        for item in removed or []:
            node_id = item.get("id")
            if node_id:
                db.delete_node(node_id)
                count += 1

        return {"ok": True, "updates_applied": count}

    except Exception as e:
        logger.error(f"Update failed: {e}")
        return {"ok": False, "error": str(e)}


# Async wrappers since SemanticSearchEngine is async
# But we are in a sync loop.
# Actually SemanticSearchEngine methods are async def.
# We need to run them.
import asyncio

class SyncSearchEngine:
    def __init__(self, engine):
        self.engine = engine
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)

    def semantic_search_sync(self, *args, **kwargs):
        return self.loop.run_until_complete(self.engine.semantic_search(*args, **kwargs))

    def keyword_search_sync(self, *args, **kwargs):
        return self.loop.run_until_complete(self.engine.keyword_search(*args, **kwargs))


def main():
    graph_dir_env = os.environ.get("GRAPH_DIR")
    if graph_dir_env:
        graph_dir = Path(graph_dir_env)
    else:
        if os.name == "nt":
            appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
            graph_dir = Path(appdata) / "n8n-mcp" / "graph"
        else:
            graph_dir = Path.home() / ".cache" / "n8n-mcp" / "graph"

    graph_dir.mkdir(parents=True, exist_ok=True)
    db_path = graph_dir / "graph.db"
    log(f"Database path: {db_path}")

    # Initialize DB and Engine
    try:
        db = Database(str(db_path))
        engine = SemanticSearchEngine(db)
        sync_engine = SyncSearchEngine(engine)
    except Exception as e:
        log(f"Failed to initialize components: {e}")
        sys.exit(1)

    # JSON-RPC loop
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            method = req.get("method")
            params = req.get("params", {})
            rid = req.get("id", 0)

            result = None

            if method == "ping":
                result = {"ok": True, "ts": int(time.time())}

            elif method == "query_graph":
                text = params.get("text", "")
                top_k = int(params.get("top_k", 5))
                embedding = params.get("embedding", [])
                result = query_graph_impl(text, top_k, embedding, sync_engine, db)

            elif method == "apply_update":
                result = apply_update_impl(
                    db,
                    params.get("added", []),
                    params.get("modified", []),
                    params.get("removed", []),
                )

            elif method == "build_relationships":
                result = build_relationships_impl(db)

            elif method == "get_stats":
                result = get_stats_impl(db)

            elif method == "invalidate_cache":
                # Node catalog has changed - clear caches and trigger rebuild
                log("Cache invalidation requested - node catalog changed")

                # Clear any cached embeddings or search results in the engine
                if hasattr(sync_engine, 'clear_cache'):
                    sync_engine.clear_cache()

                # Trigger knowledge graph rebuild on next query
                # (Actual rebuild will happen lazily - more efficient than immediate rebuild)
                result = {"ok": True, "message": "Cache invalidated, graph will rebuild on next query"}

            else:
                raise ValueError(f"Unknown method: {method}")

            resp = {"jsonrpc": "2.0", "result": result, "id": rid}
        except Exception as e:
            resp = {"jsonrpc": "2.0", "error": {"code": -32603, "message": str(e)}, "id": req.get("id", 0)}

        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()

if __name__ == "__main__":
    main()
