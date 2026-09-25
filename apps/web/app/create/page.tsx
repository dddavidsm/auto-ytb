'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

type JobStatus = { id: string; state: string; error?: string | null; attempts: number; maxAttempts: number; productionRunId?: string | null; productionState?: string | null; updatedAt?: string };
type Result = { runId: string; jobId: string; pipeline: string; status: string; brief: { briefId: string; prompt: string; format: string; channelKey: string; durationSec: number; qualityMode: string }; quote: { note: string; knownPaidCostUsd: number }; progress: string[]; job?: JobStatus };
const terminal = new Set(['succeeded', 'dead', 'cancelled']);

function label(state: string) { return ({ queued: 'En cola', running: 'Produciendo', retry: 'Reintentando', succeeded: 'Completado', dead: 'Fallido', cancelled: 'Cancelado' } as Record<string, string>)[state] || state; }

export default function CreatePage() {
  const [prompt, setPrompt] = useState('');
  const [durationSec, setDurationSec] = useState('180');
  const [qualityMode, setQualityMode] = useState('MAX_QUALITY');
  const [format, setFormat] = useState('AUTO');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!result?.jobId || terminal.has(result.job?.state || result.status)) return;
    const poll = async () => {
      const response = await fetch(`/api/production/brief/${encodeURIComponent(result.jobId)}`, { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      setResult((current) => current ? { ...current, status: payload.job.state, job: payload.job } : current);
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 4000);
    return () => window.clearInterval(timer);
  }, [result?.jobId, result?.job?.state, result?.status]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch('/api/production/brief', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, format, durationSec: Number(durationSec), qualityMode }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) setError(payload.error || 'No se pudo aceptar el proyecto.'); else setResult(payload as Result);
    } catch { setError('No se pudo contactar con el control plane.'); }
    setBusy(false);
  }

  const currentState = result?.job?.state || result?.status || '';
  return <div className="content"><header className="topbar"><div><p className="eyebrow">One-prompt studio</p><h1>Crear un vídeo</h1></div><Link href="/" className="pill info">← Portfolio</Link></header><main className="main">
    <section className="card" style={{ maxWidth: 900, margin: '20px auto' }}><p className="eyebrow">Universal production graph</p><h2>¿Qué quieres crear?</h2><p className="muted">La petición se guarda en PostgreSQL y el worker autónomo la procesa con reintentos, eventos y control de costes.</p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 20 }}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Crea un documental de 3 minutos sobre…" rows={6} required style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 14, padding: 14, resize: 'vertical' }} /><div className="kpis"><label className="kpi">Formato<select value={format} onChange={(event) => setFormat(event.target.value)} style={{ width: '100%', border: 0, background: 'transparent', marginTop: 6 }}><option value="AUTO">Automático</option><option value="LONG_HORIZONTAL">Long horizontal</option><option value="SHORT_VERTICAL">Short vertical</option></select></label><label className="kpi">Duración (segundos)<input value={durationSec} onChange={(event) => setDurationSec(event.target.value)} type="number" min="10" max="3600" style={{ width: '100%', border: 0, background: 'transparent', marginTop: 6 }} /></label><label className="kpi">Calidad<select value={qualityMode} onChange={(event) => setQualityMode(event.target.value)} style={{ width: '100%', border: 0, background: 'transparent', marginTop: 6 }}><option>DRAFT</option><option>STANDARD</option><option>MAX_QUALITY</option></select></label></div><button className="primary" disabled={busy || prompt.trim().length < 8}>{busy ? 'Guardando…' : 'Iniciar producción'}</button>{error ? <div className="error">{error}</div> : null}</form>
    </section>
    {result ? <section className="card" style={{ maxWidth: 900, margin: '20px auto' }}><div className="row"><div><p className="eyebrow">Producción persistente</p><h2>{result.brief.briefId}</h2></div><span className={`pill ${currentState === 'succeeded' ? 'good' : currentState === 'dead' ? 'bad' : 'warn'}`}>{label(currentState)}</span></div><div className="kpis"><div className="kpi"><span>Formato</span><strong>{result.brief.format}</strong></div><div className="kpi"><span>Duración</span><strong>{result.brief.durationSec}s</strong></div><div className="kpi"><span>Calidad</span><strong>{result.brief.qualityMode}</strong></div></div><p className="muted">Job: <code>{result.jobId}</code> · Canal: <code>{result.brief.channelKey}</code></p>{result.job?.error ? <p className="error">{result.job.error}</p> : null}{result.job?.productionRunId ? <p><Link className="run-link" href={`/videos/${result.job.productionRunId}`}>Abrir producción y revisión →</Link></p> : null}<p className="muted">{result.quote.note}</p><div className="list">{result.progress.map((stage) => <div className="list-item" key={stage}><span>{stage}</span><span className="pill info">registrado</span></div>)}<div className="list-item"><span>Estado del worker</span><span className={`pill ${currentState === 'succeeded' ? 'good' : currentState === 'dead' ? 'bad' : 'warn'}`}>{label(currentState)}</span></div></div></section> : null}
  </main></div>;
}
