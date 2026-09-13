'use client';

import { useState } from 'react';

type ReferenceVideo = { id: string; title: string; outlier_score?: number; views?: number };

export default function ReferencePackSelector({ videos }: { videos: ReferenceVideo[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length >= 7 ? current : [...current, id]);
  const save = async () => {
    if (selected.length < 3) { setStatus('Selecciona entre 3 y 7 referencias.'); return; }
    setStatus('Guardando pack…');
    const response = await fetch('/api/reference-packs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ videoIds: selected, niche: 'ui-selection' }) });
    const body = await response.json().catch(() => ({}));
    setStatus(response.ok ? `Pack guardado (${body.count ?? selected.length} referencias).` : body.error ?? 'No se pudo guardar el pack.');
  };
  return <div className="card"><div className="row"><div><p className="eyebrow">Selection</p><h3>Reference Pack · {selected.length}/7</h3></div><span className="fine">mínimo 3</span></div><div className="list">{videos.slice(0, 100).map((video) => <label className="list-item" key={video.id}><span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><input type="checkbox" checked={selected.includes(video.id)} onChange={() => toggle(video.id)} /><span>{video.title}</span></span><span className="pill info">{Number(video.outlier_score || 0).toFixed(0)}</span></label>)}</div><div className="row" style={{ marginTop: 12 }}><span className="fine">Mezcla roles del pack: framing, title grammar, thumb, hook, pacing y visual language.</span><button className="primary" type="button" disabled={selected.length < 3} onClick={save}>Guardar pack</button></div>{status ? <div className="fine" style={{ marginTop: 8 }}>{status}</div> : null}</div>;
}
