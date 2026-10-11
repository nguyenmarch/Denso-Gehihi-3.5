import { useEffect, useState } from 'react';
import { fetchNodeDetails, toApiError } from '../services/api';

export function ExpertInspector({ nodeId }: { nodeId: string }) {
  const [detail, setDetail] = useState<Record<string, unknown>>();
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true; setDetail(undefined); setError('');
    if (nodeId) fetchNodeDetails(nodeId).then(data => { if (current) setDetail(data); }).catch(err => { if (current) setError(toApiError(err).message); });
    return () => { current = false; };
  }, [nodeId]);
  return <section className="panel expert-inspector"><div className="panel-heading"><h2>Chi tiết node</h2></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <h3>{nodeId || 'Chọn node trên graph'}</h3>
    {detail && <dl>{Object.entries((detail.properties ?? {}) as Record<string, unknown>).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>}
    {detail && <details><summary>Quan hệ của node</summary>{((detail.relations ?? []) as { type: string; direction: string; node: Record<string, unknown> }[]).map((relation, index) => <p key={index}>{relation.direction === 'out' ? '→' : '←'} {relation.type} · {String(relation.node.name ?? relation.node.id)}</p>)}</details>}
  </section>;
}
