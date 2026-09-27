import Link from 'next/link';
import { requireSession } from '../../lib/auth';
import { loadGalleryRuns } from '../../lib/data';

export const dynamic = 'force-dynamic';

const styles = `.gallery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.gallery-player{border-radius:16px;overflow:hidden;aspect-ratio:16/9;display:grid;place-items:center}.gallery-player video{width:100%;height:100%;object-fit:contain;background:#111}.gallery-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:16px}.gallery-stats div{background:var(--surface-2);border-radius:10px;padding:9px}.gallery-stats span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase}.gallery-stats strong{display:block;font-size:12px;margin-top:4px;word-break:break-word}.gallery-actions{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px}@media(max-width:820px){.gallery-grid{grid-template-columns:1fr}.gallery-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}`;

function editoriallyConsistent(run: any) {
  let metadata: any = run.metadata ?? {};
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
  }
  const topic = String(run.working_title || run.premise || '').toLowerCase();
  const selected = Array.isArray(metadata.sourceDiscovery?.selected) ? metadata.sourceDiscovery.selected : [];
  if (!selected.length) return true;
  const sourceText = selected.map((item: any) => `${item.title ?? ''} ${item.sourceUrl ?? ''}`).join(' ').toLowerCase();
  if (/solar farm|solar panel|photovoltaic|solar power/.test(topic)) {
    return /solar|photovoltaic|panel/.test(sourceText) && !/wind turbine|wind farm|wind energy/.test(sourceText);
  }
  if (/wind farm|wind turbine|wind energy/.test(topic)) {
    return /wind turbine|wind farm|wind energy/.test(sourceText) && !/plane|aircraft|airliner|jet|airport|person|people|hiker|train|railway/.test(sourceText);
  }
  return true;
}

export default async function GalleryPage() {
  await requireSession();
  const runs = (await loadGalleryRuns()).filter(editoriallyConsistent);
  return (
    <>
      <style>{styles}</style>
      <div className="content">
        <header className="topbar"><div><p className="eyebrow">Video library</p><h1>Galería de vídeos</h1></div><Link href="/" className="pill info">← Portfolio</Link></header>
        <main className="main">
          <section className="section-head"><div><p className="eyebrow">Resultados visibles</p><h2>Vídeos generados</h2></div><Link href="/idea-lab" className="primary">Crear otra idea</Link></section>
          <p className="muted">Esta galería solo lee producciones persistidas con un render real. No contiene demos, diapositivas ni sustitutos visuales.</p>
          {runs.length ? <div className="gallery-grid">{runs.map((run: any) => {
            const metadata = run.metadata ?? {};
            const renderUri = String(metadata.renderUri ?? '');
            const hasRemote = Boolean(metadata.remoteMediaKey);
            const inspection = metadata.finalInspection ?? {};
            const seconds = inspection.durationSeconds ?? metadata.durationSeconds ?? metadata.targetDurationSec ?? metadata.script?.targetDurationSec ?? '—';
            const frame = metadata.frame ?? inspection;
            const resolution = frame.width && frame.height ? `${frame.width} × ${frame.height}` : metadata.resolution ?? 'Ver metadatos';
            const qaScore = inspection.score ?? run.qa_score;
            const isReady = ['READY_FOR_REVIEW','COMPLETED','SUCCEEDED'].includes(String(run.state).toUpperCase());
            return <article className="card gallery-card" key={run.id}>
              <div className="gallery-player" style={{ background: '#111' }}>{renderUri || hasRemote ? <video controls preload="metadata" src={`/api/videos/${run.id}/stream`} /> : <div className="muted">Render no disponible</div>}</div>
              <div className="row" style={{ marginTop: 14 }}><div><h3>{run.working_title || run.angle || run.id}</h3><div className="meta">{run.premise || 'Producción persistida'}</div></div><span className={`pill ${isReady ? 'good' : 'warn'}`}>{isReady ? 'LISTO PARA REVISAR' : String(run.state || 'PENDIENTE')}</span></div>
              <div className="gallery-stats"><div><span>Estado</span><strong>{run.state}</strong></div><div><span>Formato</span><strong>{run.format}</strong></div><div><span>Duración</span><strong>{seconds}{seconds === '—' ? '' : ' s'}</strong></div><div><span>Resolución</span><strong>{resolution}</strong></div><div><span>Vídeo real</span><strong>{run.video_asset_count ?? 0} clips</strong></div><div><span>Recursos</span><strong>{run.asset_count ?? 0}</strong></div><div><span>Proveedor</span><strong>{run.providers || 'No indicado'}</strong></div><div><span>Coste</span><strong>{run.total_cost_usd == null ? '—' : `$${Number(run.total_cost_usd).toFixed(2)}`}</strong></div><div><span>Publicación</span><strong>{run.publication_state || 'NO PUBLICADO'}</strong></div><div><span>QA</span><strong>{qaScore == null ? '—' : `${Math.round(Number(qaScore))}/100`}</strong></div></div>
              <div className="gallery-actions"><Link className="run-link" href={`/videos/${run.id}`}>Abrir revisión →</Link><span className="fine">ID: {run.id}</span></div>
            </article>;
          })}</div> : <section className="card empty"><h3>Aún no hay vídeos finales en la galería</h3><p>Las producciones solo aparecerán cuando el proveedor entregue clips de vídeo, la narración y el control de calidad los hayan validado.</p><Link href="/create" className="primary">Crear producción real</Link></section>}
        </main>
      </div>
    </>
  );
}
