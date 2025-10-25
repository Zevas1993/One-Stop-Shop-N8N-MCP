"""
Test Storage Layer
Validates database operations and provides test fixtures
"""

import logging
from pathlib import Path
import numpy as np
from datetime import datetime

from .database import Database
from .models import Node, Edge, Embedding, GraphMetadata, QueryLog, QueryType, RelationshipType
from .migrations import DatabaseInitializer, MigrationManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def test_database_initialization():
    """Test database initialization"""
    db_path = Path('/tmp/test_graphrag.db')
    if db_path.exists():
        db_path.unlink()

    try:
        db = Database(str(db_path), pool_size=2)
        logger.info("✓ Database initialized successfully")

        # Check statistics
        stats = db.get_stats()
        logger.info(f"✓ Database stats: {stats}")

        db.close()
        return True
    except Exception as e:
        logger.error(f"✗ Database initialization failed: {e}")
        return False


def test_node_operations():
    """Test node CRUD operations"""
    db_path = Path('/tmp/test_graphrag.db')
    if db_path.exists():
        db_path.unlink()

    try:
        db = Database(str(db_path))

        # Create test nodes
        nodes = [
            Node(
                id="n8n-nodes-base.slack",
                label="Slack",
                description="Send messages to Slack",
                category="Communication",
                keywords=["slack", "message", "notification"],
                metadata={"version": "2.0", "operations": ["send"]}
            ),
            Node(
                id="n8n-nodes-base.httpRequest",
                label="HTTP Request",
                description="Make HTTP requests",
                category="Requests",
                keywords=["http", "request", "api"],
                metadata={"version": "4.0", "operations": ["get", "post"]}
            ),
            Node(
                id="n8n-nodes-base.set",
                label="Set",
                description="Set properties on data",
                category="Data",
                keywords=["set", "property", "data"],
                metadata={"version": "2.0", "operations": ["set"]}
            ),
        ]

        # Add nodes
        for node in nodes:
            success = db.add_node(node)
            if success:
                logger.info(f"✓ Added node: {node.label}")
            else:
                logger.error(f"✗ Failed to add node: {node.label}")
                return False

        # Retrieve nodes
        retrieved = db.get_node("n8n-nodes-base.slack")
        if retrieved and retrieved.label == "Slack":
            logger.info(f"✓ Retrieved node: {retrieved.label}")
        else:
            logger.error("✗ Failed to retrieve node")
            return False

        # Get nodes by category
        comm_nodes = db.get_nodes_by_category("Communication")
        if len(comm_nodes) == 1:
            logger.info(f"✓ Found {len(comm_nodes)} communication node(s)")
        else:
            logger.error(f"✗ Expected 1 communication node, got {len(comm_nodes)}")
            return False

        # Check node count
        count = db.node_count()
        if count == 3:
            logger.info(f"✓ Node count: {count}")
        else:
            logger.error(f"✗ Expected 3 nodes, got {count}")
            return False

        db.close()
        return True

    except Exception as e:
        logger.error(f"✗ Node operations test failed: {e}")
        return False


def test_edge_operations():
    """Test edge CRUD operations"""
    db_path = Path('/tmp/test_graphrag.db')
    if db_path.exists():
        db_path.unlink()

    try:
        db = Database(str(db_path))

        # Add nodes first
        nodes = [
            Node(id="n8n-nodes-base.slack", label="Slack"),
            Node(id="n8n-nodes-base.httpRequest", label="HTTP Request"),
        ]
        for node in nodes:
            db.add_node(node)

        # Create edges
        edges = [
            Edge(
                id="edge-1",
                source_id="n8n-nodes-base.httpRequest",
                target_id="n8n-nodes-base.slack",
                type=RelationshipType.COMPATIBLE_WITH,
                strength=0.95
            ),
        ]

        # Add edges
        for edge in edges:
            success = db.add_edge(edge)
            if success:
                logger.info(f"✓ Added edge: {edge.source_id} -> {edge.target_id}")
            else:
                logger.error(f"✗ Failed to add edge")
                return False

        # Get edges from node
        edges_from = db.get_edges_from_node("n8n-nodes-base.httpRequest")
        if len(edges_from) == 1:
            logger.info(f"✓ Found {len(edges_from)} outgoing edge(s)")
        else:
            logger.error(f"✗ Expected 1 outgoing edge, got {len(edges_from)}")
            return False

        # Check edge count
        count = db.edge_count()
        if count == 1:
            logger.info(f"✓ Edge count: {count}")
        else:
            logger.error(f"✗ Expected 1 edge, got {count}")
            return False

        db.close()
        return True

    except Exception as e:
        logger.error(f"✗ Edge operations test failed: {e}")
        return False


