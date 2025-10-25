"""
Agentic Entity Extractor
Extract n8n nodes with agent-friendly metadata
"""

import sqlite3
import json
import re
import logging
from typing import List, Dict, Optional, Set
from dataclasses import dataclass, field, asdict
from pathlib import Path
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class AgenticNode:
    """
    Enhanced node model optimized for agent reasoning
    Includes agent use cases, failure modes, and tips
    """
    # Basic identification
    id: str
    label: str
    description: Optional[str] = None

    # Agent-relevant categorization
    category: Optional[str] = None
    keywords: List[str] = field(default_factory=list)

    # Agent use cases
    use_cases: List[str] = field(default_factory=list)

    # Agent prerequisites
    prerequisites: List[str] = field(default_factory=list)

    # Agent guidance
    agent_tips: List[str] = field(default_factory=list)
    failure_modes: List[str] = field(default_factory=list)

    # Common configurations for agents
    common_configurations: Dict[str, Dict] = field(default_factory=dict)

    # Properties and operations
    properties: List[str] = field(default_factory=list)
    operations: List[str] = field(default_factory=list)

    # Success metrics
    success_rate: float = 0.85
    usage_frequency: int = 0
    average_rating: float = 4.0

    # Complexity for agents
    complexity: str = "medium"  # simple, medium, complex
    learning_curve: str = "medium"  # easy, medium, hard

    # Node type info
    node_type: str = "node"  # node, pattern, use_case, category
    version: str = "1.0"

    # Metadata
    metadata: Dict = field(default_factory=dict)

    def to_dict(self) -> Dict:
        """Convert to dictionary for storage"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict) -> 'AgenticNode':
        """Create from dictionary"""
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


class AgenticEntityExtractor:
    """
    Extract n8n nodes from database with agent-friendly metadata
    Focuses on what agents need to know, not just what's in documentation
    """

    # Common categories for n8n nodes
    CATEGORIES = {
        'Communication': ['slack', 'email', 'discord', 'telegram', 'teams', 'webhook', 'http'],
        'Data': ['set', 'merge', 'sort', 'filter', 'extract', 'transform', 'function'],
        'Database': ['postgres', 'mysql', 'mongodb', 'redis', 'sql', 'database'],
        'Triggers': ['schedule', 'webhook', 'email trigger', 'http', 'cron', 'interval'],
        'File Operations': ['file', 'upload', 'download', 's3', 'ftp', 'sftp'],
        'API': ['http', 'rest', 'api', 'oauth', 'authenticate', 'request'],
        'Cloud Services': ['aws', 'azure', 'google', 'dropbox', 'gdrive'],
        'Workflow Control': ['switch', 'loop', 'condition', 'wait', 'if', 'while'],
        'AI/ML': ['openai', 'huggingface', 'nlp', 'ml', 'ai', 'llm'],
        'Social Media': ['twitter', 'facebook', 'linkedin', 'instagram', 'youtube'],
        'CRM': ['salesforce', 'crm', 'hubspot', 'pipedrive', 'customer'],
        'Analytics': ['analytics', 'segment', 'mixpanel', 'amplitude', 'tracking'],
    }

    # Common use cases by node type
    USE_CASE_KEYWORDS = {
        'slack': [
            'Send notifications to team',
            'Alert on workflow errors',
            'Post daily reports',
            'Share metrics and dashboards',
            'Update team channels'
        ],
        'http': [
            'Fetch data from external APIs',
            'Make REST API calls',
            'Poll external services',
            'Integrate with third-party systems',
            'Send data to webhooks'
        ],
        'schedule': [
            'Run workflows on schedule',
            'Execute periodic tasks',
            'Trigger workflows daily/hourly',
            'Set up recurring automation',
            'Schedule background jobs'
        ],
        'database': [
            'Store workflow data',
            'Query historical information',
            'Log execution results',
            'Fetch configuration data',
            'Archive old data'
        ],
        'email': [
            'Send email notifications',
            'Generate email reports',
            'Email team updates',
            'Send alerts via email',
            'Deliver automation results'
        ],
    }

    # Agent tips by node type
    AGENT_TIPS = {
        'slack': [
            'Use blocks for rich formatting',
            'Set channel OR channel_id, not both',
            'Test with @channel first before production',
            'Slack has rate limits - batch messages if sending many',
            'Use thread_ts to send to specific threads'
        ],
        'http': [
            'Check authentication method (basic, oauth, api key)',
            'Set correct Content-Type header',
            'Test endpoint before using in workflow',
            'Handle rate limiting with appropriate delays',
            'Use authentication presets for common services'
        ],
        'set': [
            'Use dot notation to access nested properties',
            'Combine multiple fields in one Set node when possible',
            'Remember to escape special characters in JSON',
            'Use expressions for dynamic values',
            'Test your JSON structure before deployment'
        ],
        'schedule': [
            'Cron format: minute hour day month dayofweek',
            'Use simple intervals for testing',
            'Remember timezone settings',
            'Test schedule with dry run first',
            'Monitor execution history for timing issues'
        ],
    }

    # Common failure modes by node type
    FAILURE_MODES = {
        'slack': [
            'Channel not found or not in workspace',
            'Authentication token invalid or expired',
            'Message format invalid (missing blocks, etc)',
            'Rate limited by Slack API',
            'Insufficient permissions for channel'
        ],
        'http': [
            'SSL/TLS certificate validation failed',
            'Timeout waiting for response',
            'Authentication credentials wrong',
            'Rate limited by API',
            'Endpoint returns unexpected format'
        ],
        'set': [
            'Trying to access non-existent properties',
            'Type mismatch (string vs number)',
            'Malformed JSON syntax',
            'Missing required fields',
            'Circular references in data'
        ],
    }

    def __init__(self, nodes_db_path: str):
        """
        Initialize entity extractor

        Args:
            nodes_db_path: Path to n8n nodes database (nodes.db)
        """
        self.nodes_db_path = Path(nodes_db_path)
        self.nodes_db = None

    def extract_all_nodes(self) -> List[AgenticNode]:
        """Extract all n8n nodes with agent-friendly metadata"""
        try:
            logger.info(f"Extracting nodes from {self.nodes_db_path}")

            # Connect to n8n database
            if not self.nodes_db_path.exists():
                logger.warning(f"Database not found at {self.nodes_db_path}, returning empty list")
                return []

            conn = sqlite3.connect(str(self.nodes_db_path))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # Query all nodes
            cursor.execute("""
                SELECT * FROM nodes
                ORDER BY label ASC
            """)
            rows = cursor.fetchall()
            conn.close()

            nodes = []
            for row in rows:
                node_dict = dict(row)
                agentic_node = self._enrich_node(node_dict)
                nodes.append(agentic_node)

                if len(nodes) % 50 == 0:
                    logger.info(f"Extracted {len(nodes)} nodes...")

            logger.info(f"Successfully extracted {len(nodes)} nodes")
            return nodes

        except Exception as e:
            logger.error(f"Failed to extract nodes: {e}")
            return []

    def _enrich_node(self, node_data: Dict) -> AgenticNode:
        """
        Enrich node data with agent-friendly metadata

        Args:
            node_data: Raw node data from database

        Returns:
            AgenticNode with enriched metadata
        """
        node_id = node_data.get('id', '')
        label = node_data.get('label', node_id)
        description = node_data.get('description', '')

        # Extract basic info
        agentic_node = AgenticNode(
            id=node_id,
            label=label,
            description=description,
            category=self._categorize_node(node_id, label, description),
            keywords=self._extract_keywords(node_id, label, description),
            use_cases=self._extract_use_cases(node_id, description),
            prerequisites=self._extract_prerequisites(node_id, label),
            agent_tips=self._get_agent_tips(node_id),
            failure_modes=self._get_failure_modes(node_id),
            common_configurations=self._get_common_configurations(node_id),
            complexity=self._determine_complexity(description),
            learning_curve=self._determine_learning_curve(description),
            properties=self._extract_properties(node_data),
            operations=self._extract_operations(node_data),
            success_rate=self._estimate_success_rate(node_id),
            usage_frequency=self._estimate_usage_frequency(node_id),
            average_rating=self._estimate_rating(node_id),
            metadata=node_data.get('metadata', {})
        )

        return agentic_node

    def _categorize_node(self, node_id: str, label: str, description: str) -> str:
        """Determine node category"""
        combined_text = f"{node_id} {label} {description}".lower()

        for category, keywords in self.CATEGORIES.items():
            if any(kw in combined_text for kw in keywords):
                return category

        return "Other"

    def _extract_keywords(self, node_id: str, label: str, description: str) -> List[str]:
        """Extract keywords from node information"""
        keywords = set()

        # Add label as keyword
        keywords.add(label.lower())

        # Extract from description
        if description:
            # Split by common separators
            words = re.split(r'[\s,;:\-\(\)\[\]\.]+', description.lower())
            # Keep meaningful words (>3 chars)
            words = [w for w in words if len(w) > 3 and w not in ['the', 'and', 'with', 'from', 'that', 'this', 'for', 'your']]
            keywords.update(words[:10])  # Limit to 10

        # Add node-specific keywords
        node_type = node_id.split('.')[-1].lower()
        keywords.add(node_type)

        return sorted(list(keywords))[:15]  # Limit to 15 keywords

    def _extract_use_cases(self, node_id: str, description: str) -> List[str]:
        """Extract use cases agents care about"""
        use_cases = []

        # Check predefined use cases
        for node_type, cases in self.USE_CASE_KEYWORDS.items():
            if node_type in node_id.lower():
                use_cases.extend(cases)
                break

        # If no predefined, generate from description
        if not use_cases and description:
            use_cases = [
                f"Use for {description.split('.')[0].strip()}",
                f"Integrate with workflows needing {node_id.split('.')[-1]}"
            ]

        return use_cases[:5]  # Limit to 5 use cases

    def _extract_prerequisites(self, node_id: str, label: str) -> List[str]:
        """Extract prerequisites agents need to know"""
        prerequisites = []

        node_type = node_id.lower()

        # Add generic prerequisites
        if any(auth in node_type for auth in ['slack', 'email', 'discord', 'teams', 'github', 'stripe']):
            prerequisites.append("Must authenticate with service")
            prerequisites.append("Need valid API credentials")

        if 'http' in node_type or 'api' in node_type:
            prerequisites.append("Understand REST API concepts")
            prerequisites.append("May need authentication token")

        if 'database' in node_type or 'sql' in node_type:
            prerequisites.append("Understand database structure")
            prerequisites.append("Have database credentials")

        if 'schedule' in node_type or 'cron' in node_type:
            prerequisites.append("Understand cron syntax or intervals")
            prerequisites.append("Know your timezone")

        return prerequisites[:4]  # Limit to 4 prerequisites

    def _get_agent_tips(self, node_id: str) -> List[str]:
        """Get agent tips for this node"""
        node_type = node_id.split('.')[-1].lower()

        # Check for predefined tips
        for key, tips in self.AGENT_TIPS.items():
            if key in node_type:
                return tips[:3]  # Return top 3 tips

        # Default tips
        return [
            f"Test {node_type} configuration before production use",
            f"Check {node_type} documentation for all options",
            f"Monitor {node_type} logs for debugging"
        ]

    def _get_failure_modes(self, node_id: str) -> List[str]:
        """Get common failure modes for this node"""
        node_type = node_id.split('.')[-1].lower()

        # Check for predefined failure modes
        for key, modes in self.FAILURE_MODES.items():
            if key in node_type:
                return modes[:3]  # Return top 3 failure modes

        # Default failure modes
        return [
            f"Configuration missing required fields",
            f"Upstream data format unexpected",
            f"External service unavailable"
        ]

    def _get_common_configurations(self, node_id: str) -> Dict[str, Dict]:
        """Get common configurations agents use"""
        configs = {}

        node_type = node_id.split('.')[-1].lower()

        # Slack common configs
        if 'slack' in node_type:
            configs['notification'] = {
                'channel': '#alerts',
                'text': 'Notification from workflow'
            }
            configs['report'] = {
                'channel': '#reports',
                'text': 'Daily Report'
            }

        # HTTP common configs
        elif 'http' in node_type:
            configs['get_request'] = {
                'method': 'GET',
                'url': 'https://api.example.com/data'
            }
            configs['post_request'] = {
                'method': 'POST',
                'url': 'https://api.example.com/data',
                'body_type': 'JSON'
            }

        # Schedule common configs
        elif 'schedule' in node_type:
            configs['daily_9am'] = {
                'mode': 'Cron',
                'cron': '0 9 * * *'
            }
            configs['every_hour'] = {
                'mode': 'Every Hour',
                'interval': 60
            }

        return configs

    def _determine_complexity(self, description: str) -> str:
        """Determine node complexity level"""
        if not description:
            return "medium"

        word_count = len(description.split())

        if word_count < 20:
            return "simple"
        elif word_count < 50:
            return "medium"
        else:
            return "complex"

    def _determine_learning_curve(self, description: str) -> str:
        """Determine learning curve"""
        if not description:
            return "medium"

        complex_keywords = ['condition', 'advanced', 'complex', 'transform', 'aggregate']
        easy_keywords = ['send', 'get', 'fetch', 'trigger', 'simple']

        desc_lower = description.lower()

        if any(kw in desc_lower for kw in easy_keywords):
            return "easy"
        elif any(kw in desc_lower for kw in complex_keywords):
            return "hard"
        else:
            return "medium"

    def _extract_properties(self, node_data: Dict) -> List[str]:
        """Extract property names from node"""
        properties = []

        try:
            if 'properties' in node_data and node_data['properties']:
                props = json.loads(node_data['properties']) if isinstance(node_data['properties'], str) else node_data['properties']
                if isinstance(props, dict):
                    properties = list(props.keys())[:10]  # Limit to 10
        except:
            pass

        return properties

    def _extract_operations(self, node_data: Dict) -> List[str]:
        """Extract operations from node"""
        operations = []

        try:
            if 'operations' in node_data and node_data['operations']:
                ops = json.loads(node_data['operations']) if isinstance(node_data['operations'], str) else node_data['operations']
                if isinstance(ops, (list, dict)):
                    operations = ops if isinstance(ops, list) else list(ops.keys())
                    operations = operations[:10]  # Limit to 10
        except:
            pass

        return operations

    def _estimate_success_rate(self, node_id: str) -> float:
        """Estimate success rate based on node type"""
        # Common nodes have high success rates
        common_nodes = ['slack', 'email', 'set', 'webhook', 'http', 'filter']
        if any(cn in node_id.lower() for cn in common_nodes):
            return 0.95

        # Most nodes have decent success rates
        return 0.85

    def _estimate_usage_frequency(self, node_id: str) -> int:
        """Estimate how often this node is used"""
        # Common nodes used more frequently
        usage_map = {
            'set': 1000,
            'webhook': 800,
            'http': 750,
            'switch': 600,
            'slack': 500,
            'email': 400,
            'schedule': 350,
            'filter': 300,
        }

        for key, count in usage_map.items():
            if key in node_id.lower():
                return count

        return 100  # Default for unknown nodes

    def _estimate_rating(self, node_id: str) -> float:
        """Estimate average rating based on node type"""
        # Popular, reliable nodes have higher ratings
        high_rated = ['slack', 'email', 'http', 'set', 'webhook']
        if any(hr in node_id.lower() for hr in high_rated):
            return 4.7

        # Most nodes have decent ratings
        return 4.2

    def save_to_json(self, nodes: List[AgenticNode], output_path: str) -> bool:
        """Save extracted nodes to JSON"""
        try:
            data = [node.to_dict() for node in nodes]
            with open(output_path, 'w') as f:
                json.dump(data, f, indent=2, default=str)
            logger.info(f"Saved {len(nodes)} nodes to {output_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to save nodes: {e}")
            return False
