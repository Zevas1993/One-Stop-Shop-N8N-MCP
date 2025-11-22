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


def log(msg: str):
    logger.info(msg)


def query_graph_impl(text: str, top_k: int, embedding: list, engine: SemanticSearchEngine):
    """
    Execute graph query using SemanticSearchEngine
    """
    try:
        results = []

        if embedding and len(embedding) > 0:
            # Semantic search
            log(f"Performing semantic search for '{text}'")
            query_vec = np.array(embedding)
            results = engine.semantic_search_sync(query_vec, limit=top_k) # Wrapper needed if async
        else:
            # Keyword search
            log(f"Performing keyword search for '{text}'")
            results = engine.keyword_search_sync(text, limit=top_k) # Wrapper needed if async

        # Format nodes
        nodes = []
        for r in results:
            nodes.append({
                "id": r.node_id,
                "label": r.node_label,
                "type": r.node_type,
                "description": r.description,
                "score": r.confidence,
                "confidence": r.confidence,
                "metadata": r.metadata
            })

        # Get edges (naive implementation for now, just connecting found nodes)
        # In a real graph query, we'd traverse from these nodes
        edges = []
        if len(nodes) > 1:
            # Just show they are related in the result set
            pass

        summary = f"Found {len(nodes)} relevant nodes."

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
            node = Node(
                id=item.get("id"),
                label=item.get("label") or item.get("id"),
                description=item.get("description"),
                category=item.get("category", "uncategorized"),
                keywords=item.get("keywords", []),
                metadata=item.get("metadata", {})
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
            node = Node(
                id=item.get("id"),
                label=item.get("label") or item.get("id"),
                description=item.get("description"),
                category=item.get("category", "uncategorized"),
                keywords=item.get("keywords", []),
                metadata=item.get("metadata", {})
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
                result = query_graph_impl(text, top_k, embedding, sync_engine)

            elif method == "apply_update":
                result = apply_update_impl(
                    db,
                    params.get("added", []),
                    params.get("modified", []),
                    params.get("removed", []),
                )
            else:
                raise ValueError(f"Unknown method: {method}")

            resp = {"jsonrpc": "2.0", "result": result, "id": rid}
        except Exception as e:
            resp = {"jsonrpc": "2.0", "error": {"code": -32603, "message": str(e)}, "id": req.get("id", 0)}

        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()

if __name__ == "__main__":
    main()
