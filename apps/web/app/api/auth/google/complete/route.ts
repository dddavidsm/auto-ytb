import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, readGoogleCompletionTicket, sessionCookieName, sessionCookieOptions, publicAppOrigin } from '../../../../../lib/auth';

export const runtime='nodejs';

export async function GET(request:NextRequest){
  const ticket=request.nextUrl.searchParams.get('ticket')||'';
  const payload=readGoogleCompletionTicket(ticket);
  if(!payload){
    const url=new URL('/login',publicAppOrigin(request));
    url.searchParams.set('error','oauth_token');
    return NextResponse.redirect(url);
  }
  const response=NextResponse.redirect(new URL('/',publicAppOrigin(request)));
  response.cookies.set(sessionCookieName,createSessionToken({email:payload.email,auth:'google'}),sessionCookieOptions());
  return response;
}
