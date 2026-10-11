"""HTTP rehearsal against real Neo4j, with an isolated temporary workflow store."""
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from uuid import uuid4

import httpx
from app.core.config import settings

with tempfile.TemporaryDirectory(prefix='inav-demo-') as temp:
    env = {**os.environ, 'PYTHONPATH': str(Path('backend').resolve()), 'INAV_STORE_PATH': str(Path(temp) / 'demo.sqlite')}
    server = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8099'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        with httpx.Client(base_url='http://127.0.0.1:8099', timeout=65, trust_env=False) as client:
            for _ in range(60):
                if server.poll() is not None:
                    raise SystemExit('FAIL: rehearsal server could not start (port 8099 may be occupied).')
                try:
                    health = client.get('/health').json()
                    if health['status'] == 'ok': break
                except httpx.RequestError: pass
                time.sleep(.25)
            else: raise SystemExit('FAIL: Neo4j unavailable.')
            before = client.get('/api/v1/graph/topology').json()
            def command(path, body, role, key=None):
                response = client.post('/api/v1' + path, json=body, headers={'X-Demo-Role': role, 'Idempotency-Key': key or str(uuid4())})
                response.raise_for_status()
                return response.json()
            fault_key = str(uuid4())
            payload = {'node_id': 'EQ_OVEN_01', 'incident_type': 'MACHINE_BREAKDOWN', 'severity': 1}
            order = command('/incidents/fault', payload, 'operator', fault_key)
            assert command('/incidents/fault', payload, 'operator', fault_key)['id'] == order['id']
            path = '/incidents/' + order['id']
            assert command(path + '/dispatch', {}, 'operator')['state'] == 'dispatched'
            result = command(path + '/guidance/explain', {}, 'technician')
            assert result['steps'] == order['steps']
            assert result['mode'] in ('llm', 'knowledge')
            assert command(path + '/start', {}, 'technician')['state'] == 'in_progress'
            assert command(path + '/resolve', {'report': 'Synthetic rehearsal: kiểm tra theo playbook, chờ người phụ trách review.'}, 'technician')['state'] == 'resolved'
            learning = command('/demo/learning', {'incident_id': order['id'], 'node_id': 'EQ_OVEN_01', 'note': 'Expert synthetic field learning.'}, 'expert')
            assert learning['note']
            after = client.get('/api/v1/graph/topology').json()
            assert before == after, 'Workflow must not mutate topology'
            audit = client.get('/api/v1/demo/audit', headers={'X-Demo-Role': 'expert'}).json()
            assert audit[0]['mode'] == result['mode']
            print('PASS: HTTP fault → dispatch → guidance → start → resolve → expert learning')
            print('PASS: retry idempotency, deterministic steps, unchanged full topology, audit')
            print(f"Guidance: mode={result['mode']}, model={result['model']}, failure_category={result['failure_category']}")
            if result['mode'] == 'llm': print('PASS: live Gemini narrative returned and validated')
            else:
                print('Live Gemini acceptance pending (fallback rehearsal passed).')
                if os.environ.get('INAV_REQUIRE_LIVE') == '1': raise SystemExit(1)
    finally:
        server.terminate()
        try: server.wait(timeout=5)
        except subprocess.TimeoutExpired: server.kill(); server.wait()
