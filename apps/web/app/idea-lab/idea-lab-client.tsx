'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { IdeaLabMode } from '../../lib/idea-lab';

type Idea = { id: string; title: string; angle: string; hook: string; audience: string; niche: string; format: string; score: number; grade: string; status: string; risks: string[]; rationale: string[]; seriesProfile?: Record<string, unknown> | null; signals?: Record<string, any>; jobs?: Array<{ id: string; state: string; kind: string }> };
type ChatLine = { role: 'user' | 'assistant'; content: string };

const modes: Array<{ value: IdeaLabMode; label: string; hint: string }> = [
  { value: 'niches', label: 'Buscar nichos', hint: 'Ángulos con demanda y capacidad de serialización' },
  { value: 'ideas', label: 'Generar ideas', hint: 'Propuestas listas para convertir en un brief' },
  { value: 'kids_series', label: 'Series infantiles', hint: 'Personajes, temporadas y motor de episodios' },
  { value: 'education', label: 'Educativo', hint: 'Objetivo didáctico, edad y fuentes verificables' },
];

function normalize(raw: any): Idea {
  const lab = raw.signals?.ideaLab || {};
  return { ...raw, title: raw.title || lab.title || raw.canonical_name, hook: raw.hook || lab.hook || 'Promesa pendiente de definir', audience: raw.audience || lab.audience || 'Audiencia por validar', seriesProfile: raw.seriesProfile || lab.seriesProfile, risks: raw.risks || [], rationale: raw.rationale || lab.rationale || [], jobs: raw.jobs || [] };
}

