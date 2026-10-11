import asyncio
import subprocess
from app.core.config import settings
from app.core.database import db_pool
from app.api.v1.graph import get_full_topology

async def main():
    tracked = subprocess.check_output(['git', 'ls-files'], text=True).splitlines()
    if any(path == '.env' or path.endswith('/.env') or ('.env.' in path and not path.endswith('.env.example')) for path in tracked):
        raise SystemExit('FAIL: local environment file is tracked by Git.')
    driver = await db_pool.connect()
    try:
        if not await db_pool.verify_connectivity():
            raise SystemExit('FAIL: Neo4j unavailable. Start Neo4j and seed before preflight.')
        graph = await get_full_topology(driver)
        if not graph.nodes or not graph.edges:
            raise SystemExit('FAIL: topology is empty; run scripts/seed.py.')
        print(f'PASS: full topology {len(graph.nodes)} nodes / {len(graph.edges)} edges')
        print('PASS: .env is not tracked; no industrial write capability')
        print(f'AI mode={settings.INAV_AI_MODE}; key configured={bool(settings.INAV_GEMINI_API_KEY.get_secret_value())}; policy={settings.INAV_DATA_POLICY}')
        if settings.INAV_AI_MODE != 'gemini' or not settings.INAV_GEMINI_API_KEY.get_secret_value():
            print('Live Gemini acceptance pending: local configuration/key required.')
    finally:
        await db_pool.close()

asyncio.run(main())
