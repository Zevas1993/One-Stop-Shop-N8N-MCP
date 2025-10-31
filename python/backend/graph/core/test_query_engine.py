"""
Comprehensive tests for Query Engine (Phase 5.3)

Tests all components of the semantic query engine:
- Semantic search engine
- Graph traversal engine
- Explanation generator
- Response formatter
- Query orchestration
"""

import pytest
import asyncio
import numpy as np
import json
from unittest.mock import Mock, MagicMock, AsyncMock

# Import components
from semantic_search import SemanticSearchEngine, SearchResult, SearchType
from graph_traversal import GraphTraversalEngine, Path, TraversalType
from explanation_generator import ExplanationGenerator, Explanation, ExplanationType
from response_formatter import ResponseFormatter, ResponseFormat, QueryResponse
from query_engine import QueryEngine, QueryType, QueryRequest


class MockDatabase:
    """Mock database for testing"""

    def __init__(self):
        self.nodes = {}
        self.edges = {}
        self.embeddings = {}
        self._setup_mock_data()

    def _setup_mock_data(self):
        """Setup test data"""
        # Create mock nodes
        self.nodes["http-request"] = Mock(
            id="http-request",
            label="HTTP Request",
            description="Makes HTTP requests to external services",
            metadata={
                "type": "nodes-base.httpRequest",
                "category": "network",
                "keywords": ["http", "api", "request"],
                "use_cases": ["Call REST APIs", "Fetch data from web"],
                "prerequisites": ["Know the API endpoint", "Auth credentials if needed"],
                "agent_tips": ["Always validate the API response", "Handle errors gracefully"],
                "failure_modes": ["Invalid URL", "Auth failure", "Timeout"],
            }
        )

        self.nodes["slack"] = Mock(
            id="slack",
            label="Slack",
            description="Send messages to Slack",
            metadata={
                "type": "nodes-base.slack",
                "category": "communication",
                "keywords": ["slack", "message", "notification"],
                "use_cases": ["Send notifications", "Post alerts"],
                "prerequisites": ["Slack API token", "Channel ID"],
                "agent_tips": ["Format messages nicely", "Include relevant context"],
                "failure_modes": ["Invalid token", "Channel not found"],
            }
        )

        self.nodes["email"] = Mock(
            id="email",
            label="Email",
            description="Send emails",
            metadata={
                "type": "nodes-base.emailSend",
                "category": "communication",
                "keywords": ["email", "mail", "send"],
                "use_cases": ["Send notifications", "Send reports"],
                "prerequisites": ["SMTP server", "Credentials"],
                "agent_tips": ["Use templates for consistency"],
                "failure_modes": ["Invalid email", "SMTP error"],
            }
        )

        self.nodes["function"] = Mock(
            id="function",
            label="Function",
            description="Execute custom JavaScript",
            metadata={
                "type": "nodes-base.function",
                "category": "development",
                "keywords": ["function", "code", "javascript"],
                "use_cases": ["Transform data", "Complex logic"],
                "prerequisites": ["JavaScript knowledge"],
                "agent_tips": ["Keep functions focused", "Return valid JSON"],
                "failure_modes": ["Syntax error", "Runtime error"],
            }
        )

        # Create embeddings (random for testing)
        for node_id in self.nodes.keys():
            self.embeddings[node_id] = Mock(
                id=node_id,
                vector=np.random.randn(384)  # all-MiniLM-L6-v2 dimension
            )

    def get_nodes(self):
        return list(self.nodes.values())

    def get_node(self, node_id):
        return self.nodes.get(node_id)

    def get_embedding(self, node_id):
        return self.embeddings.get(node_id)

    def get_edges_from_node(self, node_id):
        return self.edges.get(f"{node_id}_out", [])

    def get_edges_to_node(self, node_id):
        return self.edges.get(f"{node_id}_in", [])

    def add_edge(self, source_id, target_id, edge_type, strength=1.0):
        """Add mock edge"""
        edge = Mock(
            id=f"{source_id}-{target_id}",
            source_id=source_id,
            target_id=target_id,
            type=edge_type,
            strength=strength
        )
        key_out = f"{source_id}_out"
        key_in = f"{target_id}_in"
        if key_out not in self.edges:
            self.edges[key_out] = []
        if key_in not in self.edges:
            self.edges[key_in] = []
        self.edges[key_out].append(edge)
        self.edges[key_in].append(edge)