export default function IdeaLabClient() {
  const [mode, setMode] = useState<IdeaLabMode>('ideas');
  const [brief, setBrief] = useState('');
  const [count, setCount] = useState('4');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [chat, setChat] = useState<Record<string, ChatLine[]>>({});
  const [message, setMessage] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState<string | null>(null);
  const [production, setProduction] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  async function loadIdeas() {
    const response = await fetch('/api/idea-lab', { cache: 'no-store' });
    if (!response.ok) return;
    const payload = await response.json();
    const loaded = (payload.ideas || []).map(normalize);
    setIdeas(loaded);
    setChat(Object.fromEntries(loaded.map((idea: Idea) => [idea.id, (idea.signals?.ideaLab?.chatHistory || []).map((line: any) => ({ role: line.role === 'assistant' ? 'assistant' : 'user', content: String(line.content || '') }))])));
  }

  useEffect(() => { void loadIdeas(); }, []);

  async function generate() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/idea-lab', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode, brief, count: Number(count), language: 'es' }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) setError(payload.error || 'No se pudieron generar propuestas.'); else setIdeas((payload.ideas || []).map(normalize));
    } catch { setError('No se pudo contactar con Idea Lab.'); }
    setBusy(false);
  }

  async function sendChat(idea: Idea) {
    const text = (message[idea.id] || '').trim();
    if (!text) return;
    setChatBusy(idea.id); setError('');
    setChat((current) => ({ ...current, [idea.id]: [...(current[idea.id] || []), { role: 'user', content: text }] }));
    setMessage((current) => ({ ...current, [idea.id]: '' }));
    try {
      const response = await fetch(`/api/idea-lab/${encodeURIComponent(idea.id)}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No se pudo guardar el feedback.');
      setIdeas((current) => current.map((item) => item.id === idea.id ? normalize(payload.idea) : item));
      setChat((current) => ({ ...current, [idea.id]: [...(current[idea.id] || []), { role: 'assistant', content: payload.assistant }] }));
    } catch (chatError) { setError(chatError instanceof Error ? chatError.message : 'No se pudo guardar el feedback.'); }
    setChatBusy(null);
  }

  async function startProduction(idea: Idea) {
    setProduction((current) => ({ ...current, [idea.id]: 'Encolando producción…' }));
    const response = await fetch('/api/production/brief', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ opportunityId: idea.id, prompt: `${idea.title}. ${idea.angle}`, format: idea.format, durationSec: idea.format === 'SHORT_VERTICAL' ? 60 : 180, qualityMode: 'MAX_QUALITY' }) });
    const payload = await response.json().catch(() => ({}));
    setProduction((current) => ({ ...current, [idea.id]: response.ok ? `Producción en cola · job ${payload.jobId}` : (payload.error || 'No se pudo iniciar') }));
  }

  return <><style>{`.idea-mode-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:18px}.idea-mode{border:1px solid var(--line);background:var(--surface-2);border-radius:14px;padding:13px;text-align:left;cursor:pointer;color:var(--text)}.idea-mode strong,.idea-mode span{display:block}.idea-mode strong{font-size:13px}.idea-mode span{font-size:11px;color:var(--muted);margin-top:5px;line-height:1.35}.idea-mode.selected{border-color:var(--blue);background:var(--blue-2)}.idea-list{display:grid;gap:12px}.idea-card h3{font-size:18px;margin:10px 0 5px}.idea-card p{font-size:13px;line-height:1.5}.idea-actions{display:flex;align-items:center;flex-wrap:wrap;gap:9px;margin-top:16px}.idea-actions .primary{padding:9px 12px}.idea-chat{display:grid;gap:10px;border-top:1px solid var(--line);margin-top:16px;padding-top:14px}.chat-log{display:grid;gap:8px;max-height:280px;overflow:auto}.chat-line{display:grid;gap:3px;padding:10px 12px;border-radius:12px;background:var(--surface-2);font-size:13px}.chat-line.user{background:var(--blue-2)}.chat-line strong{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}.series-box{display:grid;gap:5px;padding:12px;background:var(--green-bg);border-radius:12px;font-size:12px}.series-box span{color:var(--green)}@media(max-width:820px){.idea-mode-grid{grid-template-columns:1fr 1fr}}`}</style><div className="content"><header className="topbar"><div><p className="eyebrow">Creative intelligence</p><h1>Idea Lab</h1></div><Link href="/" className="pill info">← Portfolio</Link></header><main className="main">
    <section className="card" style={{ maxWidth: 1100, margin: '0 auto' }}><div className="section-head"><div><p className="eyebrow">De la señal al vídeo</p><h2>Encuentra una dirección y llévala a producción</h2></div><span className="pill good">Persistente · conectado al worker</span></div><p className="muted">Genera nichos, ideas, series infantiles o conceptos educativos. Después puedes pedir cambios, otra versión o investigación de recursos desde el chat de cada propuesta.</p>
      <div className="idea-mode-grid">{modes.map((item) => <button type="button" key={item.value} className={`idea-mode ${mode === item.value ? 'selected' : ''}`} onClick={() => setMode(item.value)}><strong>{item.label}</strong><span>{item.hint}</span></button>)}</div>
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}><textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={3} placeholder={mode === 'kids_series' ? 'Ej.: una serie de aventuras para enseñar ciencia a niños de 6 a 9 años…' : 'Describe tema, audiencia, país, estilo o restricción que quieras explorar…'} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 14, padding: 14, resize: 'vertical' }} /><div className="row"><label className="fine">Número de propuestas <select value={count} onChange={(event) => setCount(event.target.value)} style={{ marginLeft: 8, padding: 8, border: '1px solid var(--line)', borderRadius: 8 }}><option>3</option><option>4</option><option>6</option><option>8</option></select></label><button className="primary" type="button" onClick={() => void generate()} disabled={busy}>{busy ? 'Analizando…' : 'Generar propuestas'}</button></div></div>{error ? <div className="error" style={{ marginTop: 12 }}>{error}</div> : null}</section>

    <section className="section" style={{ maxWidth: 1100, marginLeft: 'auto', marginRight: 'auto' }}><div className="section-head"><div><p className="eyebrow">Opportunity backlog</p><h2>Propuestas guardadas</h2></div><span className="fine">Cada tarjeta puede editarse, investigarse y producirse</span></div>{ideas.length ? <div className="idea-list">{ideas.map((idea) => <article className="card idea-card" key={idea.id}><div className="row"><div><span className="pill info">{idea.format === 'SHORT_VERTICAL' ? 'Short vertical' : 'Long horizontal'}</span><h3>{idea.title}</h3><div className="meta">{idea.niche} · {idea.audience}</div></div><div style={{ textAlign: 'right' }}><span className="pill good">{idea.grade} · {Math.round(Number(idea.score))}/100</span><div className="fine" style={{ marginTop: 6 }}>{idea.status}</div></div></div><p><strong>Hook:</strong> {idea.hook}</p><p className="muted">{idea.angle}</p>{idea.seriesProfile ? <div className="series-box"><strong>Motor de serie</strong><span>{String(idea.seriesProfile.ageRange || '')} · {String(idea.seriesProfile.learningArea || '')}</span><span>{String(idea.seriesProfile.episodeEngine || '')}</span></div> : null}<div className="idea-actions"><button className="primary" type="button" onClick={() => void startProduction(idea)}>Empezar producción</button><button type="button" className="pill info" onClick={() => setOpenId(openId === idea.id ? null : idea.id)}>Abrir chat editorial</button>{production[idea.id] ? <span className="fine">{production[idea.id]}</span> : null}</div>{openId === idea.id ? <div className="idea-chat"><div className="chat-log">{(chat[idea.id] || []).map((line, index) => <div className={`chat-line ${line.role}`} key={`${line.role}-${index}`}><strong>{line.role === 'user' ? 'Tú' : 'Idea Lab'}</strong><span>{line.content}</span></div>)}{!(chat[idea.id] || []).length ? <div className="empty">Prueba: “cambia la audiencia a 8-12 años”, “regenera el hook” o “busca recursos y fuentes”.</div> : null}</div><div className="row"><input value={message[idea.id] || ''} onChange={(event) => setMessage((current) => ({ ...current, [idea.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendChat(idea); } }} placeholder="¿Qué está mal o qué quieres cambiar?" style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 10, padding: 11 }} /><button className="primary" type="button" disabled={chatBusy === idea.id} onClick={() => void sendChat(idea)}>{chatBusy === idea.id ? 'Guardando…' : 'Enviar'}</button></div></div> : null}</article>)}</div> : <div className="card empty">Todavía no hay propuestas. Elige un modo y genera la primera tanda.</div>}</section>
    <section className="section" style={{ maxWidth: 1100, marginLeft: 'auto', marginRight: 'auto' }}><div className="card"><p className="eyebrow">Flujo recomendado</p><div className="pipeline"><div className="pipe-step"><strong>01 · Explorar</strong><span>Nicho o audiencia</span></div><div className="pipe-step"><strong>02 · Conversar</strong><span>Feedback editorial</span></div><div className="pipe-step"><strong>03 · Producir</strong><span>Job persistente</span></div><div className="pipe-step"><strong>04 · Revisar</strong><span>Vídeo y QA</span></div></div><p className="fine">Las producciones iniciadas aquí aparecen en <Link className="run-link" href="/">Portfolio</Link> y mantienen la oportunidad original para que el aprendizaje quede asociado.</p></div></section>
  </main></div></>;
}
