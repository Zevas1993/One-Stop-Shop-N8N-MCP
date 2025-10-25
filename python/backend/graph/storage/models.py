"""
ORM Models for GraphRAG Storage
Data classes representing entities in the knowledge graph
"""

from dataclasses import dataclass, field, asdict
from typing import Optional, List, Dict, Any
from datetime import datetime
import json
import numpy as np
from enum import Enum


class RelationshipType(str, Enum):
    """Types of relationships between nodes"""
    COMPATIBLE_WITH = "compatible_with"
    BELONGS_TO_CATEGORY = "belongs_to_category"
    USED_IN_PATTERN = "used_in_pattern"
    SOLVES = "solves"
    REQUIRES = "requires"
    TRIGGERED_BY = "triggered_by"
    SIMILAR_TO = "similar_to"


class EntityType(str, Enum):
    """Types of entities in the graph"""
    NODE = "node"
    PATTERN = "pattern"
    USE_CASE = "use_case"
    CATEGORY = "category"
    TRIGGER = "trigger"


class QueryType(str, Enum):
    """Types of queries supported"""
    SEMANTIC_SEARCH = "semantic_search"
    PATTERN_MATCH = "pattern_match"
    RELATIONSHIP_TRAVERSAL = "relationship_traversal"
    KEYWORD_SEARCH = "keyword_search"
    CATEGORY_SEARCH = "category_search"


