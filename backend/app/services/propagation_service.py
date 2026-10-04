from typing import List
from neo4j import AsyncDriver
from app.schemas.incident import ImpactedNodeDTO
from app.core.config import settings

class PropagationService:
    def __init__(self, driver: AsyncDriver):
        self.driver = driver
        self.decay_rate = settings.DECAY_RATE
        self.max_hops = settings.MAX_HOPS

    async def calculate_forward_impact(self, node_id: str, severity: float) -> List[ImpactedNodeDTO]:
        query = """
        MATCH path = (origin {id: $node_id})-[:FLOWS_TO|AFFECTS*1..$max_hops]->(target)
        WITH target, min(length(path)) AS depth
        RETURN target.id AS node_id, 
               coalesce(labels(target)[0], 'Unknown') AS node_type,
               coalesce(target.name, target.id) AS name,
               depth
        ORDER BY depth ASC
        """
        # Neo4j does not allow a parameter in a variable-length upper bound on
        # older server versions; keep the query portable by interpolating a
        # validated integer from configuration.
        query = query.replace("$max_hops", str(self.max_hops))
        results = []
        async with self.driver.session() as session:
            cursor = await session.run(query, node_id=node_id)
            records = await cursor.data()
            seen = set()
            for r in records:
                if not r.get("node_id") or r["node_id"] in seen:
                    continue
                seen.add(r["node_id"])
                score = round(severity * (self.decay_rate ** r["depth"]), 3)
                results.append(
                    ImpactedNodeDTO(
                        node_id=r["node_id"],
                        node_type=r["node_type"],
                        name=r["name"],
                        distance=r["depth"],
                        impact_score=score
                    )
                )
        return results
