"""
Database Layer for GraphRAG
Handles all SQLite operations with connection pooling and transaction management
"""

import sqlite3
import threading
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from contextlib import contextmanager
from datetime import datetime
import json
import numpy as np
import logging

from .schema import SCHEMA, get_migration_script
from .models import Node, Edge, Embedding, GraphMetadata, QueryLog, UpdateHistoryEntry, EntityType

logger = logging.getLogger(__name__)


class Database:
    """SQLite database manager for GraphRAG"""

    def __init__(
        self,
        db_path: str,
        pool_size: int = 5,
        timeout: float = 30.0,
        check_same_thread: bool = False,
    ):
        """
        Initialize database connection pool

        Args:
            db_path: Path to SQLite database file
            pool_size: Size of connection pool
            timeout: Connection timeout in seconds
            check_same_thread: Allow cross-thread access
        """
        self.db_path = Path(db_path)
        self.pool_size = pool_size
        self.timeout = timeout
        self.check_same_thread = check_same_thread
        self._pool: List[sqlite3.Connection] = []
        self._pool_lock = threading.Lock()
        self._initialized = False

        # Ensure parent directory exists
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        # Initialize database
        self._initialize()

    def _initialize(self):
        """Initialize database schema and connection pool"""
        try:
            # Create initial connection to set up schema
            conn = self._create_connection()
            cursor = conn.cursor()

            # Apply schema
            cursor.executescript(SCHEMA)
            conn.commit()

            # Check version
            cursor.execute("SELECT value FROM _schema_info WHERE key = 'version'")
            version_row = cursor.fetchone()
            if version_row:
                self.version = version_row[0]
                logger.info(f"Database initialized with schema version {self.version}")
            else:
                self.version = "1.0.0"

            conn.close()

            # Create connection pool
            for _ in range(self.pool_size):
                conn = self._create_connection()
                self._pool.append(conn)

            self._initialized = True
            logger.info(f"Database initialized with pool size {self.pool_size}")

        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise

    def _create_connection(self) -> sqlite3.Connection:
        """Create a new database connection"""
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=self.timeout,
            check_same_thread=self.check_same_thread,
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    @contextmanager
    def get_connection(self):
        """Get a connection from the pool"""
        conn = None
        try:
            with self._pool_lock:
                if self._pool:
                    conn = self._pool.pop()

            if conn is None:
                conn = self._create_connection()

            yield conn

        finally:
            if conn and len(self._pool) < self.pool_size:
                with self._pool_lock:
                    self._pool.append(conn)
            elif conn:
                conn.close()

    @contextmanager
    def transaction(self):
        """Context manager for transactions"""
        with self.get_connection() as conn:
            try:
                yield conn
                conn.commit()
            except Exception as e:
                conn.rollback()
                logger.error(f"Transaction failed: {e}")
                raise

    # Node Operations
    def add_node(self, node: Node) -> bool:
        """Add a node to the graph"""
        try:
            with self.transaction() as conn:
                cursor = conn.cursor()
                data = node.to_dict()

                cursor.execute(
                    """
                    INSERT OR REPLACE INTO nodes
                    (id, label, description, category, keywords, embedding, metadata, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (data['id'], data['label'], data['description'], data['category'],
                     data['keywords'], data['embedding'], data['metadata'],
                     data['created_at'], data['updated_at'])
                )

                # Log update
                self._log_update(conn, node.id, EntityType.NODE, 'add', None, json.dumps({'label': node.label}))

            return True
        except Exception as e:
            logger.error(f"Failed to add node {node.id}: {e}")
            return False

    def get_node(self, node_id: str) -> Optional[Node]:
        """Get a node by ID"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
                row = cursor.fetchone()

                if row:
                    return Node.from_dict(dict(row))
                return None
        except Exception as e:
            logger.error(f"Failed to get node {node_id}: {e}")
            return None

    def get_nodes(self, limit: int = 100, offset: int = 0) -> List[Node]:
        """Get all nodes with pagination"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT * FROM nodes ORDER BY created_at DESC LIMIT ? OFFSET ?",
                    (limit, offset)
                )
                rows = cursor.fetchall()
                return [Node.from_dict(dict(row)) for row in rows]
        except Exception as e:
            logger.error(f"Failed to get nodes: {e}")
            return []

    def get_nodes_by_category(self, category: str) -> List[Node]:
        """Get all nodes in a category"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM nodes WHERE category = ? ORDER BY label", (category,))
                rows = cursor.fetchall()
                return [Node.from_dict(dict(row)) for row in rows]
        except Exception as e:
            logger.error(f"Failed to get nodes by category {category}: {e}")
            return []

    def delete_node(self, node_id: str) -> bool:
        """Delete a node from the graph"""
        try:
            with self.transaction() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
                self._log_update(conn, node_id, EntityType.NODE, 'delete', json.dumps({}), None)
            return True
        except Exception as e:
            logger.error(f"Failed to delete node {node_id}: {e}")
            return False

    def node_count(self) -> int:
        """Get total number of nodes"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM nodes")
                result = cursor.fetchone()
                return result[0] if result else 0
        except Exception as e:
            logger.error(f"Failed to get node count: {e}")
            return 0

    # Edge Operations
    def add_edge(self, edge: Edge) -> bool:
        """Add an edge (relationship) to the graph"""
        try:
            with self.transaction() as conn:
                cursor = conn.cursor()
                data = edge.to_dict()

                cursor.execute(
                    """
                    INSERT OR REPLACE INTO edges
                    (id, source_id, target_id, type, strength, metadata, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (data['id'], data['source_id'], data['target_id'], data['type'],
                     data['strength'], data['metadata'], data['created_at'])
                )

                self._log_update(conn, edge.id, EntityType.NODE, 'add_edge', None,
                               json.dumps({'type': edge.type.value, 'strength': edge.strength}))

            return True
        except Exception as e:
            logger.error(f"Failed to add edge {edge.id}: {e}")
            return False

    def get_edges_from_node(self, source_id: str) -> List[Edge]:
        """Get all edges from a source node"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT * FROM edges WHERE source_id = ? ORDER BY strength DESC",
                    (source_id,)
                )
                rows = cursor.fetchall()
                return [Edge.from_dict(dict(row)) for row in rows]
        except Exception as e:
            logger.error(f"Failed to get edges from {source_id}: {e}")
            return []

    def get_edges_to_node(self, target_id: str) -> List[Edge]:
        """Get all edges to a target node"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT * FROM edges WHERE target_id = ? ORDER BY strength DESC",
                    (target_id,)
                )
                rows = cursor.fetchall()
                return [Edge.from_dict(dict(row)) for row in rows]
        except Exception as e:
            logger.error(f"Failed to get edges to {target_id}: {e}")
            return []

    def delete_edge(self, edge_id: str) -> bool:
        """Delete an edge from the graph"""
        try:
            with self.transaction() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM edges WHERE id = ?", (edge_id,))
                self._log_update(conn, edge_id, EntityType.NODE, 'delete_edge', json.dumps({}), None)
            return True
        except Exception as e:
            logger.error(f"Failed to delete edge {edge_id}: {e}")
            return False

    def edge_count(self) -> int:
        """Get total number of edges"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM edges")
                result = cursor.fetchone()
                return result[0] if result else 0
        except Exception as e:
            logger.error(f"Failed to get edge count: {e}")
            return 0

    # Embedding Operations
    def add_embedding(self, embedding: Embedding) -> bool:
        """Add embedding for a node"""
        try:
            with self.transaction() as conn:
                cursor = conn.cursor()
                data = embedding.to_dict()

                cursor.execute(
                    """
                    INSERT OR REPLACE INTO embeddings
                    (id, node_id, embedding, dimension, model, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (data['id'], data['node_id'], data['embedding'], data['dimension'],
                     data['model'], data['created_at'], data['updated_at'])
                )

            return True
        except Exception as e:
            logger.error(f"Failed to add embedding for {embedding.node_id}: {e}")
            return False

    def get_embedding(self, node_id: str) -> Optional[Embedding]:
        """Get embedding for a node"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM embeddings WHERE node_id = ?", (node_id,))
                row = cursor.fetchone()

                if row:
                    return Embedding.from_dict(dict(row))
                return None
        except Exception as e:
            logger.error(f"Failed to get embedding for {node_id}: {e}")
            return None

    # Metadata Operations
    def set_metadata(self, key: str, value: str) -> bool:
        """Set a metadata value"""
        try:
            with self.transaction() as conn:
                cursor = conn.cursor()
                now = int(datetime.now().timestamp())

                cursor.execute(
                    "INSERT OR REPLACE INTO graph_metadata (key, value, updated_at) VALUES (?, ?, ?)",
                    (key, value, now)
                )

            return True
        except Exception as e:
            logger.error(f"Failed to set metadata {key}: {e}")
            return False

    def get_metadata(self, key: str) -> Optional[str]:
        """Get a metadata value"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT value FROM graph_metadata WHERE key = ?", (key,))
                row = cursor.fetchone()
                return row[0] if row else None
        except Exception as e:
            logger.error(f"Failed to get metadata {key}: {e}")
            return None

    def get_all_metadata(self) -> Dict[str, str]:
        """Get all metadata"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT key, value FROM graph_metadata")
                rows = cursor.fetchall()
                return {row[0]: row[1] for row in rows}
        except Exception as e:
            logger.error(f"Failed to get all metadata: {e}")
            return {}

    # Query Logging
    def log_query(self, query_log: QueryLog) -> bool:
        """Log a query execution"""
        try:
            with self.transaction() as conn:
                cursor = conn.cursor()
                data = query_log.to_dict()

                cursor.execute(
                    """
                    INSERT INTO query_log
                    (query, query_type, latency_ms, result_count, timestamp, user_id)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (data['query'], data['query_type'], data['latency_ms'],
                     data['result_count'], data['timestamp'], data['user_id'])
                )

            return True
        except Exception as e:
            logger.error(f"Failed to log query: {e}")
            return False

    def get_query_logs(self, limit: int = 100) -> List[QueryLog]:
        """Get recent query logs"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT * FROM query_log ORDER BY timestamp DESC LIMIT ?",
                    (limit,)
                )
                rows = cursor.fetchall()
                return [QueryLog.from_dict(dict(row)) for row in rows]
        except Exception as e:
            logger.error(f"Failed to get query logs: {e}")
            return []

    # Statistics
    def get_stats(self) -> Dict[str, Any]:
        """Get database statistics"""
        try:
            return {
                'node_count': self.node_count(),
                'edge_count': self.edge_count(),
                'db_size_mb': self.db_path.stat().st_size / (1024 * 1024),
                'version': self.version,
                'metadata': self.get_all_metadata(),
            }
        except Exception as e:
            logger.error(f"Failed to get stats: {e}")
            return {}

    # Utility Operations
    def _log_update(
        self,
        conn: sqlite3.Connection,
        entity_id: str,
        entity_type: EntityType,
        operation: str,
        old_value: Optional[str],
        new_value: Optional[str],
    ):
        """Log an update operation"""
        try:
            cursor = conn.cursor()
            now = int(datetime.now().timestamp())

            cursor.execute(
                """
                INSERT INTO update_history
                (entity_id, entity_type, operation, old_value, new_value, timestamp, source)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (entity_id, entity_type.value, operation, old_value, new_value, now, 'api')
            )
        except Exception as e:
            logger.warning(f"Failed to log update: {e}")

    def vacuum(self) -> bool:
        """Optimize database"""
        try:
            with self.get_connection() as conn:
                conn.execute("VACUUM")
            return True
        except Exception as e:
            logger.error(f"Failed to vacuum database: {e}")
            return False

    def close(self):
        """Close all connections in the pool"""
        with self._pool_lock:
            for conn in self._pool:
                try:
                    conn.close()
                except Exception as e:
                    logger.warning(f"Error closing connection: {e}")
            self._pool.clear()

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()
