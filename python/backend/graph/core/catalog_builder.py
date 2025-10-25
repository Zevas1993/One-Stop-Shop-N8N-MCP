"""
Catalog Builder
Build and serialize catalog for distribution and reuse
"""

import json
import logging
from typing import List, Dict, Optional
from pathlib import Path
from datetime import datetime
from dataclasses import asdict

from ..storage.database import Database
from .entity_extractor import AgenticNode
from .relationship_builder import AgenticEdge

logger = logging.getLogger(__name__)


class CatalogBuilder:
    """
    Build catalog.json for distribution and serialization
    Creates exportable catalog containing all graph data
    """

    def __init__(self, db: Database):
        """
        Initialize catalog builder

        Args:
            db: Database instance
        """
        self.db = db

    async def build_catalog(self, output_path: str) -> bool:
        """
        Build complete catalog from database

        Args:
            output_path: Path to write catalog.json

        Returns:
            True if successful
        """
        try:
            logger.info("Building catalog...")

            # Retrieve all data from database
            all_nodes = self.db.get_nodes(limit=10000)  # Get all nodes
            logger.info(f"Retrieved {len(all_nodes)} nodes from database")

            # Build catalog structure
            catalog = {
                'metadata': self._build_metadata(),
                'nodes': [self._serialize_node(node) for node in all_nodes],
                'manifest': self._build_manifest(all_nodes),
            }

            # Write to file
            output_file = Path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)

            with open(output_file, 'w') as f:
                json.dump(catalog, f, indent=2, default=str)

            logger.info(f"✓ Wrote catalog to {output_path}")
            logger.info(f"  Catalog size: {output_file.stat().st_size / (1024 * 1024):.2f} MB")

            return True

        except Exception as e:
            logger.error(f"Failed to build catalog: {e}")
            return False

    def _build_metadata(self) -> Dict:
        """Build catalog metadata"""
        db_stats = self.db.get_stats()

        return {
            'version': '1.0.0',
            'type': 'agentic-graphrag-n8n',
            'build_timestamp': datetime.now().isoformat(),
            'description': 'Complete n8n knowledge graph for agent reasoning',
            'nodes_count': db_stats.get('node_count', 0),
            'relationships_count': db_stats.get('edge_count', 0),
            'embedding_model': 'all-MiniLM-L6-v2',
            'embedding_dimension': 384,
        }

    def _serialize_node(self, node) -> Dict:
        """Serialize node to dictionary"""
        return {
            'id': node.id,
            'label': node.label,
            'description': node.description,
            'category': node.category,
            'keywords': node.keywords,
            'metadata': node.metadata,
            'created_at': node.created_at,
            'updated_at': node.updated_at,
        }

    def _build_manifest(self, nodes: List) -> Dict:
        """Build catalog manifest"""
        categories = {}
        for node in nodes:
            if node.category:
                if node.category not in categories:
                    categories[node.category] = 0
                categories[node.category] += 1

        return {
            'total_nodes': len(nodes),
            'total_edges': self.db.edge_count(),
            'categories': categories,
            'node_list': [
                {
                    'id': node.id,
                    'label': node.label,
                    'category': node.category,
                }
                for node in nodes
            ]
        }

    async def create_schema_export(self, output_path: str) -> bool:
        """
        Export database schema

        Args:
            output_path: Path to write schema

        Returns:
            True if successful
        """
        try:
            logger.info("Exporting schema...")

            schema_info = {
                'version': '1.0.0',
                'timestamp': datetime.now().isoformat(),
                'tables': self._get_table_schema(),
                'indexes': self._get_index_schema(),
            }

            with open(output_path, 'w') as f:
                json.dump(schema_info, f, indent=2)

            logger.info(f"✓ Exported schema to {output_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to export schema: {e}")
            return False

    def _get_table_schema(self) -> Dict:
        """Get table schema information"""
        return {
            'nodes': {
                'primary_key': 'id',
                'columns': [
                    'id', 'label', 'description', 'category',
                    'keywords', 'embedding', 'metadata',
                    'created_at', 'updated_at'
                ]
            },
            'edges': {
                'primary_key': 'id',
                'columns': [
                    'id', 'source_id', 'target_id', 'type',
                    'strength', 'metadata', 'created_at'
                ]
            },
            'embeddings': {
                'primary_key': 'id',
                'columns': [
                    'id', 'node_id', 'embedding', 'dimension',
                    'model', 'created_at', 'updated_at'
                ]
            },
        }

    def _get_index_schema(self) -> List[Dict]:
        """Get index information"""
        return [
            {'name': 'idx_nodes_category', 'table': 'nodes', 'column': 'category'},
            {'name': 'idx_edges_source', 'table': 'edges', 'column': 'source_id'},
            {'name': 'idx_edges_target', 'table': 'edges', 'column': 'target_id'},
            {'name': 'idx_edges_type', 'table': 'edges', 'column': 'type'},
            {'name': 'idx_embeddings_node', 'table': 'embeddings', 'column': 'node_id'},
        ]

    async def validate_catalog(self, catalog_path: str) -> bool:
        """
        Validate catalog integrity

        Args:
            catalog_path: Path to catalog file

        Returns:
            True if valid
        """
        try:
            logger.info("Validating catalog...")

            with open(catalog_path, 'r') as f:
                catalog = json.load(f)

            # Check required fields
            required_fields = ['metadata', 'nodes', 'manifest']
            for field in required_fields:
                if field not in catalog:
                    logger.error(f"Missing required field: {field}")
                    return False

            # Check metadata
            metadata = catalog['metadata']
            if not metadata.get('version'):
                logger.error("Missing metadata version")
                return False

            # Check nodes
            nodes = catalog['nodes']
            if not nodes:
                logger.error("No nodes in catalog")
                return False

            logger.info(f"✓ Catalog is valid")
            logger.info(f"  Nodes: {len(nodes)}")
            logger.info(f"  Edges (from manifest): {catalog['manifest'].get('total_edges', 0)}")
            logger.info(f"  Categories: {len(catalog['manifest'].get('categories', {}))}")

            return True

        except Exception as e:
            logger.error(f"Catalog validation failed: {e}")
            return False


