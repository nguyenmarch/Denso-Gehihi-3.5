from typing import List, Dict, Any
from neo4j import AsyncDriver

class RootCauseService:
    def __init__(self, driver: AsyncDriver):
        self.driver = driver

    async def trace_root_causes(self, defect_node_id: str) -> List[Dict[str, Any]]:
        query = """
        MATCH path = (upstream)-[:FLOWS_TO|CAN_CAUSE|PROCESSED_BY|AFFECTS*1..4]->(origin {id: $defect_node_id})
        WITH upstream, min(length(path)) AS distance
        RETURN upstream.id AS node_id, labels(upstream)[0] AS type,
               coalesce(upstream.name, upstream.id) AS name, distance
        ORDER BY distance ASC
        """
        async with self.driver.session() as session:
            result = await session.run(query, defect_node_id=defect_node_id)
            return await result.data()
