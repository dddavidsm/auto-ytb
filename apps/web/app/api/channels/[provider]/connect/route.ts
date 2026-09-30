import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { currentSession, publicAppOrigin } from '../../../../../lib/auth';

export const runtime = 'nodejs';

const configs: Record<string, { client: string; secret: string; scopes: string; authorize: string }> = {
  tiktok: { client: 'TIKTOK_CLIENT_KEY', secret: 'TIKTOK_CLIENT_SECRET', scopes: 'user.info.basic,video.upload,video.publish', authorize: 'https://www.tiktok.com/v2/auth/authorize/' },
  instagram: { client: 'META_APP_ID', secret: 'META_APP_SECRET', scopes: 'instagram_basic,instagram_content_publish,pages_show_list', authorize: 'https://www.facebook.com/v20.0/dialog/oauth' },
  facebook: { client: 'META_APP_ID', secret: 'META_APP_SECRET', scopes: 'pages_show_list,pages_read_engagement,pages_manage_posts,publish_video', authorize: 'https://www.facebook.com/v20.0/dialog/oauth' },
};

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const session = await currentSession(); if (!session) return NextResponse.redirect(new URL('/login', request.url));
  const provider = (await context.params).provider.toLowerCase(); const config = configs[provider];
  if (!config) return NextResponse.redirect(new URL('/channels?error=provider_unknown', request.url));
  const clientId = String(process.env[config.client] || '').trim(); const clientSecret = String(process.env[config.secret] || '').trim();
  if (!clientId || !clientSecret) return NextResponse.redirect(new URL(`/channels?error=${provider}_config`, request.url));
  const state = randomBytes(24).toString('base64url'); const redirectUri = `${publicAppOrigin(request)}/api/channels/${provider}/callback`;
  const params = new URLSearchParams({ client_key: clientId, client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: config.scopes, state });
  const response = NextResponse.redirect(`${config.authorize}?${params.toString()}`);
  response.cookies.set(`auto_ytb_${provider}_oauth_state`, state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 });
  return response;
}
