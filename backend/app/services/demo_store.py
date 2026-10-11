"""Local demo state only. No industrial write paths or LLM knowledge mutation."""
import asyncio
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings


def now():
    return datetime.now(timezone.utc).isoformat()


class DemoStore:
    def __init__(self, path):
        if path != ':memory:':
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute('CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, payload TEXT, PRIMARY KEY(kind,id))')
        self.lock = asyncio.Lock()

    def get(self, kind, ident):
        row = self.db.execute('SELECT payload FROM records WHERE kind=? AND id=?', (kind, ident)).fetchone()
        return json.loads(row[0]) if row else None

    def put(self, kind, ident, data):
        with self.db:
            self.db.execute('INSERT OR REPLACE INTO records VALUES (?,?,?)', (kind, ident, json.dumps(data, ensure_ascii=False)))

    def all(self, kind):
        return [json.loads(r[0]) for r in self.db.execute('SELECT payload FROM records WHERE kind=? ORDER BY rowid DESC', (kind,))]

    def command(self, ident, fingerprint, action):
        cached = self.get('command', ident)
        if cached:
            if cached['fingerprint'] != fingerprint:
                from fastapi import HTTPException
                raise HTTPException(409, detail={'code': 'idempotency_conflict', 'message': 'Idempotency-Key đã được dùng cho thao tác khác.'})
            return cached['response']
        # Incident and retry record commit together, including after a process crash.
        with self.db:
            response = action()
            self.db.execute('INSERT INTO records VALUES (?,?,?)', ('command', ident, json.dumps({'fingerprint': fingerprint, 'response': response})))
        return response

    def write(self, kind, record):
        # Joins the caller's transaction (see command); commits with the idempotency record.
        self.db.execute('INSERT OR REPLACE INTO records VALUES (?,?,?)', (kind, record['id'], json.dumps(record, ensure_ascii=False)))


_store = None


async def get_demo_store():
    global _store
    if _store is None:
        _store = DemoStore(settings.INAV_STORE_PATH)
    return _store
