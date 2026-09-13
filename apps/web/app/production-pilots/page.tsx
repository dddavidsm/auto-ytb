import Link from 'next/link';
import { requireSession } from '../../lib/auth';
import { loadPilotRuns } from '../../lib/pilot-data';

export const dynamic = 'force-dynamic';
const money = (value: unknown) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value || 0));
const stateClass = (value: unknown) => { const state = String(value || '').toLowerCase(); return state.includes('complete') ? 'good' : state.includes('fail') || state.includes('block') ? 'bad' : state.includes('partial') || state.includes('running') ? 'warn' : 'info'; };

export default async function ProductionPilotsPage() {
  await requireSession();
  const runs = await loadPilotRuns();
  return <div className="content"><header className="topbar"><div><p className="eyebrow">Real production</p><h1>Pilot runs</h1></div><Link href="/" className="pill info">← Portfolio</Link></header><main className="main">
    <section className="section-head"><div><p className="eyebrow">Durable runs</p><h2>Producciones auditables</h2></div><span className="fine">Persisted · resumable · no publish</span></section>
    <div className="cards">{runs.length ? runs.map((item: any) => { const run = item.run; const finalArtifact = item.artifacts.find((artifact: any) => artifact.artifactId === 'final-video'); return <article className="card" key={run.id}><div className="row"><div><h3>{run.id}</h3><div className="meta">{run.format} · {run.mode} · {new Date(run.createdAt).toLocaleString('en-GB')}</div></div><span className={`pill ${stateClass(run.status)}`}>{run.status}</span></div><div className="kpis"><div className="kpi"><span>Stage</span><strong>{run.currentStage || '—'}</strong></div><div className="kpi"><span>Coste</span><strong>{money(run.actualCost)} / {money(run.budget)}</strong></div><div className="kpi"><span>Scenes</span><strong>{item.subtasks.filter((task: any) => task.sceneId).length}</strong></div></div><Link href={`/production-pilots/${run.id}`} className="primary" style={{ display: 'inline-block', marginTop: 14 }}>Abrir revisión</Link>{finalArtifact ? <div className="fine" style={{ marginTop: 10 }}>RENDER disponible · {Math.round(finalArtifact.size / 1024)} KB</div> : null}</article>; }) : <div className="card empty">No hay pilot runs persistidos todavía. Ejecuta <code>npm run production:pilot</code> para crear uno local.</div>}</div>
  </main></div>;
}