# Tests for Semantic Search Engine
class TestSemanticSearchEngine:
    """Test semantic search functionality"""

    @pytest.fixture
    def setup(self):
        self.db = MockDatabase()
        self.engine = SemanticSearchEngine(self.db)

    @pytest.mark.asyncio
    async def test_semantic_search_success(self, setup):
        """Test semantic search with embedding"""
        # Create a query embedding similar to HTTP Request
        http_embedding = self.db.embeddings["http-request"].vector
        query_embedding = http_embedding + np.random.randn(384) * 0.1

        results = await self.engine.semantic_search(
            query_embedding,
            limit=3,
            min_confidence=0.3
        )

        assert len(results) > 0
        assert all(isinstance(r, SearchResult) for r in results)
        assert results[0].rank == 1

    @pytest.mark.asyncio
    async def test_keyword_search_success(self, setup):
        """Test keyword search"""
        results = await self.engine.keyword_search(
            "send message",
            limit=5
        )

        assert len(results) > 0
        assert all(isinstance(r, SearchResult) for r in results)

    @pytest.mark.asyncio
    async def test_search_with_category_filter(self, setup):
        """Test search with category filter"""
        results = await self.engine.keyword_search(
            "send",
            limit=5,
            category_filter="communication"
        )

        assert len(results) > 0
        assert all(r.category == "communication" for r in results)

    @pytest.mark.asyncio
    async def test_search_stats_updated(self, setup):
        """Test that search statistics are updated"""
        initial_count = self.engine.search_stats["total_searches"]

        await self.engine.keyword_search("test", limit=5)

        assert self.engine.search_stats["total_searches"] == initial_count + 1


# Tests for Graph Traversal Engine
class TestGraphTraversalEngine:
    """Test graph traversal functionality"""

    @pytest.fixture
    def setup(self):
        self.db = MockDatabase()
        # Add some edges for traversal
        self.db.add_edge("http-request", "slack", "COMPATIBLE_WITH", 0.9)
        self.db.add_edge("http-request", "function", "REQUIRES", 0.7)
        self.db.add_edge("function", "slack", "TRIGGERS", 0.8)
        self.engine = GraphTraversalEngine(self.db)

    @pytest.mark.asyncio
    async def test_shortest_path_found(self, setup):
        """Test finding shortest path"""
        path = await self.engine.find_shortest_path(
            "http-request",
            "slack",
            max_hops=5
        )

        assert path is not None
        assert path.nodes[0] == "http-request"
        assert path.nodes[-1] == "slack"
        assert path.length > 0

    @pytest.mark.asyncio
    async def test_find_all_paths(self, setup):
        """Test finding multiple paths"""
        paths = await self.engine.find_all_paths(
            "http-request",
            "slack",
            max_hops=4,
            max_paths=5
        )

        assert isinstance(paths, list)
        assert len(paths) > 0
        assert all(isinstance(p, Path) for p in paths)

    @pytest.mark.asyncio
    async def test_get_neighbors(self, setup):
        """Test getting neighbors"""
        neighbors = await self.engine.get_neighbors("http-request", depth=2)

        assert 0 in neighbors
        assert "http-request" in neighbors[0]

    @pytest.mark.asyncio
    async def test_circular_dependency_detection(self, setup):
        """Test circular dependency detection"""
        # No circular dependencies in this setup
        has_cycle = await self.engine.detect_circular_dependencies("http-request")

        assert has_cycle == False


