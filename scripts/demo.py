"""HTTP rehearsal of the main demo case against real Neo4j, with an isolated temporary workflow store."""
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from uuid import uuid4

import httpx
from app.core.config import settings


def remove_store(path):
    # On Windows the venv python.exe is a launcher; its server child can hold the SQLite file briefly after terminate().
    for _ in range(20):
        try:
            shutil.rmtree(path)
            return
        except PermissionError:
            time.sleep(.25)
    shutil.rmtree(path)


# Expected outcome of the main case, written from the rule in docs/demo-script.md before running the engine.
EXPECTED_IMPACT = {'BATCH_2026_001': 'affected', 'BATCH_2026_002': 'unaffected', 'BATCH_2026_003': 'unaffected', 'BATCH_2026_004': 'unknown'}

temp = tempfile.mkdtemp(prefix='inav-demo-')
try:
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

            def call(method, path, actor, body=None, key=None, mutation=True):
                headers = {'X-Demo-Actor': actor}
                if mutation:
                    headers['Idempotency-Key'] = key or str(uuid4())
                response = client.request(method, '/api/v1' + path, json=body, headers=headers)
                response.raise_for_status()
                return response.json()

            def read(path, actor):
                return call('GET', path, actor, mutation=False)

            incident = call('POST', '/scenarios/SCN_OVEN_TEMP/trigger', 'op-01')
            assert call('POST', '/scenarios/SCN_OVEN_TEMP/trigger', 'op-01')['id'] == incident['id'], 'same event must not create a second incident'
            path = '/incidents/' + incident['id']
            impact = read(path + '/impact', 'op-01')
            actual = {i['object_id']: i['category'] for i in impact['items']}
            assert actual == EXPECTED_IMPACT, f'impact {actual} != expected {EXPECTED_IMPACT}'
            print('PASS: scenario trigger is idempotent per event; impact matches expected outcome', actual)

            dispatch = {'assignee_id': 'tech-01', 'decision_note': 'Giữ lô affected/unknown, giao sửa lò'}
            key = str(uuid4())
            assert call('POST', path + '/dispatch', 'op-01', dispatch, key) == call('POST', path + '/dispatch', 'op-01', dispatch, key)
            assert read('/incidents', 'tech-02') == [], 'other technicians must not see the work order'
            assert call('POST', path + '/start', 'tech-01', {})['state'] == 'in_progress'
            guidance = read(path + '/guidance', 'tech-01')
            assert guidance['match']['source'] == 'playbook:EQ_OVEN_01/MACHINE_BREAKDOWN', guidance['match']
            explained = call('POST', path + '/guidance/explain', 'tech-01', mutation=False)
            assert explained['steps'] == guidance['steps']
            answer = call('POST', path + '/assistant/ask', 'tech-01', {'question': 'Nên kiểm tra gì trước?'}, mutation=False)
            unresolved = call('POST', path + '/report', 'tech-01', {'outcome': 'not_fixed', 'summary': 'Chờ thermocouple', 'next_step': 'Lắp thermocouple mới'})
            assert unresolved['state'] == 'unresolved' and unresolved['next_step'] == 'Lắp thermocouple mới'
            call('POST', path + '/dispatch', 'op-01', {'assignee_id': 'tech-01', 'decision_note': 'Đã có linh kiện'})
            call('POST', path + '/start', 'tech-01', {})
            assert call('POST', path + '/report', 'tech-01', {'outcome': 'fixed', 'summary': 'Đã thay thermocouple, profile đạt'})['state'] == 'resolved'
            assert {i['object_id']: i['category'] for i in read(path + '/impact', 'op-01')['items']}['BATCH_2026_001'] == 'affected', 'repair must not release batches'
            print('PASS: assign → start → not fixed → reassign → fixed, with actor history; batches stay to verify')

            lesson = call('POST', path + '/lessons', 'tech-01', {'text': 'Đo SSR vùng lỗi trước khi thay heater'})
            call('POST', f'/lessons/{lesson["id"]}/accept', 'exp-01', {})
            fresh = call('POST', '/incidents/fault', 'op-01', {'node_id': 'EQ_OVEN_01', 'incident_type': 'MACHINE_BREAKDOWN'})
            reused = read(f'/incidents/{fresh["id"]}/guidance', 'op-01')['lessons']
            assert [l['source_incident_id'] for l in reused] == [incident['id']], reused
            pack = call('POST', '/scenarios/SCN_PACK_JAM/trigger', 'op-01')
            assert read(f'/incidents/{pack["id"]}/guidance', 'op-01')['gap']['code'] == 'knowledge_gap'
            print('PASS: lesson pending → accepted → reused for same context; packaging fault gets a knowledge gap')

            after = client.get('/api/v1/graph/topology').json()
            assert before == after, 'Workflow must not mutate topology'
            audit = read('/demo/audit', 'exp-01')
            assert {a['kind'] for a in audit} == {'explain', 'ask'}
            print('PASS: unchanged full topology, LLM audit recorded')
            print(f"Guidance: mode={explained['mode']}, failure_category={explained['failure_category']}; "
                  f"ask: mode={answer['mode']}, failure_category={answer['failure_category']}")
            if explained['mode'] == 'llm' and answer['mode'] == 'llm': print('PASS: live Gemini narrative and answer returned and validated')
            else:
                print('Live Gemini acceptance pending (fallback rehearsal passed).')
                if os.environ.get('INAV_REQUIRE_LIVE') == '1': raise SystemExit(1)
    finally:
        server.terminate()
        try: server.wait(timeout=5)
        except subprocess.TimeoutExpired: server.kill(); server.wait()
finally:
    remove_store(temp)
