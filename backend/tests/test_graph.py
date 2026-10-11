import pytest
from fastapi import HTTPException
from app.api.v1.graph import get_full_topology, get_node_details, graph_role

class Node(dict):
    labels = {'Equipment'}

class Relation:
    def __init__(self, ident, start, end):
        self.element_id = ident
        self.start_node, self.end_node = start, end
        self.type = 'OPERATES_IN'

class Driver:
    def __init__(self, record=None, error=None): self.record, self.error = record, error
    def session(self): return self
    async def __aenter__(self): return self
    async def __aexit__(self, *_): pass
    async def run(self, *_args, **_kwargs):
        if self.error: raise self.error
        return self
    async def single(self): return self.record

@pytest.mark.asyncio
async def test_topology_preserves_parallel_edges_and_every_node():
    a, b, isolated = Node(id='a'), Node(id='b'), Node(id='isolated')
    graph = await get_full_topology(Driver({'nodes': [a, b, isolated], 'edges': [Relation('one', a, b), Relation('two', a, b)]}))
    assert len(graph.nodes) == 3
    assert len(graph.edges) == 2
    assert graph.edges[0].id != graph.edges[1].id
    assert graph.edges[0].source == 'a' and graph.edges[0].target == 'b'

@pytest.mark.asyncio
async def test_malformed_topology_fails_explicitly_instead_of_pruning():
    a, missing = Node(id='a'), Node(id='missing')
    with pytest.raises(HTTPException) as exc:
        await get_full_topology(Driver({'nodes': [a], 'edges': [Relation('one', a, missing)]}))
    assert exc.value.status_code == 502

@pytest.mark.asyncio
@pytest.mark.parametrize('endpoint', [get_full_topology, lambda driver: get_node_details('a', driver)])
async def test_graph_dependency_error_is_sanitized(endpoint):
    with pytest.raises(HTTPException) as exc:
        await endpoint(Driver(error=RuntimeError('private internals')))
    assert exc.value.status_code == 503
    assert 'private' not in str(exc.value.detail)

@pytest.mark.asyncio
async def test_technician_cannot_request_raw_graph():
    with pytest.raises(HTTPException) as exc: await graph_role('tech-01')
    assert exc.value.status_code == 403
