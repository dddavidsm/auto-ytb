'use client';

import { useState } from 'react';

export default function GalleryActions({ id, publicationId }: { id: string; publicationId?: string | null }) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  async function remove() {
    if (!window.confirm('¿Ocultar este vídeo de la galería? El render queda recuperable en el almacenamiento.')) return;
    setBusy('delete'); setMessage('');
    const response = await fetch(`/api/videos/${encodeURIComponent(id)}/actions`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(payload.error || 'No se pudo ocultar el vídeo.'); else window.location.reload();
    setBusy('');
  }
  async function publish(platform: 'youtube' | 'tiktok') {
    setBusy(platform); setMessage('');
    const response = await fetch(`/api/videos/${encodeURIComponent(id)}/actions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ platform }) });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? (payload.alreadyUploaded ? `${platform === 'youtube' ? 'YouTube' : 'TikTok'}: ya estaba subido.` : `${platform === 'youtube' ? 'YouTube' : 'TikTok'}: ${payload.message || 'subida encolada.'}`) : (payload.error || 'No se pudo encolar la subida.'));
    setBusy('');
  }
  return <div className="gallery-actions-stack">
    <a className="pill info" href={`/api/videos/${encodeURIComponent(id)}/stream?download=1`}>Descargar MP4</a>
    <button className="pill info" type="button" disabled={Boolean(busy)} onClick={() => void publish('youtube')}>{busy === 'youtube' ? 'Enviando…' : 'Subir a YouTube'}</button>
    <button className="pill info" type="button" disabled={Boolean(busy) || !publicationId} onClick={() => void publish('tiktok')}>{busy === 'tiktok' ? 'Enviando…' : 'Subir a TikTok'}</button>
    <button className="pill danger" type="button" disabled={Boolean(busy)} onClick={() => void remove()}>{busy === 'delete' ? 'Ocultando…' : 'Borrar de galería'}</button>
    {message ? <span className="fine gallery-action-message">{message}</span> : null}
    {!publicationId ? <span className="fine">Conecta un canal para habilitar publicación directa.</span> : null}
  </div>;
}
