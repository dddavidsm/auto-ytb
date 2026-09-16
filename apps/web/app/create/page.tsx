'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

type Result = { brief: { briefId: string; format: string; durationSec: number; qualityMode: string }; quote: { note: string; knownPaidCostUsd: number }; progress: string[] };

export default function CreatePage() {
  const [prompt, setPrompt] = useState('');
  const [durationSec, setDurationSec] = useState('180');
  const [qualityMode, setQualityMode] = useState('MAX_QUALITY');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setResult(null);
    const response = await fetch('/api/production/brief', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, durationSec: Number(durationSec), qualityMode }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'No se pudo aceptar el proyecto.');
    else setResult(payload as Result);
    setBusy(false);
  }

  return <div className="content"><header className="topbar"><div><p className="eyebrow">One-prompt studio</p><h1>Crear un vídeo</h1></div><Link href="/" className="pill info">← Portfolio</Link></header><main className="main">
    <section className="card" style={{ maxWidth: 900, margin: '20px auto' }}><p className="eyebrow">Universal production graph</p><h2>¿Qué quieres crear?</h2><p className="muted">Describe el resultado. AUTO-YTB inferirá formato, ruta visual y etapas de producción; podrás revisar antes de publicar.</p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 20 }}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Crea un documental de 3 minutos sobre…" rows={6} required style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 14, padding: 14, resize: 'vertical' }} /><div className="kpis"><label className="kpi">Duración (segundos)<input value={durationSec} onChange={(event) => setDurationSec(event.target.value)} type="number" min="10" max="3600" style={{ width: '100%', border: 0, background: 'transparent', marginTop: 6 }} /></label><label className="kpi">Calidad<select value={qualityMode} onChange={(event) => setQualityMode(event.target.value)} style={{ width: '100%', border: 0, background: 'transparent', marginTop: 6 }}><option>DRAFT</option><option>STANDARD</option><option>MAX_QUALITY</option></select></label></div><button className="primary" disabled={busy || prompt.trim().length < 8}>{busy ? 'Preparando…' : 'Iniciar producción'}</button>{error ? <div className="error">{error}</div> : null}</form>
    </section>
    {result ? <section className="card" style={{ maxWidth: 900, margin: '20px auto' }}><div className="row"><div><p className="eyebrow">Production brief</p><h2>{result.brief.briefId}</h2></div><span className="pill good">{result.brief.format}</span></div><div className="kpis"><div className="kpi"><span>Duración</span><strong>{result.brief.durationSec}s</strong></div><div className="kpi"><span>Calidad</span><strong>{result.brief.qualityMode}</strong></div><div className="kpi"><span>Coste conocido</span><strong>${result.quote.knownPaidCostUsd.toFixed(2)}</strong></div></div><p className="muted">{result.quote.note}</p><div className="list">{result.progress.map((stage) => <div className="list-item" key={stage}><span>{stage}</span><span className="pill good">ready</span></div>)}</div></section> : null}
  </main></div>;
}
