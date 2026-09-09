import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, readGoogleCompletionTicket, sessionCookieName, sessionCookieOptions } from '../../../../../lib/auth';

export const runtime='nodejs';

export async function GET(request:NextRequest){
  const ticket=request.nextUrl.searchParams.get('ticket')||'';
  const payload=readGoogleCompletionTicket(ticket);
  if(!payload){
    const url=new URL('/login',request.url);
    url.searchParams.set('error','oauth_token');
    return NextResponse.redirect(url);
  }
  const response=NextResponse.redirect(new URL('/',request.url));
  response.cookies.set(sessionCookieName,createSessionToken({email:payload.email,auth:'google'}),sessionCookieOptions());
  return response;
}
