"""
Agentic Graph Builder
Orchestrate building complete knowledge graph with agentic focus
"""

import logging
import time
import numpy as np
from typing import List, Dict, Optional, Tuple
from pathlib import Path
from datetime import datetime
import json

from ..storage.database import Database
from ..storage.models import Node, Edge, Embedding, GraphMetadata
from .entity_extractor import AgenticEntityExtractor, AgenticNode
from .relationship_builder import AgenticRelationshipBuilder, AgenticEdge, RelationshipType

logger = logging.getLogger(__name__)


class AgenticGraphBuilder:
    """
    Orchestrate building complete knowledge graph with agentic focus
    Coordinates node/edge/embedding creation and database storage
    """

    def __init__(self, db: Database):
        """
        Initialize graph builder

        Args:
            db: Database instance for storage
        """
        self.db = db
        self.entity_extractor = AgenticEntityExtractor("/tmp/nodes.db")  # Will be updated
        self.relationship_builder = AgenticRelationshipBuilder()
        self.start_time = None
        self.stats = {
            'nodes_extracted': 0,
            'nodes_stored': 0,
            'embeddings_generated': 0,
            'relationships_created': 0,
            'relationships_stored': 0,
            'total_time_seconds': 0
        }

    async def build_complete_graph(
        self,
        nodes_db_path: str,
        output_db_path: str,
        embedding_model: str = "all-MiniLM-L6-v2"
    ) -> bool:
        """
        Build complete knowledge graph

        Args:
            nodes_db_path: Path to n8n nodes database
            output_db_path: Path to output GraphRAG database
            embedding_model: Embedding model to use

        Returns:
            True if successful
        """
        self.start_time = time.time()
        logger.info("=" * 60)
        logger.info("STARTING AGENTIC GRAPH BUILDER")
        logger.info("=" * 60)

        try:
            # Step 1: Extract nodes
            logger.info("\n[Step 1/5] Extracting n8n nodes...")
            nodes = self._extract_nodes(nodes_db_path)
            if not nodes:
                logger.error("Failed to extract nodes")
                return False
            self.stats['nodes_extracted'] = len(nodes)
            logger.info(f"✓ Extracted {len(nodes)} nodes")

            # Step 2: Store nodes
            logger.info("\n[Step 2/5] Storing nodes in database...")
            nodes_stored = self._store_nodes(nodes)
            self.stats['nodes_stored'] = nodes_stored
            logger.info(f"✓ Stored {nodes_stored} nodes")

            # Step 3: Generate embeddings
            logger.info("\n[Step 3/5] Generating embeddings...")
            embeddings = self._generate_embeddings(nodes, embedding_model)
            self.stats['embeddings_generated'] = len(embeddings)
            logger.info(f"✓ Generated {len(embeddings)} embeddings")

            # Step 4: Build relationships
            logger.info("\n[Step 4/5] Building relationships...")
            relationships = self._build_relationships(nodes)
            self.stats['relationships_created'] = len(relationships)
            logger.info(f"✓ Created {len(relationships)} relationships")

            # Step 5: Store relationships
            logger.info("\n[Step 5/5] Storing relationships...")
            rels_stored = self._store_relationships(relationships)
            self.stats['relationships_stored'] = rels_stored
            logger.info(f"✓ Stored {rels_stored} relationships")

            # Store metadata
            self._store_graph_metadata()

            # Print summary
            elapsed = time.time() - self.start_time
            self.stats['total_time_seconds'] = elapsed
            self._print_summary(elapsed)

            return True

        except Exception as e:
            logger.error(f"Graph building failed: {e}")
            return False

    def _extract_nodes(self, nodes_db_path: str) -> List[AgenticNode]:
        """Extract all nodes with agent metadata"""
        try:
            self.entity_extractor.nodes_db_path = Path(nodes_db_path)
            nodes = self.entity_extractor.extract_all_nodes()
            return nodes
        except Exception as e:
            logger.error(f"Node extraction failed: {e}")
            return []

    def _store_nodes(self, nodes: List[AgenticNode]) -> int:
        """Store nodes in database"""
        stored = 0
        for i, node in enumerate(nodes):
            try:
                # Convert agentic node to storage node
                storage_node = Node(
                    id=node.id,
                    label=node.label,
                    description=node.description,
                    category=node.category,
                    keywords=node.keywords,
                    metadata={
                        'use_cases': node.use_cases,
                        'prerequisites': node.prerequisites,
                        'agent_tips': node.agent_tips,
                        'failure_modes': node.failure_modes,
                        'common_configurations': node.common_configurations,
                        'complexity': node.complexity,
                        'learning_curve': node.learning_curve,
                        'properties': node.properties,
                        'operations': node.operations,
                        'success_rate': node.success_rate,
                        'usage_frequency': node.usage_frequency,
                        'average_rating': node.average_rating,
                    }
                )

                if self.db.add_node(storage_node):
                    stored += 1

                if (i + 1) % 100 == 0:
                    logger.info(f"  Stored {i + 1}/{len(nodes)} nodes...")

            except Exception as e:
                logger.warning(f"Failed to store node {node.id}: {e}")

        return stored

    def _generate_embeddings(self, nodes: List[AgenticNode], model: str) -> List[Embedding]:
        """
        Generate embeddings for all nodes

        Args:
            nodes: List of nodes
            model: Embedding model name

        Returns:
            List of Embedding objects
        """
        try:
            # Try to import sentence-transformers
            try:
                from sentence_transformers import SentenceTransformer
                use_real_embeddings = True
            except ImportError:
                logger.warning("sentence-transformers not installed, using random embeddings")
                use_real_embeddings = False

            embeddings = []

            if use_real_embeddings:
                logger.info(f"Loading {model}...")
                transformer = SentenceTransformer(model)

                # Prepare texts to embed
                texts = [f"{node.label}: {node.description or ''}" for node in nodes]

                logger.info("Generating embeddings...")
                embeddings_data = transformer.encode(texts, show_progress_bar=True)

                # Create embedding objects
                for i, node in enumerate(nodes):
                    embedding = Embedding(
                        id=f"emb-{node.id}",
                        node_id=node.id,
                        embedding=embeddings_data[i],
                        dimension=embeddings_data[i].shape[0],
                        model=model
                    )
                    embeddings.append(embedding)
                    self.db.add_embedding(embedding)

                    if (i + 1) % 100 == 0:
                        logger.info(f"  Processed {i + 1}/{len(nodes)} embeddings...")

            else:
                # Generate random embeddings for testing
                logger.info("Generating random embeddings for testing...")
                for i, node in enumerate(nodes):
                    embedding_vector = np.random.rand(384).astype(np.float32)
                    embedding = Embedding(
                        id=f"emb-{node.id}",
                        node_id=node.id,
                        embedding=embedding_vector,
                        dimension=384,
                        model=model
                    )
                    embeddings.append(embedding)
                    self.db.add_embedding(embedding)

                    if (i + 1) % 100 == 0:
                        logger.info(f"  Processed {i + 1}/{len(nodes)} embeddings...")

            return embeddings

        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            return []

    def _build_relationships(self, nodes: List[AgenticNode]) -> List[AgenticEdge]:
        """Build relationships between nodes"""
        try:
            relationships = self.relationship_builder.build_relationships(nodes)
            return relationships
        except Exception as e:
            logger.error(f"Relationship building failed: {e}")
            return []

    def _store_relationships(self, relationships: List[AgenticEdge]) -> int:
        """Store relationships in database"""
        stored = 0
        for i, rel in enumerate(relationships):
            try:
                # Convert agentic edge to storage edge
                storage_edge = Edge(
                    id=rel.id,
                    source_id=rel.source_id,
                    target_id=rel.target_id,
                    type=rel.type,
                    strength=rel.strength,
                    metadata={
                        'reasoning': rel.reasoning,
                        'success_rate': rel.success_rate,
                        'common_pattern': rel.common_pattern,
                        'common_config_mapping': rel.common_config_mapping,
                        'gotchas': rel.gotchas,
                        'agent_guidance': rel.agent_guidance,
                    }
                )

                if self.db.add_edge(storage_edge):
                    stored += 1

                if (i + 1) % 500 == 0:
                    logger.info(f"  Stored {i + 1}/{len(relationships)} relationships...")

            except Exception as e:
                logger.warning(f"Failed to store relationship {rel.id}: {e}")

        return stored

    def _store_graph_metadata(self):
        """Store graph metadata"""
        try:
            timestamp = datetime.now().isoformat()

            metadata_entries = [
                ('build_timestamp', timestamp),
                ('graph_type', 'agentic-graphrag-n8n'),
                ('version', '1.0.0'),
                ('nodes_total', str(self.stats['nodes_stored'])),
                ('relationships_total', str(self.stats['relationships_stored'])),
                ('embeddings_total', str(self.stats['embeddings_generated'])),
                ('embedding_model', 'all-MiniLM-L6-v2'),
                ('build_time_seconds', str(int(self.stats['total_time_seconds']))),
            ]

            for key, value in metadata_entries:
                self.db.set_metadata(key, value)

            logger.info("✓ Stored graph metadata")

        except Exception as e:
            logger.warning(f"Failed to store metadata: {e}")

    def _print_summary(self, elapsed_time: float):
        """Print build summary"""
        logger.info("\n" + "=" * 60)
        logger.info("GRAPH BUILD COMPLETE")
        logger.info("=" * 60)
        logger.info(f"Total Time: {elapsed_time:.2f} seconds")
        logger.info("\nStatistics:")
        logger.info(f"  Nodes Extracted: {self.stats['nodes_extracted']}")
        logger.info(f"  Nodes Stored: {self.stats['nodes_stored']}")
        logger.info(f"  Embeddings Generated: {self.stats['embeddings_generated']}")
        logger.info(f"  Relationships Created: {self.stats['relationships_created']}")
        logger.info(f"  Relationships Stored: {self.stats['relationships_stored']}")

        db_stats = self.db.get_stats()
        logger.info("\nDatabase Statistics:")
        logger.info(f"  Database Size: {db_stats.get('db_size_mb', 0):.2f} MB")
        logger.info(f"  Total Nodes: {db_stats.get('node_count', 0)}")
        logger.info(f"  Total Edges: {db_stats.get('edge_count', 0)}")

        logger.info("\n✓ Graph ready for semantic queries!")
        logger.info("=" * 60)

    def get_stats(self) -> Dict:
        """Get build statistics"""
        return self.stats.copy()
