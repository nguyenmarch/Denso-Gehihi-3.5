from fastapi import APIRouter, Depends
from neo4j import AsyncDriver
from app.core.database import get_db_driver
from app.schemas.graph import GraphTopologyResponse, GraphNodeDTO, GraphEdgeDTO
from fastapi import HTTPException

router = APIRouter()

@router.get("/topology", response_model=GraphTopologyResponse)
async def get_full_topology(driver: AsyncDriver = Depends(get_db_driver)):
    query = "MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN collect(DISTINCT n) AS nodes, collect(DISTINCT r) AS edges"
    async with driver.session() as session:
        record = await (await session.run(query)).single()
    if not record:
        return GraphTopologyResponse(nodes=[], edges=[])
    nodes = [GraphNodeDTO(id=n.get("id"), label=(n.labels and list(n.labels)[0]) or "Unknown", properties=dict(n)) for n in record["nodes"] if n.get("id")]
    edges = [GraphEdgeDTO(source=r.start_node.get("id"), target=r.end_node.get("id"), type=r.type) for r in record["edges"] if r.start_node.get("id") and r.end_node.get("id")]
    return GraphTopologyResponse(nodes=nodes, edges=edges)

@router.get("/node/{node_id}")
async def get_node_details(node_id: str, driver: AsyncDriver = Depends(get_db_driver)):
    query = """
    MATCH (n {id: $node_id})
    OPTIONAL MATCH (n)-[r]-(neighbor)
    RETURN n, collect({type: type(r), direction: CASE WHEN startNode(r)=n THEN 'out' ELSE 'in' END, node: neighbor}) AS relations
    """
    async with driver.session() as session:
        record = await (await session.run(query, node_id=node_id)).single()
    if not record:
        raise HTTPException(status_code=404, detail="Node not found")
    node = record["n"]
    return {"id": node.get("id"), "label": list(node.labels)[0] if node.labels else "Unknown", "properties": dict(node), "relations": [{**rel, "node": dict(rel["node"]), "labels": list(rel["node"].labels)} for rel in record["relations"] if rel["node"]]}
