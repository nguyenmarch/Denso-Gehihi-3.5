"""Complete topology and expert inspection; errors never expose database internals."""
from fastapi import APIRouter, Depends, HTTPException, Header
from neo4j import AsyncDriver
from app.core.database import get_db_driver
from app.schemas.graph import GraphTopologyResponse, GraphNodeDTO, GraphEdgeDTO

router = APIRouter()


async def graph_role(x_demo_role: str = Header(default='expert')):
    if x_demo_role == 'technician':
        raise HTTPException(403, detail='Raw topology chỉ dành cho màn hình expert/operator demo.')


@router.get('/topology', response_model=GraphTopologyResponse, dependencies=[Depends(graph_role)])
async def get_full_topology(driver: AsyncDriver = Depends(get_db_driver)):
    query = 'MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN collect(DISTINCT n) AS nodes, collect(DISTINCT r) AS edges'
    try:
        async with driver.session() as session:
            record = await (await session.run(query)).single()
    except Exception:
        raise HTTPException(503, detail={'code': 'graph_store_unavailable', 'message': 'Graph store không sẵn sàng. Hãy thử lại.'}) from None
    if not record:
        return GraphTopologyResponse(nodes=[], edges=[])
    try:
        nodes = [GraphNodeDTO(id=n['id'], label=sorted(n.labels)[0] if n.labels else 'Unknown', properties=dict(n)) for n in record['nodes']]
        edges = [GraphEdgeDTO(id=r.element_id, source=r.start_node['id'], target=r.end_node['id'], type=r.type) for r in record['edges']]
        identifiers = {n.id for n in nodes}
        if len(identifiers) != len(nodes) or any(e.source not in identifiers or e.target not in identifiers for e in edges):
            raise ValueError('invalid graph')
        return GraphTopologyResponse(nodes=nodes, edges=edges)
    except (ValueError, TypeError, KeyError, AttributeError, IndexError):
        raise HTTPException(502, detail={'code': 'invalid_topology', 'message': 'Topology không hợp lệ; không thể hiển thị đầy đủ dữ liệu.'}) from None


@router.get('/node/{node_id}', dependencies=[Depends(graph_role)])
async def get_node_details(node_id: str, driver: AsyncDriver = Depends(get_db_driver)):
    query = '''
    MATCH (n {id: $node_id})
    OPTIONAL MATCH (n)-[r]-(neighbor)
    RETURN n, collect({type: type(r), direction: CASE WHEN startNode(r)=n THEN 'out' ELSE 'in' END, node: neighbor}) AS relations
    '''
    try:
        async with driver.session() as session:
            record = await (await session.run(query, node_id=node_id)).single()
    except Exception:
        raise HTTPException(503, detail={'code': 'graph_store_unavailable', 'message': 'Graph store không sẵn sàng. Hãy thử lại.'}) from None
    if not record:
        raise HTTPException(404, detail='Node not found')
    node = record['n']
    return {'id': node.get('id'), 'label': sorted(node.labels)[0] if node.labels else 'Unknown', 'properties': dict(node),
            'relations': [{**rel, 'node': dict(rel['node']), 'labels': sorted(rel['node'].labels)} for rel in record['relations'] if rel['node']]}
