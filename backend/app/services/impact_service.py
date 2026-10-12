"""Batch impact of an equipment incident, decided from processing records and profile checks.

Rule `suspect_window_v1` (docs/demo-script.md): the suspect window opens at the last passing
profile check of the equipment before the alarm and stays open until the equipment is isolated
(not recorded yet). Missing data is never reported as unaffected.
"""
from datetime import datetime

from neo4j import AsyncDriver

RULE = 'suspect_window_v1'

BATCH_QUERY = '''
MATCH (e:Equipment {id: $asset_id})
OPTIONAL MATCH (e)-[:OPERATES_IN]->(s:ProcessStep)
WITH e, s
MATCH (b:Batch)
OPTIONAL MATCH (b)-[r:PROCESSED_ON]->(e)
OPTIONAL MATCH (b)-[:PROCESSED_BY]->(bs:ProcessStep)
OPTIONAL MATCH (b)-[i:INSPECTED_ON]->(:Equipment)
RETURN s.sequence AS equipment_seq, b.id AS id, b.name AS name, b.product_code AS product_code,
       bs.sequence AS step_seq, bs.name AS step_name,
       CASE WHEN r IS NULL THEN null ELSE {id: r.record_id, start: r.start, end: r.end} END AS record,
       CASE WHEN i IS NULL THEN null ELSE {id: i.record_id, result: i.result, at: i.at} END AS inspection
ORDER BY id
'''
CHECK_QUERY = '''
MATCH (c:ProfileCheck)-[:CHECKS]->(:Equipment {id: $asset_id})
RETURN c.id AS id, c.at AS at, c.result AS result
'''


def _time(value):
    return datetime.fromisoformat(value) if value else None


def _clock(value):
    return value.strftime('%d/%m %H:%M')


def classify(batches, checks, alarm_at, equipment_seq):
    """Pure rule: `batches` and `checks` are rows as returned by BATCH_QUERY / CHECK_QUERY."""
    passing = [c for c in checks if c.get('result') == 'PASS' and _time(c.get('at')) and _time(c['at']) <= alarm_at]
    last_good = max(passing, key=lambda c: _time(c['at']), default=None)
    good_at = _time(last_good['at']) if last_good else None
    window = {'start': last_good['at'] if last_good else None,
              'start_basis': last_good['id'] if last_good else 'Không có kiểm tra profile đạt trước alarm',
              'end': None, 'end_basis': 'Chưa ghi nhận thời điểm cô lập thiết bị'}
    items = []
    for batch in batches:
        record, inspection = batch.get('record'), batch.get('inspection')
        refs = [record['id']] if record else []
        start, end = (_time(record.get('start')), _time(record.get('end'))) if record else (None, None)
        at_step = equipment_seq is not None and batch.get('step_seq') == equipment_seq
        if record and start and start <= alarm_at and ((end is None and at_step) or (end and end >= alarm_at)):
            category, code, text = 'affected', 'in_equipment_at_alarm', f'Đang xử lý tại thiết bị lúc alarm (bắt đầu {_clock(start)})'
        elif record and end and good_at and end < good_at:
            category, code, text = 'unaffected', 'before_last_good_check', f'Kết thúc {_clock(end)}, trước kiểm tra đạt {_clock(good_at)}'
            refs.append(last_good['id'])
        elif record and good_at and ((start and start >= good_at) or (end and end >= good_at)):
            category, code, text = 'affected', 'processed_in_window', f'Xử lý tại thiết bị trong cửa sổ nghi ngờ từ {_clock(good_at)}'
            refs.append(last_good['id'])
        elif record and not good_at:
            category, code, text = 'unknown', 'no_good_check', 'Không có kiểm tra profile đạt để giới hạn cửa sổ nghi ngờ'
        elif record and start:
            category, code, text = 'unknown', 'missing_end_time', f'Bắt đầu {_clock(start)}, trước kiểm tra đạt; thiếu thời điểm kết thúc'
        elif record:
            category, code, text = 'unknown', 'missing_times', 'Thiếu thời điểm bắt đầu và kết thúc xử lý tại thiết bị'
        elif batch.get('step_seq') is None or equipment_seq is None:
            category, code, text = 'unknown', 'location_unknown', 'Không xác định được vị trí lô'
        elif batch['step_seq'] < equipment_seq:
            category, code, text = 'unaffected', 'not_yet_processed', f'Chưa qua thiết bị (đang ở {batch.get("step_name")})'
        else:
            category, code, text = 'unknown', 'missing_record', f'Không có record tại thiết bị dù lô đang ở {batch.get("step_name")}'
        item = {'object_id': batch['id'], 'object_type': 'Batch', 'name': batch.get('name'), 'product_code': batch.get('product_code'),
                'category': category, 'reasons': [{'code': code, 'text': text, 'refs': refs}]}
        if inspection:
            item['reasons'].append({'code': 'inspection', 'text': f'Kiểm tra {inspection.get("result")} lúc {_clock(_time(inspection["at"]))}', 'refs': [inspection['id']]})
        if category == 'affected':
            item['verification'] = 'needs_verification'
        elif category == 'unknown':
            item['verification'] = 'needs_verification'
            item['next_check'] = 'Xác minh record xử lý; giữ bảo thủ đến khi rõ'
        else:
            item['scope_note'] = 'Chỉ xét sự cố của thiết bị này'
        items.append(item)
    return {'rule': RULE, 'window': window, 'items': items}


async def load_impact(driver: AsyncDriver, asset_id: str, alarm_at: datetime):
    async with driver.session() as session:
        batches = await (await session.run(BATCH_QUERY, asset_id=asset_id)).data()
        checks = await (await session.run(CHECK_QUERY, asset_id=asset_id)).data()
    equipment_seq = batches[0]['equipment_seq'] if batches else None
    return classify(batches, checks, alarm_at, equipment_seq)


def summary(impact):
    counts = {c: sum(1 for i in impact['items'] if i['category'] == c) for c in ('affected', 'unaffected', 'unknown')}
    return f"Tác động lô: {counts['affected']} bị ảnh hưởng, {counts['unaffected']} không bị ảnh hưởng, {counts['unknown']} chưa rõ"
