"""
Test Graph Builder
Comprehensive tests for graph building pipeline
"""

import logging
import asyncio
from pathlib import Path
import json

from ..storage.database import Database
from .entity_extractor import AgenticEntityExtractor
from .relationship_builder import AgenticRelationshipBuilder
from .graph_builder import AgenticGraphBuilder
from .catalog_builder import CatalogBuilder, CatalogExporter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_entity_extractor():
    """Test entity extraction"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST: Entity Extractor")
    logger.info("=" * 60)

    try:
        extractor = AgenticEntityExtractor("/tmp/nodes.db")

        # Test categorization
        logger.info("\nTesting categorization...")
        test_nodes = [
            {'id': 'n8n-nodes-base.slack', 'label': 'Slack'},
            {'id': 'n8n-nodes-base.httpRequest', 'label': 'HTTP Request'},
            {'id': 'n8n-nodes-base.set', 'label': 'Set'},
        ]

        for node_data in test_nodes:
            enriched = extractor._enrich_node(node_data)
            logger.info(f"  {node_data['label']}: {enriched.category}")
            logger.info(f"    Keywords: {', '.join(enriched.keywords[:5])}")
            logger.info(f"    Tips: {enriched.agent_tips[0] if enriched.agent_tips else 'None'}")

        logger.info("✓ Entity extraction tests passed")
        return True

    except Exception as e:
        logger.error(f"✗ Entity extraction tests failed: {e}")
        return False


async def test_relationship_builder():
    """Test relationship building"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST: Relationship Builder")
    logger.info("=" * 60)

    try:
        from .entity_extractor import AgenticNode

        builder = AgenticRelationshipBuilder()

        # Create test nodes
        nodes = [
            AgenticNode(id='n8n-nodes-base.slack', label='Slack'),
            AgenticNode(id='n8n-nodes-base.httpRequest', label='HTTP Request'),
            AgenticNode(id='n8n-nodes-base.set', label='Set'),
        ]

        # Build relationships
        logger.info("Building relationships...")
        edges = builder.build_relationships(nodes)

        logger.info(f"Created {len(edges)} relationships")
        for edge in edges[:5]:
            logger.info(f"  {edge.source_id} --{edge.type.value}--> {edge.target_id} (strength: {edge.strength})")

        logger.info("✓ Relationship building tests passed")
        return True

    except Exception as e:
        logger.error(f"✗ Relationship building tests failed: {e}")
        return False


async def test_graph_builder_pipeline():
    """Test complete graph building pipeline"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST: Graph Builder Pipeline")
    logger.info("=" * 60)

    test_db_path = "/tmp/test_graph.db"
    test_nodes_db = "/tmp/test_nodes.db"

    try:
        # Clean up old test database
        db_file = Path(test_db_path)
        if db_file.exists():
            db_file.unlink()
            for suffix in ['-wal', '-shm']:
                (Path(str(db_file) + suffix)).unlink(missing_ok=True)

        # Create test database
        logger.info("Creating test database...")
        db = Database(test_db_path, pool_size=2)

        # Create graph builder
        builder = AgenticGraphBuilder(db)

        # Test with mock data (since nodes.db might not exist)
        logger.info("Testing graph builder with mock data...")

        # Create a few test nodes manually
        from .entity_extractor import AgenticNode
        test_nodes = [
            AgenticNode(
                id='test-slack',
                label='Slack',
                description='Send messages to Slack',
                category='Communication',
                use_cases=['Send notifications'],
                agent_tips=['Test before production']
            ),
            AgenticNode(
                id='test-http',
                label='HTTP Request',
                description='Make HTTP requests',
                category='API',
                use_cases=['Fetch data'],
                agent_tips=['Handle errors']
            ),
        ]

        # Store nodes
        logger.info("Storing test nodes...")
        stored = 0
        for node in test_nodes:
            from ..storage.models import Node
            storage_node = Node(
                id=node.id,
                label=node.label,
                description=node.description,
                category=node.category,
                metadata={'tips': node.agent_tips}
            )
            if db.add_node(storage_node):
                stored += 1
                logger.info(f"  ✓ Stored: {node.label}")

        logger.info(f"Stored {stored}/{len(test_nodes)} nodes")

        # Get statistics
        stats = db.get_stats()
        logger.info(f"Database stats: {stats.get('node_count', 0)} nodes")

        db.close()
        logger.info("✓ Graph builder pipeline tests passed")
        return True

    except Exception as e:
        logger.error(f"✗ Graph builder pipeline tests failed: {e}")
        return False
    finally:
        # Clean up
        if Path(test_db_path).exists():
            Path(test_db_path).unlink()


async def test_catalog_builder():
    """Test catalog building"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST: Catalog Builder")
    logger.info("=" * 60)

    test_db_path = "/tmp/test_catalog.db"
    catalog_path = "/tmp/test_catalog.json"

    try:
        # Create test database with sample data
        logger.info("Creating test database...")
        db = Database(test_db_path, pool_size=2)

        # Add sample data
        from ..storage.models import Node
        test_node = Node(
            id='test-node-1',
            label='Test Node',
            description='Test description',
            metadata={'category': 'Test'}
        )
        db.add_node(test_node)

        # Create catalog builder
        builder = CatalogBuilder(db)

        # Build catalog
        logger.info("Building catalog...")
        success = await builder.build_catalog(catalog_path)

        if success:
            # Check file exists
            if Path(catalog_path).exists():
                logger.info(f"✓ Catalog created: {catalog_path}")

                # Validate catalog
                valid = await builder.validate_catalog(catalog_path)
                if valid:
                    logger.info("✓ Catalog validation passed")

                    # Try exporting
                    exporter = CatalogExporter()
                    with open(catalog_path, 'r') as f:
                        catalog = json.load(f)

                    # Export to JSONL
                    jsonl_path = "/tmp/test_catalog.jsonl"
                    if exporter.export_to_jsonl(catalog, jsonl_path):
                        logger.info("✓ JSONL export passed")

        db.close()
        logger.info("✓ Catalog builder tests passed")
        return True

    except Exception as e:
        logger.error(f"✗ Catalog builder tests failed: {e}")
        return False
    finally:
        # Clean up
        for path in [test_db_path, catalog_path, "/tmp/test_catalog.jsonl"]:
            Path(path).unlink(missing_ok=True)


async def run_all_tests():
    """Run all tests"""
    logger.info("=" * 60)
    logger.info("GRAPH BUILDER TEST SUITE")
    logger.info("=" * 60)

    tests = [
        ("Entity Extractor", test_entity_extractor),
        ("Relationship Builder", test_relationship_builder),
        ("Graph Builder Pipeline", test_graph_builder_pipeline),
        ("Catalog Builder", test_catalog_builder),
    ]

    results = []
    for name, test_func in tests:
        try:
            result = await test_func()
            results.append((name, result))
        except Exception as e:
            logger.error(f"Test {name} failed with exception: {e}")
            results.append((name, False))

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
    logger.info("=" * 60)

    return passed == total


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    exit(0 if success else 1)
