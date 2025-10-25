"""
Agentic Relationship Builder
Build relationships between nodes that support agent planning
"""

import logging
import json
from typing import List, Dict, Optional, Tuple, Set
from dataclasses import dataclass, field, asdict
from enum import Enum
import re

logger = logging.getLogger(__name__)


class RelationshipType(str, Enum):
    """Types of relationships between nodes"""
    COMPATIBLE_WITH = "compatible_with"
    BELONGS_TO_CATEGORY = "belongs_to_category"
    USED_IN_PATTERN = "used_in_pattern"
    SOLVES = "solves"
    REQUIRES = "requires"
    TRIGGERED_BY = "triggered_by"
    SIMILAR_TO = "similar_to"


@dataclass
class AgenticEdge:
    """
    Relationship between nodes optimized for agent reasoning
    Includes reasoning, success rates, and guidance
    """
    # Basic identification
    id: str
    source_id: str
    target_id: str
    type: RelationshipType

    # Relationship strength
    strength: float = 1.0

    # Agent reasoning
    reasoning: str = ""

    # Success metrics
    success_rate: float = 0.85
    common_pattern: str = ""

    # Data flow help
    common_config_mapping: Dict = field(default_factory=dict)

    # Agent gotchas
    gotchas: List[str] = field(default_factory=list)

    # Agent guidance
    agent_guidance: str = ""

    # Metadata
    metadata: Dict = field(default_factory=dict)

    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        data = asdict(self)
        data['type'] = self.type.value
        return data

    @classmethod
    def from_dict(cls, data: Dict) -> 'AgenticEdge':
        """Create from dictionary"""
        data_copy = data.copy()
        if isinstance(data_copy.get('type'), str):
            data_copy['type'] = RelationshipType(data_copy['type'])
        return cls(**{k: v for k, v in data_copy.items() if k in cls.__dataclass_fields__})


