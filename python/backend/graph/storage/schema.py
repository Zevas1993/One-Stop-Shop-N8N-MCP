"""
SQLite Database Schema for GraphRAG
Defines all tables and indexes for the knowledge graph storage
"""

SCHEMA = """
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Nodes (Entities in the graph)
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT,
    category TEXT,
    keywords TEXT,
    embedding BLOB,
    metadata TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    UNIQUE(id)
);

CREATE INDEX IF NOT EXISTS idx_nodes_category ON nodes(category);
CREATE INDEX IF NOT EXISTS idx_nodes_label ON nodes(label);
CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON nodes(created_at);

-- Edges (Relationships between nodes)
CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    type TEXT NOT NULL,
    strength REAL DEFAULT 1.0,
    metadata TEXT,
    created_at INTEGER,
    FOREIGN KEY(source_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY(target_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(source_id, target_id, type)
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
CREATE INDEX IF NOT EXISTS idx_edges_source_target ON edges(source_id, target_id);
CREATE INDEX IF NOT EXISTS idx_edges_created_at ON edges(created_at);

-- Embeddings (Vector storage for nodes)
CREATE TABLE IF NOT EXISTS embeddings (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL UNIQUE,
    embedding BLOB NOT NULL,
    dimension INTEGER NOT NULL,
    model TEXT NOT NULL,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_embeddings_node_id ON embeddings(node_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(model);

-- Graph Metadata (Configuration and statistics)
CREATE TABLE IF NOT EXISTS graph_metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER
);

-- Query Log (Performance metrics and debugging)
CREATE TABLE IF NOT EXISTS query_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    query_type TEXT,
    latency_ms INTEGER,
    result_count INTEGER,
    timestamp INTEGER,
    user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_query_log_timestamp ON query_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_query_log_query_type ON query_log(query_type);
CREATE INDEX IF NOT EXISTS idx_query_log_user_id ON query_log(user_id);

-- Entity Cache (Fast lookups for frequently accessed nodes)
CREATE TABLE IF NOT EXISTS entity_cache (
    node_id TEXT PRIMARY KEY,
    cached_data TEXT NOT NULL,
    ttl_seconds INTEGER DEFAULT 3600,
    created_at INTEGER,
    expires_at INTEGER,
    FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entity_cache_expires_at ON entity_cache(expires_at);

-- Relationships Cache (Precomputed relationship data)
CREATE TABLE IF NOT EXISTS relationships_cache (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    cached_data TEXT NOT NULL,
    ttl_seconds INTEGER DEFAULT 3600,
    created_at INTEGER,
    expires_at INTEGER,
    PRIMARY KEY(source_id, target_id, relationship_type),
    FOREIGN KEY(source_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY(target_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_relationships_cache_expires_at ON relationships_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_relationships_cache_source ON relationships_cache(source_id);
CREATE INDEX IF NOT EXISTS idx_relationships_cache_target ON relationships_cache(target_id);

-- Update History (Track changes for audit and sync)
CREATE TABLE IF NOT EXISTS update_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    operation TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    timestamp INTEGER,
    source TEXT
);

CREATE INDEX IF NOT EXISTS idx_update_history_entity_id ON update_history(entity_id);
CREATE INDEX IF NOT EXISTS idx_update_history_timestamp ON update_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_update_history_operation ON update_history(operation);

-- Version Control (Track schema and data versions)
CREATE TABLE IF NOT EXISTS schema_version (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL,
    description TEXT,
    applied_at INTEGER,
    rollback_script TEXT
);

-- Ensure tables exist
CREATE TABLE IF NOT EXISTS _schema_info (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Initialize schema info if not exists
INSERT OR IGNORE INTO _schema_info (key, value) VALUES ('version', '1.0.0');
INSERT OR IGNORE INTO _schema_info (key, value) VALUES ('created_at', datetime('now'));
"""

# Migration scripts for future schema updates
MIGRATIONS = {
    '1.0.0': SCHEMA,
}

def get_migration_script(from_version: str, to_version: str) -> str:
    """Get migration script from one version to another"""
    if to_version not in MIGRATIONS:
        raise ValueError(f"Unknown version: {to_version}")
    return MIGRATIONS[to_version]