# Tests for Explanation Generator
class TestExplanationGenerator:
    """Test explanation generation"""

    @pytest.fixture
    def setup(self):
        self.db = MockDatabase()
        self.generator = ExplanationGenerator(self.db)

    @pytest.mark.asyncio
    async def test_explain_search_result(self, setup):
        """Test search result explanation"""
        result = SearchResult(
            node_id="http-request",
            node_label="HTTP Request",
            node_type="nodes-base.httpRequest",
            category="network",
            description="Makes HTTP requests",
            confidence=0.9,
            similarity_score=0.85,
            relevance_score=0.0,
            rank=1,
            use_cases=["Call APIs", "Fetch data"],
            agent_tips=["Validate responses"],
            prerequisites=["API endpoint"],
            failure_modes=["Invalid URL"],
            related_nodes=["slack"],
            why_match="Semantic match",
            metadata={}
        )

        explanation = await self.generator.explain_search_result(result)

        assert explanation.type == ExplanationType.SEARCH_MATCH
        assert "HTTP Request" in explanation.summary
        assert explanation.confidence > 0
        assert len(explanation.reasoning_steps) > 0

    @pytest.mark.asyncio
    async def test_explain_path(self, setup):
        """Test path explanation"""
        path = Path(
            nodes=["http-request", "function", "slack"],
            edges=["e1", "e2"],
            length=2,
            total_strength=0.8,
            confidence=0.8,
            reasoning="Integration path"
        )

        explanation = await self.generator.explain_path(
            path,
            self.db.get_node("http-request"),
            self.db.get_node("slack")
        )

        assert explanation.type == ExplanationType.PATH_CONNECTION
        assert "HTTP Request" in explanation.summary
        assert "Slack" in explanation.summary
        assert len(explanation.next_steps) > 0

    @pytest.mark.asyncio
    async def test_explain_alternatives(self, setup):
        """Test alternative explanation"""
        explanation = await self.generator.explain_alternatives(
            "slack",
            ["email"]
        )

        assert explanation.type == ExplanationType.ALTERNATIVE
        assert "Slack" in explanation.summary or "Slack" in explanation.detailed


# Tests for Response Formatter
class TestResponseFormatter:
    """Test response formatting"""

    @pytest.fixture
    def setup(self):
        self.formatter = ResponseFormatter()

    @pytest.mark.asyncio
    async def test_format_search_response_json(self, setup):
        """Test formatting search response as JSON"""
        results = [
            SearchResult(
                node_id="http-request",
                node_label="HTTP Request",
                node_type="nodes-base.httpRequest",
                category="network",
                description="Makes HTTP requests",
                confidence=0.9,
                similarity_score=0.85,
                relevance_score=0.0,
                rank=1,
                use_cases=["Call APIs"],
                agent_tips=["Validate"],
                prerequisites=["Endpoint"],
                failure_modes=["Invalid URL"],
                related_nodes=[],
                why_match="Match",
                metadata={}
            )
        ]

        response = await self.formatter.format_search_response(
            "test-query",
            "test",
            results,
            format_type=ResponseFormat.JSON
        )

        assert isinstance(response, str)
        parsed = json.loads(response)
        assert parsed["status"] == "success"
        assert len(parsed["results"]) == 1

    @pytest.mark.asyncio
    async def test_format_search_response_markdown(self, setup):
        """Test formatting search response as markdown"""
        results = [
            SearchResult(
                node_id="http-request",
                node_label="HTTP Request",
                node_type="nodes-base.httpRequest",
                category="network",
                description="Makes HTTP requests",
                confidence=0.9,
                similarity_score=0.85,
                relevance_score=0.0,
                rank=1,
                use_cases=["Call APIs"],
                agent_tips=["Validate"],
                prerequisites=["Endpoint"],
                failure_modes=["Invalid URL"],
                related_nodes=[],
                why_match="Match",
                metadata={}
            )
        ]

        response = await self.formatter.format_search_response(
            "test-query",
            "test",
            results,
            format_type=ResponseFormat.MARKDOWN
        )

        assert isinstance(response, str)
        assert "HTTP Request" in response
        assert "Search Results" in response


