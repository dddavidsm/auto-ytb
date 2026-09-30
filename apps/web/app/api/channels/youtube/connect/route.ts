import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { currentSession, youtubeChannelOauthConfig } from '../../../../../lib/auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.redirect(new URL('/login', request.url));
  const { clientId, redirectUri } = youtubeChannelOauthConfig(request);
  if (!clientId) return NextResponse.redirect(new URL('/channels?error=oauth_config', request.url));
  const state = randomBytes(24).toString('base64url');
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', access_type: 'offline', prompt: 'consent', scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly', state });
  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  response.cookies.set('auto_ytb_youtube_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 });
  return response;
}
