'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Opportunity = {
  id: string;
  topic: string;
  niche?: string;
  language?: string;
  angle: string;
  status: string;
  decision: string;
  score: number;
  grade: string;
  confidence: number;
  recommended_format?: string | null;
  detected_at: string;
  signals?: Record<string, unknown>;
  evidence?: unknown[];
  rationale?: unknown[];
  jobs?: Array<{ id: string; state: string; kind: string }>;
};

const label = (value: string) => ({ PRODUCE: 'Producir', RESEARCH: 'Investigar', WATCH: 'Vigilar', REVIEW: 'Revisar' }[value] || value);
const formatLabel = (value?: string | null) => value === 'SHORT_VERTICAL' ? 'Short vertical' : value === 'SHORT_HORIZONTAL' ? 'Short horizontal' : 'Long horizontal';

export default function RadarClient() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  async function load() {
    const response = await fetch('/api/radar', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'No se pudo leer el radar.');
    setItems(payload.opportunities || []);
  }

  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'No se pudo leer el radar.')); }, []);

  function produce(item: Opportunity) {
    setBusy(item.id); setError(''); setFeedback((current) => ({ ...current, [item.id]: 'Abriendo el creador y preparando la producción…' }));
    const params = new URLSearchParams({ opportunityId: item.id, prompt: `${item.topic}. ${item.angle}`.trim(), format: item.recommended_format || 'AUTO', durationSec: item.recommended_format === 'SHORT_VERTICAL' ? '60' : '180', qualityMode: 'MAX_QUALITY', productionMode: 'AUTO', autoStart: '1' });
    window.location.assign(`/create?${params.toString()}`);
  }

  return <div className="content"><header className="topbar"><div><p className="eyebrow">Market intelligence</p><h1>YouTube Radar</h1></div><Link href="/" className="pill info">← Portfolio</Link></header><main className="main">
    <section className="card" style={{ maxWidth: 1100, margin: '0 auto 24px' }}><div className="section-head"><div><p className="eyebrow">Oportunidades reales</p><h2>Señal → brief → producción</h2></div><span className="pill good">Sin copy/paste</span></div><p className="muted">Estas tarjetas proceden de oportunidades persistidas por el Market Cycle. Cada producción conserva el opportunityId, las señales y la evidencia originales. Al producir, se abre el creador y la barra de progreso empieza en la misma pantalla.</p>{error ? <p className="error">{error}</p> : null}</section>
    <section className="section" style={{ maxWidth: 1100, margin: '0 auto' }}><div className="section-head"><div><p className="eyebrow">Backlog priorizado</p><h2>{items.length ? `${items.length} oportunidades activas` : 'Sin oportunidades activas'}</h2></div><button type="button" className="pill info" onClick={() => void load()}>Actualizar</button></div>{items.length ? <div className="idea-list">{items.map((item) => <article className="card idea-card" key={item.id}><div className="row"><div><span className="pill info">{formatLabel(item.recommended_format)} · {item.language?.toUpperCase() || '—'}</span><h3>{item.topic}</h3><div className="meta">{item.niche || 'nicho abierto'} · detectada {new Date(item.detected_at).toLocaleString()}</div></div><div style={{ textAlign: 'right' }}><span className="pill good">{item.grade} · {Math.round(item.score)}/100</span><div className="fine" style={{ marginTop: 6 }}>{label(item.decision)}</div></div></div><p><strong>Ángulo:</strong> {item.angle}</p><p className="muted"><strong>Por qué ahora:</strong> {Array.isArray(item.rationale) && item.rationale.length ? item.rationale.slice(0, 2).map(String).join(' · ') : 'Señal de mercado persistida; revisar evidencia antes de publicar.'}</p><div className="kpis"><div className="kpi"><span>Confianza</span><strong>{Math.round(Number(item.confidence || 0) * 100)}%</strong></div><div className="kpi"><span>Evidencia</span><strong>{Array.isArray(item.evidence) ? item.evidence.length : 0} fuentes</strong></div><div className="kpi"><span>Estado</span><strong>{item.status}</strong></div></div><div className="idea-actions"><button type="button" className="primary" disabled={busy === item.id} onClick={() => void produce(item)}>{busy === item.id ? 'Encolando…' : 'PRODUCIR'}</button>{feedback[item.id] ? <span className="fine">{feedback[item.id]}</span> : null}</div>{item.jobs?.length ? <p className="fine">Último job: {item.jobs[0].state}</p> : null}</article>)}</div> : <div className="card empty">El radar aún no ha persistido oportunidades. Ejecuta el siguiente Market Cycle con las credenciales de investigación configuradas.</div>}</section>
  </main></div>;
}