# Tests for Query Engine
class TestQueryEngine:
    """Test query engine orchestration"""

    @pytest.fixture
    def setup(self):
        self.db = MockDatabase()
        self.engine = QueryEngine(self.db)

    @pytest.mark.asyncio
    async def test_search_query(self, setup):
        """Test search query"""
        response = await self.engine.query(
            "http request to api",
            query_type=QueryType.SEARCH,
            response_format=ResponseFormat.COMPACT
        )

        assert isinstance(response, (str, dict))

    @pytest.mark.asyncio
    async def test_suggest_query(self, setup):
        """Test suggestion query"""
        response = await self.engine.query(
            "slack",
            query_type=QueryType.SUGGEST,
            response_format=ResponseFormat.COMPACT
        )

        assert isinstance(response, (str, dict))

    @pytest.mark.asyncio
    async def test_query_stats_updated(self, setup):
        """Test query stats"""
        initial = self.engine.query_stats["total_queries"]

        await self.engine.query("test", query_type=QueryType.SEARCH)

        assert self.engine.query_stats["total_queries"] == initial + 1


# Test Runner
async def run_all_tests():
    """Run all tests"""
    print("\n" + "=" * 80)
    print("PHASE 5.3 - QUERY ENGINE TESTS")
    print("=" * 80 + "\n")

    tests = [
        ("Semantic Search Engine", [
            ("Semantic search with embedding", TestSemanticSearchEngine.test_semantic_search_success),
            ("Keyword search", TestSemanticSearchEngine.test_keyword_search_success),
            ("Search with category filter", TestSemanticSearchEngine.test_search_with_category_filter),
            ("Search stats updated", TestSemanticSearchEngine.test_search_stats_updated),
        ]),
        ("Graph Traversal Engine", [
            ("Shortest path finding", TestGraphTraversalEngine.test_shortest_path_found),
            ("Multiple paths finding", TestGraphTraversalEngine.test_find_all_paths),
            ("Get neighbors", TestGraphTraversalEngine.test_get_neighbors),
            ("Circular dependency detection", TestGraphTraversalEngine.test_circular_dependency_detection),
        ]),
        ("Explanation Generator", [
            ("Search result explanation", TestExplanationGenerator.test_explain_search_result),
            ("Path explanation", TestExplanationGenerator.test_explain_path),
            ("Alternative explanation", TestExplanationGenerator.test_explain_alternatives),
        ]),
        ("Response Formatter", [
            ("Format search response (JSON)", TestResponseFormatter.test_format_search_response_json),
            ("Format search response (Markdown)", TestResponseFormatter.test_format_search_response_markdown),
        ]),
        ("Query Engine", [
            ("Search query", TestQueryEngine.test_search_query),
            ("Suggestion query", TestQueryEngine.test_suggest_query),
            ("Query stats", TestQueryEngine.test_query_stats_updated),
        ]),
    ]

    total_tests = sum(len(test_list) for _, test_list in tests)
    passed_tests = 0

    for category, test_list in tests:
        print(f"\n{category}:")
        print("-" * 80)

        for test_name, test_func in test_list:
            try:
                # Setup
                test_instance = test_func.__self__.__class__()
                setup_method = getattr(test_instance, "setup", None)
                if setup_method:
                    setup_method()

                # Run test
                await test_func(test_instance)
                print(f"✅ {test_name}")
                passed_tests += 1

            except Exception as e:
                print(f"❌ {test_name}: {e}")

    print(f"\n{'=' * 80}")
    print(f"Test Results: {passed_tests}/{total_tests} passed")
    print(f"{'=' * 80}\n")

    return passed_tests == total_tests


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    exit(0 if success else 1)