class CatalogExporter:
    """Export catalog to various formats"""

    @staticmethod
    def export_to_csv(catalog: Dict, output_path: str) -> bool:
        """Export nodes to CSV"""
        try:
            import csv

            with open(output_path, 'w', newline='') as f:
                nodes = catalog.get('nodes', [])
                if not nodes:
                    return False

                writer = csv.DictWriter(
                    f,
                    fieldnames=['id', 'label', 'description', 'category', 'keywords']
                )
                writer.writeheader()

                for node in nodes:
                    writer.writerow({
                        'id': node.get('id', ''),
                        'label': node.get('label', ''),
                        'description': node.get('description', ''),
                        'category': node.get('category', ''),
                        'keywords': ','.join(node.get('keywords', [])),
                    })

            logger.info(f"✓ Exported to CSV: {output_path}")
            return True

        except Exception as e:
            logger.error(f"CSV export failed: {e}")
            return False

    @staticmethod
    def export_to_jsonl(catalog: Dict, output_path: str) -> bool:
        """Export nodes to JSONL format"""
        try:
            with open(output_path, 'w') as f:
                for node in catalog.get('nodes', []):
                    f.write(json.dumps(node) + '\n')

            logger.info(f"✓ Exported to JSONL: {output_path}")
            return True

        except Exception as e:
            logger.error(f"JSONL export failed: {e}")
            return False

    @staticmethod
    def export_manifest(catalog: Dict, output_path: str) -> bool:
        """Export just the manifest"""
        try:
            manifest = catalog.get('manifest', {})

            with open(output_path, 'w') as f:
                json.dump(manifest, f, indent=2)

            logger.info(f"✓ Exported manifest: {output_path}")
            return True

        except Exception as e:
            logger.error(f"Manifest export failed: {e}")
            return False