class AgenticRelationshipBuilder:
    """
    Build relationships between nodes with agent reasoning
    Creates connections that help agents plan workflows
    """

    # Common workflow patterns showing node relationships
    WORKFLOW_PATTERNS = {
        'Slack Notification': {
            'nodes': ['webhook', 'set', 'slack'],
            'description': 'Trigger on event, format message, send to Slack',
            'success_rate': 0.98
        },
        'API Health Monitor': {
            'nodes': ['schedule', 'http', 'switch', 'slack'],
            'description': 'Check API periodically, alert if down',
            'success_rate': 0.95
        },
        'Data Sync': {
            'nodes': ['schedule', 'http', 'set', 'database'],
            'description': 'Fetch data, transform, store in database',
            'success_rate': 0.92
        },
        'Email Report': {
            'nodes': ['schedule', 'database', 'set', 'email'],
            'description': 'Query database, format report, send email',
            'success_rate': 0.90
        },
        'Error Alert': {
            'nodes': ['error handler', 'set', 'slack', 'email'],
            'description': 'Catch errors, format, notify team',
            'success_rate': 0.96
        },
        'Webhook to Slack': {
            'nodes': ['webhook', 'set', 'slack'],
            'description': 'Receive webhook, transform, post to Slack',
            'success_rate': 0.97
        },
        'Data Transform': {
            'nodes': ['set', 'filter', 'merge', 'set'],
            'description': 'Transform data through multiple steps',
            'success_rate': 0.88
        },
        'CRM Sync': {
            'nodes': ['http', 'set', 'database', 'http'],
            'description': 'Fetch CRM data, enrich, sync back',
            'success_rate': 0.85
        },
    }

    # Node relationships that commonly work together
    COMPATIBLE_PAIRS = {
        ('http', 'set'): {
            'strength': 0.95,
            'reasoning': 'HTTP response needs formatting before use',
            'mapping': 'Parse JSON from HTTP into variables'
        },
        ('set', 'slack'): {
            'strength': 0.94,
            'reasoning': 'Set node prepares data, Slack sends it',
            'mapping': 'Set creates message, Slack sends to channel'
        },
        ('http', 'slack'): {
            'strength': 0.92,
            'reasoning': 'Can directly send HTTP response to Slack',
            'mapping': 'HTTP response becomes Slack message'
        },
        ('schedule', 'http'): {
            'strength': 0.93,
            'reasoning': 'Schedule triggers HTTP requests periodically',
            'mapping': 'Schedule determines frequency, HTTP makes call'
        },
        ('webhook', 'set'): {
            'strength': 0.90,
            'reasoning': 'Webhook triggers, Set prepares data',
            'mapping': 'Webhook payload transformed by Set'
        },
        ('database', 'set'): {
            'strength': 0.92,
            'reasoning': 'Query database, format results',
            'mapping': 'Database rows formatted by Set'
        },
        ('set', 'email'): {
            'strength': 0.91,
            'reasoning': 'Format data, send via email',
            'mapping': 'Set creates email content'
        },
        ('filter', 'set'): {
            'strength': 0.89,
            'reasoning': 'Filter data, then format',
            'mapping': 'Filtered items processed by Set'
        },
    }

    # Gotchas for common pairs
    PAIR_GOTCHAS = {
        ('http', 'set'): [
            'Response might be nested, need to navigate',
            'JSON might be string-escaped',
            'Large responses might timeout'
        ],
        ('set', 'slack'): [
            'Slack expects specific format for blocks',
            'Character limit for message text',
            'Special characters might break formatting'
        ],
        ('schedule', 'http'): [
            'Rate limits if scheduling too frequently',
            'Timezone affects schedule execution',
            'HTTP timeout affects workflow'
        ],
        ('webhook', 'set'): [
            'Webhook payload structure varies by service',
            'Need to handle missing fields',
            'Payload might be multipart'
        ],
    }

    def __init__(self):
        """Initialize relationship builder"""
        self.relationships: Dict[str, AgenticEdge] = {}

    def build_relationships(self, nodes: List) -> List[AgenticEdge]:
        """
        Build all relationships between nodes

        Args:
            nodes: List of AgenticNode objects

        Returns:
            List of AgenticEdge objects
        """
        logger.info("Building relationships between nodes...")

        # Get node IDs for quick lookup
        node_ids = {node.id for node in nodes}
        node_map = {node.id: node for node in nodes}
        node_categories = {node.id: node.category for node in nodes}

        edges = []
        edge_id_counter = 0

        # 1. Category relationships
        logger.info("Building category relationships...")
        category_edges = self._build_category_relationships(nodes)
        edges.extend(category_edges)
        logger.info(f"  Added {len(category_edges)} category relationships")
        edge_id_counter += len(category_edges)

        # 2. Compatible pairs
        logger.info("Building compatibility relationships...")
        compatible_edges = self._build_compatibility_relationships(nodes)
        edges.extend(compatible_edges)
        logger.info(f"  Added {len(compatible_edges)} compatibility relationships")
        edge_id_counter += len(compatible_edges)

        # 3. Pattern relationships
        logger.info("Building pattern relationships...")
        pattern_edges = self._build_pattern_relationships(nodes)
        edges.extend(pattern_edges)
        logger.info(f"  Added {len(pattern_edges)} pattern relationships")
        edge_id_counter += len(pattern_edges)

        # 4. Similarity relationships
        logger.info("Building similarity relationships...")
        similar_edges = self._build_similarity_relationships(nodes)
        edges.extend(similar_edges)
        logger.info(f"  Added {len(similar_edges)} similarity relationships")

        logger.info(f"Successfully built {len(edges)} total relationships")
        return edges

    def _build_category_relationships(self, nodes: List) -> List[AgenticEdge]:
        """Build belongs_to_category relationships"""
        edges = []
        categories = {}

        # Group nodes by category
        for node in nodes:
            if node.category:
                if node.category not in categories:
                    categories[node.category] = []
                categories[node.category].append(node)

        # Create category relationships
        edge_id = 0
        for category, category_nodes in categories.items():
            # Create a "virtual" category node
            category_id = f"category-{category.lower().replace(' ', '-')}"

            for node in category_nodes:
                edge = AgenticEdge(
                    id=f"edge-category-{edge_id}",
                    source_id=node.id,
                    target_id=category_id,
                    type=RelationshipType.BELONGS_TO_CATEGORY,
                    strength=1.0,
                    reasoning=f"{node.label} is a {category} node",
                    success_rate=1.0,
                    common_pattern=f"All {category} nodes share common characteristics",
                    agent_guidance=f"This node belongs to the {category} category"
                )
                edges.append(edge)
                edge_id += 1

        return edges

    def _build_compatibility_relationships(self, nodes: List) -> List[AgenticEdge]:
        """Build compatible_with relationships"""
        edges = []
        node_map = {node.id: node for node in nodes}
        edge_id = 0

        for source in nodes:
            for target in nodes:
                if source.id == target.id:
                    continue

                # Check if this pair is in our known pairs
                source_type = source.id.split('.')[-1].lower()
                target_type = target.id.split('.')[-1].lower()

                for (s_type, t_type), info in self.COMPATIBLE_PAIRS.items():
                    if (s_type in source_type and t_type in target_type) or \
                       (s_type in source.label.lower() and t_type in target.label.lower()):

                        edge = AgenticEdge(
                            id=f"edge-compat-{edge_id}",
                            source_id=source.id,
                            target_id=target.id,
                            type=RelationshipType.COMPATIBLE_WITH,
                            strength=info.get('strength', 0.8),
                            reasoning=info.get('reasoning', ''),
                            success_rate=info.get('success_rate', 0.85),
                            common_pattern=f"{source.label} → {target.label}",
                            common_config_mapping={
                                'from': f'{source.label} output',
                                'to': f'{target.label} input',
                                'example': info.get('mapping', '')
                            },
                            gotchas=self.PAIR_GOTCHAS.get((s_type, t_type), []),
                            agent_guidance=f"Use {target.label} after {source.label} to continue workflow"
                        )
                        edges.append(edge)
                        edge_id += 1

        return edges

    def _build_pattern_relationships(self, nodes: List) -> List[AgenticEdge]:
        """Build used_in_pattern relationships"""
        edges = []
        node_map = {node.id.lower(): node for node in nodes}
        edge_id = 0

        for pattern_name, pattern_info in self.WORKFLOW_PATTERNS.items():
            pattern_id = f"pattern-{pattern_name.lower().replace(' ', '-')}"

            # Find nodes matching this pattern
            for node_type in pattern_info['nodes']:
                for node in nodes:
                    if node_type in node.id.lower() or node_type in node.label.lower():
                        edge = AgenticEdge(
                            id=f"edge-pattern-{edge_id}",
                            source_id=node.id,
                            target_id=pattern_id,
                            type=RelationshipType.USED_IN_PATTERN,
                            strength=0.9,
                            reasoning=f"{node.label} is used in {pattern_name} workflow",
                            success_rate=pattern_info.get('success_rate', 0.85),
                            common_pattern=pattern_name,
                            agent_guidance=f"This node is commonly used in {pattern_name} workflows"
                        )
                        edges.append(edge)
                        edge_id += 1

        return edges

    def _build_similarity_relationships(self, nodes: List) -> List[AgenticEdge]:
        """Build similar_to relationships based on functionality"""
        edges = []
        edge_id = 0

        # Similarity groups
        similarity_groups = {
            'Communication': ['slack', 'email', 'discord', 'telegram', 'teams'],
            'HTTP': ['http', 'webhook', 'rest', 'api'],
            'Database': ['database', 'postgres', 'mysql', 'mongodb', 'sql'],
            'Storage': ['s3', 'ftp', 'sftp', 'dropbox', 'storage'],
        }

        node_map = {node.id.lower(): node for node in nodes}

        for group_name, keywords in similarity_groups.items():
            # Find nodes in this group
            group_nodes = []
            for node in nodes:
                node_id_lower = node.id.lower()
                if any(kw in node_id_lower or kw in node.label.lower() for kw in keywords):
                    group_nodes.append(node)

            # Create similarity relationships within group
            for i, source in enumerate(group_nodes):
                for target in group_nodes[i+1:]:
                    edge = AgenticEdge(
                        id=f"edge-similar-{edge_id}",
                        source_id=source.id,
                        target_id=target.id,
                        type=RelationshipType.SIMILAR_TO,
                        strength=0.8,
                        reasoning=f"{source.label} and {target.label} provide similar functionality",
                        success_rate=0.7,
                        common_pattern=f"Alternative to {group_name}",
                        agent_guidance=f"Consider {target.label} as an alternative to {source.label}"
                    )
                    edges.append(edge)
                    edge_id += 1

        return edges

    def calculate_compatibility_strength(
        self,
        source_node,
        target_node,
        existing_workflows: List[Dict] = None
    ) -> float:
        """
        Calculate compatibility strength between nodes

        Args:
            source_node: Source node
            target_node: Target node
            existing_workflows: Optional list of existing workflows for analysis

        Returns:
            Strength score 0-1
        """
        strength = 0.5  # Base strength

        # Check if they're in known compatible pairs
        source_type = source_node.id.split('.')[-1].lower()
        target_type = target_node.id.split('.')[-1].lower()

        for (s_type, t_type), info in self.COMPATIBLE_PAIRS.items():
            if (s_type in source_type and t_type in target_type):
                strength = info.get('strength', 0.8)
                break

        # If we have workflow data, adjust based on actual usage
        if existing_workflows:
            usage_count = sum(
                1 for wf in existing_workflows
                if source_node.id in str(wf) and target_node.id in str(wf)
            )
            if usage_count > 0:
                strength = min(1.0, strength + 0.1)

        return strength

    def extract_gotchas(self, source_node, target_node) -> List[str]:
        """Get common gotchas for node pair"""
        source_type = source_node.id.split('.')[-1].lower()
        target_type = target_node.id.split('.')[-1].lower()

        return self.PAIR_GOTCHAS.get((source_type, target_type), [
            f"Test {source_node.label} → {target_node.label} sequence",
            f"Verify data types match between nodes",
            f"Check {target_node.label} prerequisites"
        ])

    def save_to_json(self, edges: List[AgenticEdge], output_path: str) -> bool:
        """Save relationships to JSON"""
        try:
            data = [edge.to_dict() for edge in edges]
            with open(output_path, 'w') as f:
                json.dump(data, f, indent=2, default=str)
            logger.info(f"Saved {len(edges)} relationships to {output_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to save relationships: {e}")
            return False
