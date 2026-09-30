import { NextRequest, NextResponse } from 'next/server';
import { encryptChannelRefreshToken, currentSession, publicAppOrigin } from '../../../../../lib/auth';
import { query } from '../../../../../lib/db';

export const runtime = 'nodejs';

const configs: Record<string, { client: string; secret: string }> = { tiktok: { client: 'TIKTOK_CLIENT_KEY', secret: 'TIKTOK_CLIENT_SECRET' }, instagram: { client: 'META_APP_ID', secret: 'META_APP_SECRET' }, facebook: { client: 'META_APP_ID', secret: 'META_APP_SECRET' } };

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const session = await currentSession(); if (!session) return NextResponse.redirect(new URL('/login', request.url));
  const provider = (await context.params).provider.toLowerCase(); const config = configs[provider]; const url = request.nextUrl; const state = url.searchParams.get('state') || ''; const expected = request.cookies.get(`auto_ytb_${provider}_oauth_state`)?.value || '';
  if (!config || !state || state !== expected) return NextResponse.redirect(new URL('/channels?error=oauth_state', request.url));
  const clientId = String(process.env[config.client] || '').trim(); const clientSecret = String(process.env[config.secret] || '').trim(); const code = url.searchParams.get('code') || ''; const redirectUri = `${publicAppOrigin(request)}/api/channels/${provider}/callback`;
  if (!clientId || !clientSecret || !code) return NextResponse.redirect(new URL(`/channels?error=${provider}_config`, request.url));
  const form = new URLSearchParams({ client_key: clientId, client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri });
  const tokenUrl = provider === 'tiktok' ? 'https://open.tiktokapis.com/v2/oauth/token/' : 'https://graph.facebook.com/v20.0/oauth/access_token';
  const tokenResponse = await fetch(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
  if (!tokenResponse.ok) return NextResponse.redirect(new URL('/channels?error=oauth_exchange', request.url));
  const token = await tokenResponse.json() as { access_token?: string; refresh_token?: string; open_id?: string; user_id?: string };
  if (!token.access_token) return NextResponse.redirect(new URL('/channels?error=oauth_token', request.url));
  const externalId = String(token.open_id || token.user_id || `${provider}-${Date.now()}`); const channelKey = `${provider}-${externalId}`;
  const channelRows = await query<{ id: string }>(`insert into channels(title,channel_key,language,is_owned,lifecycle_state,automation_enabled,identity,voice_profile,autonomy_policy,library_policy) values($1,$2,'es',true,'ready',false,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb) on conflict (channel_key) where channel_key is not null and is_owned=true do update set updated_at=now() returning id`, [`${provider} · cuenta conectada`, channelKey]);
  const channelId = channelRows[0]?.id; if (!channelId) return NextResponse.redirect(new URL('/channels?error=channel_persist', request.url));
  await query(`insert into channel_connections(channel_id,provider,owner_email,refresh_token_ciphertext,metadata) values($1,$2,$3,$4,$5::jsonb) on conflict(channel_id,provider) do update set owner_email=excluded.owner_email,refresh_token_ciphertext=excluded.refresh_token_ciphertext,status='connected',metadata=excluded.metadata,updated_at=now()`, [channelId, provider, session.email || '', encryptChannelRefreshToken(token.refresh_token || token.access_token), JSON.stringify({ externalId, connectedAt: new Date().toISOString(), tokenType: token.refresh_token ? 'refresh_token' : 'access_token' })]);
  const response = NextResponse.redirect(new URL(`/channels?connected=${provider}`, request.url)); response.cookies.set(`auto_ytb_${provider}_oauth_state`, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 }); return response;
}
