#!/usr/bin/env python3
"""
LightRAG Stdio JSON-RPC microservice (MVP skeleton)

Goals:
- Provide a stable stdio JSON-RPC surface for `query_graph` that reads from a local cache
  directory and returns a concise subgraph summary for the calling MCP server.
- Avoid network access and heavy dependencies in the MVP; swap in real LightRAG later.

Contract:
- Method: "query_graph"
  Params: { "text": str, "top_k"?: int }
  Result: {
    "nodes": [ {"id": str, "label": str} ],
    "edges": [ {"source": str, "target": str, "type": str} ],
    "summary": str
  }

Environment:
- GRAPH_DIR: path to local graph cache (default: ~/.cache/n8n-mcp/graph)

This is a minimal JSON-RPC loop over stdin/stdout compatible with the TS bridge.
"""

import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime, timezone


def log(msg: str):
    # Lightweight stderr logging without disrupting stdout JSON-RPC
    sys.stderr.write(f"[lightrag_service] {msg}\n")
    sys.stderr.flush()


def load_catalog(graph_dir: Path):
    """Load a minimal catalog if present; otherwise return a tiny default set.
    In a real implementation this would read LightRAG storage and build an index.
    """
    catalog = []
    try:
        # Optional: a simple JSON catalog of nodes (id, label, keywords)
        cat_file = graph_dir / "catalog.json"
        if cat_file.exists():
            txt = cat_file.read_text(encoding="utf-8")
            catalog = json.loads(txt)
            log(f"catalog.json found: {cat_file} ({len(catalog)} entries)")
        else:
            # Fallback minimal set to avoid hard failures
            catalog = [
                {"id": "nodes-base.slack", "label": "Slack", "keywords": ["slack", "message", "channel"]},
                {"id": "nodes-base.airtable", "label": "Airtable", "keywords": ["airtable", "database", "record"]},
                {"id": "nodes-base.switch", "label": "Switch", "keywords": ["route", "condition", "switch"]},
            ]
            log("catalog.json not found; using minimal fallback")
    except Exception as e:
        log(f"Failed to load catalog: {e}")
    return catalog


def _slugify(value: str) -> str:
    v = ''.join(ch.lower() if ch.isalnum() else '-' for ch in value)
    while '--' in v:
        v = v.replace('--', '-')
    return v.strip('-') or 'item'


def query_graph_impl(text: str, top_k: int, graph_dir: Path):
    text_l = (text or "").lower()
    catalog = load_catalog(graph_dir)
    scored = []
    for item in catalog:
        score = 0
        for kw in item.get("keywords", []):
            if kw in text_l:
                score += 1
        scored.append((score, item))
    scored.sort(key=lambda x: x[0], reverse=True)
    nodes = []
    for score, item in scored[: max(1, top_k)]:
        node_id = item.get("id") or item.get("type") or item.get("name") or _slugify(item.get("label", "item"))
        label = item.get("label", node_id)
        nodes.append({"id": node_id, "label": label})

    # naive edges: connect first to others as a simple chain
    edges = []
    if len(nodes) > 1:
        root = nodes[0]["id"]
        for n in nodes[1:]:
            edges.append({"source": root, "target": n["id"], "type": "RELATED"})

    summary = f"Found {len(nodes)} node(s) related to '{text}'."
    return {"nodes": nodes, "edges": edges, "summary": summary}


def apply_update_impl(graph_dir: Path, added, modified, removed):
    """Very simple update mechanism that maintains catalog.json and writes events.jsonl.
    Real LightRAG integration would insert/update/delete entities in the graph storage.
    """
    catalog_path = graph_dir / "catalog.json"
    events_path = graph_dir / "events.jsonl"
    events_path.touch(exist_ok=True)

    # Load current
    catalog = load_catalog(graph_dir)
    by_id = {item.get("id"): item for item in catalog if item.get("id")}

    def to_item(x):
        # Derive minimal item with keywords from id/label
        _id = x.get("id") or x.get("type") or x.get("name")
        label = x.get("label") or x.get("displayName") or _id
        kws = set()
        for token in str(_id).lower().replace('.', ' ').split():
            kws.add(token)
        for token in str(label).lower().split():
            kws.add(token)
        return {"id": _id, "label": label, "keywords": sorted(kws)}

    # Apply added
    for x in added or []:
        item = to_item(x)
        by_id[item["id"]] = item
        with events_path.open('a', encoding='utf-8') as f:
            f.write(json.dumps({
                "ts": datetime.now(timezone.utc).isoformat(),
                "event": "node_added",
                "id": item["id"]
            }) + "\n")

    # Apply modified
    for x in modified or []:
        item = to_item(x)
        by_id[item["id"]] = item
        with events_path.open('a', encoding='utf-8') as f:
            f.write(json.dumps({
                "ts": datetime.now(timezone.utc).isoformat(),
                "event": "node_updated",
                "id": item["id"]
            }) + "\n")

    # Apply removed
    for x in removed or []:
        _id = x.get("id") or x.get("type") or x.get("name")
        if _id in by_id:
            del by_id[_id]
        with events_path.open('a', encoding='utf-8') as f:
            f.write(json.dumps({
                "ts": datetime.now(timezone.utc).isoformat(),
                "event": "node_removed",
                "id": _id
            }) + "\n")

    # Persist catalog
    new_catalog = list(by_id.values())
    catalog_path.write_text(json.dumps(new_catalog, ensure_ascii=False, indent=2), encoding='utf-8')
    return {"ok": True}


def main():
    graph_dir_env = os.environ.get("GRAPH_DIR")
    if graph_dir_env:
        graph_dir = Path(graph_dir_env)
    else:
        # Platform-specific defaults: Windows → %APPDATA%\n8n-mcp\graph; else ~/.cache/n8n-mcp/graph
        if os.name == "nt":
            appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
            graph_dir = Path(appdata) / "n8n-mcp" / "graph"
        else:
            graph_dir = Path.home() / ".cache" / "n8n-mcp" / "graph"
    graph_dir.mkdir(parents=True, exist_ok=True)
    log(f"GRAPH_DIR resolved to: {graph_dir}")

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

            if method == "ping":
                result = {"ok": True, "ts": int(time.time())}
            elif method == "query_graph":
                text = params.get("text", "")
                top_k = int(params.get("top_k", 5))
                result = query_graph_impl(text, top_k, graph_dir)
            elif method == "apply_update":
                result = apply_update_impl(
                    graph_dir,
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
