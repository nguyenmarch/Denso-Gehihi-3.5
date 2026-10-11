"""Demo actors. Presentation personas selected by the `X-Demo-Actor` header, not authentication."""

ACTORS = {
    'op-01': {'name': 'Điều phối ca A', 'role': 'operator'},
    'tech-01': {'name': 'Kỹ thuật viên 1', 'role': 'technician'},
    'tech-02': {'name': 'Kỹ thuật viên 2', 'role': 'technician'},
    'exp-01': {'name': 'Chuyên gia bảo trì', 'role': 'expert'},
}


def lookup(actor_id):
    actor = ACTORS.get(actor_id or '')
    return {'id': actor_id, **actor} if actor else None
