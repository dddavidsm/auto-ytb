import { NextRequest, NextResponse } from 'next/server';
import { encryptChannelRefreshToken, currentSession, youtubeChannelOauthConfig } from '../../../../../lib/auth';
import { query } from '../../../../../lib/db';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const session = await currentSession();
  if (!session) return NextResponse.redirect(new URL('/login', request.url));
  const url = request.nextUrl;
  const state = url.searchParams.get('state') || '';
  const expected = request.cookies.get('auto_ytb_youtube_oauth_state')?.value || '';
  if (!state || state !== expected) return NextResponse.redirect(new URL('/channels?error=oauth_state', request.url));
  const { clientId, clientSecret, redirectUri } = youtubeChannelOauthConfig(request);
  const code = url.searchParams.get('code') || '';
  if (!clientId || !clientSecret || !code) return NextResponse.redirect(new URL('/channels?error=oauth_config', request.url));
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
  if (!tokenResponse.ok) return NextResponse.redirect(new URL('/channels?error=oauth_exchange', request.url));
  const tokens = await tokenResponse.json() as { access_token?: string; refresh_token?: string };
  if (!tokens.access_token || !tokens.refresh_token) return NextResponse.redirect(new URL('/channels?error=oauth_refresh', request.url));
  const channelResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true', { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!channelResponse.ok) return NextResponse.redirect(new URL('/channels?error=channel_lookup', request.url));
  const channels = await channelResponse.json() as { items?: Array<{ id?: string; snippet?: { title?: string; description?: string; country?: string } }> };
  const channel = channels.items?.[0];
  if (!channel?.id) return NextResponse.redirect(new URL('/channels?error=no_channel', request.url));
  const key = `youtube-${channel.id}`;
  const existing = await query<{ id: string }>('select id from channels where youtube_channel_id=$1 and is_owned=true limit 1', [channel.id]);
  const channelRows = existing[0] ? await query<{ id: string }>('update channels set title=$2,description=$3,country=$4,channel_key=coalesce(channel_key,$5),is_owned=true,lifecycle_state=\'ready\',automation_enabled=true,updated_at=now() where id=$1 returning id', [existing[0].id, channel.snippet?.title || key, channel.snippet?.description || '', channel.snippet?.country || null, key]) : await query<{ id: string }>(`insert into channels(youtube_channel_id,title,description,language,country,is_owned,channel_key,identity,voice_profile,autonomy_policy,library_policy,lifecycle_state,automation_enabled) values($1,$2,$3,'es',$4,true,$5,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'ready',true) returning id`, [channel.id, channel.snippet?.title || key, channel.snippet?.description || '', channel.snippet?.country || null, key]);
  const channelId = channelRows[0]?.id;
  if (!channelId) return NextResponse.redirect(new URL('/channels?error=channel_persist', request.url));
  await query(`insert into channel_connections(channel_id,provider,owner_email,refresh_token_ciphertext,metadata) values($1,'youtube',$2,$3,$4::jsonb) on conflict(channel_id,provider) do update set owner_email=excluded.owner_email,refresh_token_ciphertext=excluded.refresh_token_ciphertext,status='connected',metadata=excluded.metadata,updated_at=now()`, [channelId, session.email || '', encryptChannelRefreshToken(tokens.refresh_token), JSON.stringify({ youtubeChannelId: channel.id, title: channel.snippet?.title || key, connectedAt: new Date().toISOString() })]);
  const response = NextResponse.redirect(new URL('/channels?connected=youtube', request.url));
  response.cookies.set('auto_ytb_youtube_oauth_state', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return response;
}