@dataclass
class Node:
    """Represents an entity (node) in the knowledge graph"""
    id: str
    label: str
    description: Optional[str] = None
    category: Optional[str] = None
    keywords: List[str] = field(default_factory=list)
    embedding: Optional[np.ndarray] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: Optional[int] = None
    updated_at: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage"""
        return {
            'id': self.id,
            'label': self.label,
            'description': self.description,
            'category': self.category,
            'keywords': json.dumps(self.keywords) if self.keywords else None,
            'embedding': self.embedding.tobytes() if self.embedding is not None else None,
            'metadata': json.dumps(self.metadata) if self.metadata else None,
            'created_at': self.created_at or int(datetime.now().timestamp()),
            'updated_at': self.updated_at or int(datetime.now().timestamp()),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Node':
        """Create Node from dictionary"""
        keywords = json.loads(data.get('keywords', '[]')) if data.get('keywords') else []
        metadata = json.loads(data.get('metadata', '{}')) if data.get('metadata') else {}
        embedding = None
        if data.get('embedding'):
            embedding = np.frombuffer(data['embedding'], dtype=np.float32).reshape(-1)

        return cls(
            id=data['id'],
            label=data['label'],
            description=data.get('description'),
            category=data.get('category'),
            keywords=keywords,
            embedding=embedding,
            metadata=metadata,
            created_at=data.get('created_at'),
            updated_at=data.get('updated_at'),
        )


@dataclass
class Edge:
    """Represents a relationship (edge) between nodes"""
    id: str
    source_id: str
    target_id: str
    type: RelationshipType
    strength: float = 1.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage"""
        return {
            'id': self.id,
            'source_id': self.source_id,
            'target_id': self.target_id,
            'type': self.type.value,
            'strength': self.strength,
            'metadata': json.dumps(self.metadata) if self.metadata else None,
            'created_at': self.created_at or int(datetime.now().timestamp()),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Edge':
        """Create Edge from dictionary"""
        metadata = json.loads(data.get('metadata', '{}')) if data.get('metadata') else {}

        return cls(
            id=data['id'],
            source_id=data['source_id'],
            target_id=data['target_id'],
            type=RelationshipType(data['type']),
            strength=data.get('strength', 1.0),
            metadata=metadata,
            created_at=data.get('created_at'),
        )


@dataclass
class Embedding:
    """Represents a vector embedding for a node"""
    id: str
    node_id: str
    embedding: np.ndarray
    dimension: int
    model: str
    created_at: Optional[int] = None
    updated_at: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage"""
        return {
            'id': self.id,
            'node_id': self.node_id,
            'embedding': self.embedding.tobytes() if self.embedding is not None else None,
            'dimension': self.dimension,
            'model': self.model,
            'created_at': self.created_at or int(datetime.now().timestamp()),
            'updated_at': self.updated_at or int(datetime.now().timestamp()),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Embedding':
        """Create Embedding from dictionary"""
        embedding = np.frombuffer(data['embedding'], dtype=np.float32) if data.get('embedding') else None

        return cls(
            id=data['id'],
            node_id=data['node_id'],
            embedding=embedding,
            dimension=data.get('dimension', 384),
            model=data.get('model', 'all-MiniLM-L6-v2'),
            created_at=data.get('created_at'),
            updated_at=data.get('updated_at'),
        )


@dataclass
class GraphMetadata:
    """Graph-level metadata and statistics"""
    key: str
    value: str
    updated_at: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage"""
        return {
            'key': self.key,
            'value': self.value,
            'updated_at': self.updated_at or int(datetime.now().timestamp()),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'GraphMetadata':
        """Create GraphMetadata from dictionary"""
        return cls(
            key=data['key'],
            value=data['value'],
            updated_at=data.get('updated_at'),
        )


@dataclass
class QueryLog:
    """Log entry for a query execution"""
    id: Optional[int] = None
    query: str = ""
    query_type: Optional[QueryType] = None
    latency_ms: Optional[int] = None
    result_count: Optional[int] = None
    timestamp: Optional[int] = None
    user_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage"""
        return {
            'id': self.id,
            'query': self.query,
            'query_type': self.query_type.value if self.query_type else None,
            'latency_ms': self.latency_ms,
            'result_count': self.result_count,
            'timestamp': self.timestamp or int(datetime.now().timestamp()),
            'user_id': self.user_id,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'QueryLog':
        """Create QueryLog from dictionary"""
        query_type = None
        if data.get('query_type'):
            try:
                query_type = QueryType(data['query_type'])
            except ValueError:
                pass

        return cls(
            id=data.get('id'),
            query=data.get('query', ''),
            query_type=query_type,
            latency_ms=data.get('latency_ms'),
            result_count=data.get('result_count'),
            timestamp=data.get('timestamp'),
            user_id=data.get('user_id'),
        )


@dataclass
class CacheEntry:
    """Cache entry for fast lookups"""
    key: str
    value: str
    ttl_seconds: int = 3600
    created_at: Optional[int] = None
    expires_at: Optional[int] = None

    def is_expired(self) -> bool:
        """Check if cache entry has expired"""
        if self.expires_at is None:
            return False
        return int(datetime.now().timestamp()) > self.expires_at

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        now = int(datetime.now().timestamp())
        return {
            'key': self.key,
            'value': self.value,
            'ttl_seconds': self.ttl_seconds,
            'created_at': self.created_at or now,
            'expires_at': self.expires_at or (now + self.ttl_seconds),
        }


@dataclass
class UpdateHistoryEntry:
    """Track changes to graph entities"""
    id: Optional[int] = None
    entity_id: str = ""
    entity_type: EntityType = EntityType.NODE
    operation: str = ""
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    timestamp: Optional[int] = None
    source: str = "system"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'id': self.id,
            'entity_id': self.entity_id,
            'entity_type': self.entity_type.value,
            'operation': self.operation,
            'old_value': self.old_value,
            'new_value': self.new_value,
            'timestamp': self.timestamp or int(datetime.now().timestamp()),
            'source': self.source,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'UpdateHistoryEntry':
        """Create UpdateHistoryEntry from dictionary"""
        return cls(
            id=data.get('id'),
            entity_id=data.get('entity_id', ''),
            entity_type=EntityType(data.get('entity_type', 'node')),
            operation=data.get('operation', ''),
            old_value=data.get('old_value'),
            new_value=data.get('new_value'),
            timestamp=data.get('timestamp'),
            source=data.get('source', 'system'),
        )
