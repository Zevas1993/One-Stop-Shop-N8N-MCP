"""
Database Migrations for GraphRAG
Handles version control and schema updates
"""

import sqlite3
from pathlib import Path
from typing import Dict, List, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class MigrationManager:
    """Manages database schema migrations"""

    MIGRATIONS: Dict[str, str] = {
        '1.0.0': """
        -- Initial schema is created by schema.py SCHEMA constant
        -- This migration file tracks updates
        """,
    }

    def __init__(self, db_path: str):
        """Initialize migration manager"""
        self.db_path = Path(db_path)

    def get_current_version(self, conn: sqlite3.Connection) -> str:
        """Get current database schema version"""
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM _schema_info WHERE key = 'version'")
            row = cursor.fetchone()
            return row[0] if row else '1.0.0'
        except Exception as e:
            logger.warning(f"Could not get schema version: {e}")
            return '1.0.0'

    def set_version(self, conn: sqlite3.Connection, version: str) -> bool:
        """Set database schema version"""
        try:
            cursor = conn.cursor()
            now = int(datetime.now().timestamp())
            cursor.execute(
                "INSERT OR REPLACE INTO _schema_info (key, value) VALUES (?, ?)",
                ('version', version)
            )
            conn.commit()
            return True
        except Exception as e:
            logger.error(f"Failed to set schema version: {e}")
            return False

    def record_migration(
        self,
        conn: sqlite3.Connection,
        from_version: str,
        to_version: str,
        description: str = ""
    ) -> bool:
        """Record a migration in the database"""
        try:
            cursor = conn.cursor()
            now = int(datetime.now().timestamp())

            cursor.execute(
                """
                INSERT INTO schema_version (version, description, applied_at)
                VALUES (?, ?, ?)
                """,
                (to_version, description or f"Migration from {from_version} to {to_version}", now)
            )
            conn.commit()
            return True
        except Exception as e:
            logger.error(f"Failed to record migration: {e}")
            return False

    def get_migration_history(self, conn: sqlite3.Connection) -> List[Dict[str, str]]:
        """Get all applied migrations"""
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT version, description, applied_at FROM schema_version ORDER BY applied_at"
            )
            rows = cursor.fetchall()
            return [
                {
                    'version': row[0],
                    'description': row[1],
                    'applied_at': row[2],
                }
                for row in rows
            ]
        except Exception as e:
            logger.error(f"Failed to get migration history: {e}")
            return []

    def migrate_to_version(
        self,
        conn: sqlite3.Connection,
        target_version: str
    ) -> bool:
        """Migrate database to target version"""
        try:
            current = self.get_current_version(conn)
            logger.info(f"Current schema version: {current}")

            if current == target_version:
                logger.info(f"Already at version {target_version}")
                return True

            # Define migration path
            migrations = [
                ('1.0.0', '1.0.1', "Add query performance indexes"),
                ('1.0.1', '1.0.2', "Add metadata caching tables"),
                ('1.0.2', '1.0.3', "Add relationship traversal indexes"),
                ('1.0.3', '1.0.4', "Add update history tracking"),
            ]

            # Find migration path
            migration_path = []
            for from_v, to_v, desc in migrations:
                if from_v == current and to_v <= target_version:
                    migration_path.append((from_v, to_v, desc))
                    current = to_v

            # Apply migrations
            for from_v, to_v, desc in migration_path:
                logger.info(f"Migrating from {from_v} to {to_v}: {desc}")

                # Apply migration SQL
                migration_sql = self._get_migration_sql(from_v, to_v)
                if migration_sql:
                    cursor = conn.cursor()
                    cursor.executescript(migration_sql)
                    conn.commit()

                # Record migration
                self.record_migration(conn, from_v, to_v, desc)
                self.set_version(conn, to_v)

            return True

        except Exception as e:
            logger.error(f"Migration failed: {e}")
            conn.rollback()
            return False

    def _get_migration_sql(self, from_version: str, to_version: str) -> Optional[str]:
        """Get SQL for a specific migration"""
        # Define migration scripts
        migrations_sql: Dict[str, Dict[str, str]] = {
            ('1.0.0', '1.0.1'): """
            -- Add performance indexes
            CREATE INDEX IF NOT EXISTS idx_edges_strength ON edges(strength DESC);
            CREATE INDEX IF NOT EXISTS idx_nodes_updated_at ON nodes(updated_at DESC);
            """,

            ('1.0.1', '1.0.2'): """
            -- Add caching tables if they don't exist
            CREATE TABLE IF NOT EXISTS entity_cache (
                node_id TEXT PRIMARY KEY,
                cached_data TEXT NOT NULL,
                ttl_seconds INTEGER DEFAULT 3600,
                created_at INTEGER,
                expires_at INTEGER,
                FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_entity_cache_expires_at ON entity_cache(expires_at);

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
            """,

            ('1.0.2', '1.0.3'): """
            -- Add indexes for relationship traversal
            CREATE INDEX IF NOT EXISTS idx_edges_source_type ON edges(source_id, type);
            CREATE INDEX IF NOT EXISTS idx_edges_target_type ON edges(target_id, type);
            CREATE INDEX IF NOT EXISTS idx_edges_strength_type ON edges(strength DESC, type);
            """,

            ('1.0.3', '1.0.4'): """
            -- Update history is already defined in initial schema
            -- Just ensure it exists
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
            """,
        }

        key = (from_version, to_version)
        return migrations_sql.get(key)

    @staticmethod
    def verify_schema(conn: sqlite3.Connection) -> bool:
        """Verify database schema integrity"""
        try:
            cursor = conn.cursor()

            # Check required tables
            required_tables = [
                'nodes',
                'edges',
                'embeddings',
                'graph_metadata',
                'query_log',
                'update_history',
                'schema_version',
            ]

            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            existing_tables = {row[0] for row in cursor.fetchall()}

            missing = set(required_tables) - existing_tables
            if missing:
                logger.error(f"Missing tables: {missing}")
                return False

            logger.info("Schema verification passed")
            return True

        except Exception as e:
            logger.error(f"Schema verification failed: {e}")
            return False


class DatabaseInitializer:
    """Initialize and prepare database for use"""

    def __init__(self, db_path: str):
        """Initialize database initializer"""
        self.db_path = Path(db_path)
        self.migration_manager = MigrationManager(str(db_path))

    def initialize(self, target_version: str = '1.0.0') -> bool:
        """Initialize database with schema and migrations"""
        try:
            conn = sqlite3.connect(str(self.db_path))
            conn.execute("PRAGMA foreign_keys = ON")

            # Verify schema
            if not self.migration_manager.verify_schema(conn):
                logger.error("Schema verification failed")
                conn.close()
                return False

            # Get current version
            current = self.migration_manager.get_current_version(conn)
            logger.info(f"Database initialized at version {current}")

            conn.close()
            return True

        except Exception as e:
            logger.error(f"Initialization failed: {e}")
            return False

    def reset(self, backup_first: bool = True) -> bool:
        """Reset database (delete and recreate)"""
        try:
            if backup_first and self.db_path.exists():
                backup_path = self.db_path.with_suffix(f'{self.db_path.suffix}.backup')
                self.db_path.rename(backup_path)
                logger.info(f"Backed up database to {backup_path}")

            # Remove database files
            for suffix in ['', '-wal', '-shm']:
                path = Path(str(self.db_path) + suffix)
                if path.exists():
                    path.unlink()

            logger.info("Database reset complete")
            return True

        except Exception as e:
            logger.error(f"Reset failed: {e}")
            return False
