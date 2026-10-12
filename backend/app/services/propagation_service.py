"""Deterministic forward-impact propagation over the Neo4j graph."""

from typing import Any

from neo4j import AsyncDriver

from app.core.config import settings
from app.schemas.incident import ImpactedNodeDTO


ORIGIN_EXISTS_QUERY = """
MATCH (origin {id: $node_id})
RETURN count(origin) > 0 AS origin_exists
"""


class PropagationError(RuntimeError):
    """Base error for propagation failures that are safe to expose at the API boundary."""


class PropagationNodeNotFoundError(PropagationError):
    """Raised when the requested origin node is absent from the graph."""


class PropagationDependencyError(PropagationError):
    """Raised when Neo4j cannot execute a propagation query."""


class PropagationService:
    def __init__(self, driver: AsyncDriver):
        self.driver = driver
        self.decay_rate = float(settings.DECAY_RATE)
        self.max_hops = int(settings.MAX_HOPS)

        if not 0 <= self.decay_rate <= 1:
            raise ValueError("DECAY_RATE must be between 0 and 1")
        if self.max_hops < 1:
            raise ValueError("MAX_HOPS must be at least 1")

    def _impact_query(self) -> str:
        """Build the bounded query using the validated integer configuration."""
        return f"""
        MATCH path = (origin {{id: $node_id}})-[:OPERATES_IN|FLOWS_TO|AFFECTS*1..{self.max_hops}]->(target)
        WITH origin, target, min(length(path)) AS distance
        WHERE target.id IS NOT NULL AND target.id <> origin.id
        RETURN target.id AS node_id,
               coalesce(labels(target)[0], 'Unknown') AS node_type,
               coalesce(target.name, target.id) AS name,
               distance
        ORDER BY distance ASC, node_id ASC
        """

    async def _load_impact_records(self, node_id: str) -> list[dict[str, Any]]:
        try:
            async with self.driver.session() as session:
                exists_result = await session.run(ORIGIN_EXISTS_QUERY, node_id=node_id)
                exists_record = await exists_result.single()
                if not exists_record or not exists_record.get("origin_exists"):
                    raise PropagationNodeNotFoundError(
                        f"Propagation origin node does not exist: {node_id}"
                    )

                result = await session.run(self._impact_query(), node_id=node_id)
                return await result.data()
        except PropagationNodeNotFoundError:
            raise
        except Exception as exc:
            raise PropagationDependencyError("Neo4j propagation query failed") from exc

    async def calculate_forward_impact(self, node_id: str, severity: float) -> list[ImpactedNodeDTO]:
        records = await self._load_impact_records(node_id)
        nodes_by_id: dict[str, tuple[int, str, str]] = {}

        for record in records:
            raw_node_id = record.get("node_id")
            if not raw_node_id:
                continue

            try:
                distance = int(record.get("distance"))
            except (TypeError, ValueError):
                continue

            if distance < 1 or distance > self.max_hops:
                continue

            normalized_id = str(raw_node_id)
            candidate = (
                distance,
                str(record.get("node_type") or "Unknown"),
                str(record.get("name") or normalized_id),
            )
            current = nodes_by_id.get(normalized_id)
            if current is None or candidate[0] < current[0]:
                nodes_by_id[normalized_id] = candidate

        results: list[ImpactedNodeDTO] = []
        ordered_nodes = sorted(
            nodes_by_id.items(),
            key=lambda item: (item[1][0], item[0]),
        )
        for node_id, (distance, node_type, name) in ordered_nodes:
            score = round(severity * (self.decay_rate ** distance), 3)
            results.append(
                ImpactedNodeDTO(
                    node_id=node_id,
                    node_type=node_type,
                    name=name,
                    distance=distance,
                    impact_score=score,
                )
            )

        return results
