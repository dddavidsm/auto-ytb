import Link from 'next/link';
import { requireSession } from '../../lib/auth';
import { query } from '../../lib/db';

export const dynamic = 'force-dynamic';

export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  await requireSession();
  const params = await searchParams;
  const channels = await query<any>(`select c.id,c.title,c.youtube_channel_id,c.channel_key,c.lifecycle_state,cc.status as connection_status,cc.updated_at as connected_at from channels c left join channel_connections cc on cc.channel_id=c.id and cc.provider='youtube' where c.is_owned=true order by c.updated_at desc`);
  const error = params.error ? ({ oauth_config: 'Faltan las credenciales OAuth de Google en el worker.', oauth_state: 'La autorización caducó; vuelve a intentarlo.', oauth_exchange: 'Google rechazó el intercambio OAuth.', oauth_refresh: 'Google no devolvió permiso renovable.', channel_lookup: 'No se pudo leer tu canal de YouTube.', no_channel: 'La cuenta no tiene un canal de YouTube disponible.', channel_persist: 'No se pudo guardar el canal.' } as Record<string, string>)[params.error] || 'No se pudo conectar el canal.' : '';
  return <div className="content"><header className="topbar"><div><p className="eyebrow">Distribución</p><h1>Canales conectados</h1><p className="muted">Conecta YouTube con OAuth oficial; el token se guarda cifrado y nunca se muestra en la interfaz.</p></div><Link className="pill info" href="/">← Inicio</Link></header><main className="main"><section className="card channel-connect-card"><h2>YouTube</h2><p className="muted">El permiso se limita a subir vídeos y consultar el canal seleccionado. TikTok queda separado y solo se habilita cuando exista una integración válida.</p><a className="primary" href="/api/channels/youtube/connect">Conectar canal de YouTube con Google</a>{params.connected ? <p className="success">Canal conectado correctamente.</p> : null}{error ? <p className="error">{error}</p> : null}</section><section className="card"><h2>Tus canales</h2>{channels.length ? <div className="channel-list">{channels.map((channel: any) => <div className="list-item" key={channel.id}><div><strong>{channel.title}</strong><div className="fine">{channel.youtube_channel_id || channel.channel_key}</div></div><span className={`pill ${channel.connection_status === 'connected' ? 'good' : 'warn'}`}>{channel.connection_status === 'connected' ? 'Conectado' : 'Pendiente'}</span></div>)}</div> : <p className="muted">Todavía no hay canales propios conectados.</p>}</section></main></div>;
}