def test_embedding_operations():
    """Test embedding storage and retrieval"""
    db_path = Path('/tmp/test_graphrag.db')
    if db_path.exists():
        db_path.unlink()

    try:
        db = Database(str(db_path))

        # Add a node first
        node = Node(id="n8n-nodes-base.slack", label="Slack")
        db.add_node(node)

        # Create embedding
        embedding_vector = np.random.rand(384).astype(np.float32)
        embedding = Embedding(
            id="emb-1",
            node_id="n8n-nodes-base.slack",
            embedding=embedding_vector,
            dimension=384,
            model="all-MiniLM-L6-v2"
        )

        # Add embedding
        success = db.add_embedding(embedding)
        if success:
            logger.info(f"✓ Added embedding for node")
        else:
            logger.error(f"✗ Failed to add embedding")
            return False

        # Retrieve embedding
        retrieved = db.get_embedding("n8n-nodes-base.slack")
        if retrieved and retrieved.dimension == 384:
            logger.info(f"✓ Retrieved embedding with dimension {retrieved.dimension}")
        else:
            logger.error("✗ Failed to retrieve embedding")
            return False

        db.close()
        return True

    except Exception as e:
        logger.error(f"✗ Embedding operations test failed: {e}")
        return False


def test_metadata_operations():
    """Test metadata storage and retrieval"""
    db_path = Path('/tmp/test_graphrag.db')
    if db_path.exists():
        db_path.unlink()

    try:
        db = Database(str(db_path))

        # Set metadata
        success = db.set_metadata("graph_size", "526")
        if success:
            logger.info(f"✓ Set metadata: graph_size=526")
        else:
            logger.error(f"✗ Failed to set metadata")
            return False

        # Get metadata
        value = db.get_metadata("graph_size")
        if value == "526":
            logger.info(f"✓ Retrieved metadata: {value}")
        else:
            logger.error(f"✗ Expected '526', got '{value}'")
            return False

        # Get all metadata
        all_meta = db.get_all_metadata()
        logger.info(f"✓ Retrieved {len(all_meta)} metadata entries")

        db.close()
        return True

    except Exception as e:
        logger.error(f"✗ Metadata operations test failed: {e}")
        return False


def test_query_logging():
    """Test query log operations"""
    db_path = Path('/tmp/test_graphrag.db')
    if db_path.exists():
        db_path.unlink()

    try:
        db = Database(str(db_path))

        # Create query log entry
        query_log = QueryLog(
            query="Send Slack notifications",
            query_type=QueryType.SEMANTIC_SEARCH,
            latency_ms=25,
            result_count=5
        )

        # Log query
        success = db.log_query(query_log)
        if success:
            logger.info(f"✓ Logged query")
        else:
            logger.error(f"✗ Failed to log query")
            return False

        # Get query logs
        logs = db.get_query_logs(limit=10)
        if len(logs) > 0:
            logger.info(f"✓ Retrieved {len(logs)} query log(s)")
        else:
            logger.error(f"✗ No query logs found")
            return False

        db.close()
        return True

    except Exception as e:
        logger.error(f"✗ Query logging test failed: {e}")
        return False


def run_all_tests():
    """Run all storage layer tests"""
    logger.info("=" * 60)
    logger.info("GRAPHRAG STORAGE LAYER TEST SUITE")
    logger.info("=" * 60)

    tests = [
        ("Database Initialization", test_database_initialization),
        ("Node Operations", test_node_operations),
        ("Edge Operations", test_edge_operations),
        ("Embedding Operations", test_embedding_operations),
        ("Metadata Operations", test_metadata_operations),
        ("Query Logging", test_query_logging),
    ]

    results = []
    for name, test_func in tests:
        logger.info(f"\nTesting: {name}")
        logger.info("-" * 60)
        result = test_func()
        results.append((name, result))

    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("TEST SUMMARY")
    logger.info("=" * 60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        logger.info(f"{status}: {name}")

    logger.info(f"\nTotal: {passed}/{total} tests passed")

    # Cleanup
    db_path = Path('/tmp/test_graphrag.db')
    if db_path.exists():
        db_path.unlink()
        logger.info("\nCleaned up test database")

    return passed == total


if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
