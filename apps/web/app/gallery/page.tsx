import Link from 'next/link';
import { requireSession } from '../../lib/auth';

export const dynamic = 'force-dynamic';

type GalleryVideo = {
  id: string;
  title: string;
  concept: string;
  format: string;
  duration: string;
  resolution: string;
  audio: string;
  size: string;
  provider: string;
  cost: string;
  state: string;
  publication: string;
  accent: string;
  source?: string;
  availability?: 'ready' | 'blocked';
};

const demos: GalleryVideo[] = [
  { id: 'idea-lab-demo-01', title: 'Ciencia visual para familias', concept: 'Explicación visual breve para aprender jugando', format: 'LONG_HORIZONTAL', duration: '12 s', resolution: '1280 × 720', audio: 'AAC · 48 kHz · mono', size: '187 KB', provider: 'ffmpeg-local', cost: '$0.00', state: 'READY_FOR_REVIEW', publication: 'NO PUBLICADO', accent: '#185d68' },
  { id: 'idea-lab-demo-02', title: 'Serie infantil educativa', concept: 'Piloto de una serie original para niños', format: 'LONG_HORIZONTAL', duration: '12 s', resolution: '1280 × 720', audio: 'AAC · 48 kHz · mono', size: '185 KB', provider: 'ffmpeg-local', cost: '$0.00', state: 'READY_FOR_REVIEW', publication: 'NO PUBLICADO', accent: '#5a3025' },
];

const production: GalleryVideo[] = [
  { id: 'battery-grid-2026', title: 'Baterías: la red que viene', concept: 'Pendiente de generación de vídeo real; no se presenta como entrega final', format: 'VÍDEO GENERATIVO · PENDIENTE', duration: '10 s objetivo', resolution: 'Pendiente del proveedor', audio: 'Pendiente de generación', size: 'No entregable', provider: 'Proveedor de vídeo requerido', cost: '20 créditos mínimos', state: 'WAITING_FOR_VIDEO_PROVIDER', publication: 'NO PUBLICADO', accent: '#19435b', source: 'IEA Global Energy Review 2026', availability: 'blocked' },
  { id: 'misterio-rayos-x', title: 'El misterio de los rayos X', concept: 'Pendiente de generación de vídeo real; no se presenta como entrega final', format: 'VÍDEO GENERATIVO · PENDIENTE', duration: '10 s objetivo', resolution: 'Pendiente del proveedor', audio: 'Pendiente de generación', size: 'No entregable', provider: 'Proveedor de vídeo requerido', cost: '20 créditos mínimos', state: 'WAITING_FOR_VIDEO_PROVIDER', publication: 'NO PUBLICADO', accent: '#34245f', source: 'NASA Chandra · septiembre de 2026', availability: 'blocked' },
];

const videos: GalleryVideo[] = [...production, ...demos];

const styles = `.gallery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.gallery-player{border-radius:16px;overflow:hidden;aspect-ratio:16/9;display:grid;place-items:center}.gallery-player video{width:100%;height:100%;object-fit:contain;background:#111}.gallery-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:16px}.gallery-stats div{background:var(--surface-2);border-radius:10px;padding:9px}.gallery-stats span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase}.gallery-stats strong{display:block;font-size:12px;margin-top:4px;word-break:break-word}.gallery-actions{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px}@media(max-width:820px){.gallery-grid{grid-template-columns:1fr}.gallery-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}`;

export default async function GalleryPage() {
  await requireSession();
  return (
    <>
      <style>{styles}</style>
      <div className="content">
        <header className="topbar"><div><p className="eyebrow">Video library</p><h1>Galería de vídeos</h1></div><Link href="/" className="pill info">← Portfolio</Link></header>
        <main className="main">
          <section className="section-head"><div><p className="eyebrow">Resultados visibles</p><h2>Vídeos generados</h2></div><Link href="/idea-lab" className="primary">Crear otra idea</Link></section>
          <p className="muted">Aquí solo se marcarán como entregables los vídeos generados por un proveedor real. Los proyectos sin créditos o sin render válido quedan claramente pendientes.</p>
          <div className="gallery-grid">
            {videos.map((video) => {
              const isBlocked = video.availability === 'blocked';
              return <article className="card gallery-card" key={video.id}>
                <div className="gallery-player" style={{ background: video.accent }}>{isBlocked ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>Render bloqueado hasta disponer de créditos de vídeo generativo.</div> : <video controls preload="metadata" src={`/api/demo/${video.id}.mp4`} />}</div>
                <div className="row" style={{ marginTop: 14 }}><div><h3>{video.title}</h3><div className="meta">{video.concept}</div></div><span className={`pill ${isBlocked ? 'warn' : video.source ? 'good' : 'warn'}`}>{isBlocked ? 'REQUIERE CRÉDITOS' : video.source ? 'LISTO PARA SUBIR' : 'DEMO'}</span></div>
                <div className="gallery-stats"><div><span>Estado</span><strong>{video.state}</strong></div><div><span>Formato</span><strong>{video.format}</strong></div><div><span>Duración</span><strong>{video.duration}</strong></div><div><span>Resolución</span><strong>{video.resolution}</strong></div><div><span>Audio</span><strong>{video.audio}</strong></div><div><span>Tamaño</span><strong>{video.size}</strong></div><div><span>Proveedor</span><strong>{video.provider}</strong></div><div><span>Coste</span><strong>{video.cost}</strong></div><div><span>Publicación</span><strong>{video.publication}</strong></div>{video.source ? <div><span>Fuente</span><strong>{video.source}</strong></div> : null}</div>
                <div className="gallery-actions"><span className={`pill ${isBlocked ? 'warn' : 'good'}`}>{isBlocked ? 'No entregable' : 'Reproducible'}</span><span className="fine">ID: {video.id}</span></div>
              </article>;
            })}
          </div>
        </main>
      </div>
    </>
  );
}
