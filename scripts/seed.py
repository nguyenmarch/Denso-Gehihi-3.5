"""Apply existing idempotent synthetic seed without deleting any topology."""
import asyncio
from pathlib import Path
from app.core.database import db_pool

async def main():
    driver = await db_pool.connect()
    try:
        if not await db_pool.verify_connectivity():
            raise SystemExit('Neo4j không sẵn sàng. Chạy docker compose up -d neo4j trước.')
        for path in (Path('backend/data/migrations/001_init_constraints.cypher'), Path('backend/data/seed_scenarios.cypher')):
            text = '\n'.join(line for line in path.read_text(encoding='utf-8').splitlines() if not line.strip().startswith('//'))
            async with driver.session() as session:
                for statement in text.split(';'):
                    if statement.strip():
                        await (await session.run(statement)).consume()
        print('Synthetic migration + seed: OK (idempotent, no deletion)')
    finally:
        await db_pool.close()

asyncio.run(main())
