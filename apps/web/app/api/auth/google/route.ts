import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { controlGoogleConfig, googleOauthStateCookieName } from '../../../../lib/auth';

export const runtime='nodejs';

export async function GET(){
  const {clientId,redirectUri}=controlGoogleConfig();
  if(!clientId)return NextResponse.json({ok:false,error:'Google control-plane login is not configured'},{status:503});
  const state=randomBytes(32).toString('base64url');
  const params=new URLSearchParams({
    client_id:clientId,
    redirect_uri:redirectUri,
    response_type:'code',
    scope:'openid email profile',
    access_type:'online',
    prompt:'select_account',
    state,
  });
  const response=NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  response.cookies.set(googleOauthStateCookieName,state,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:600});
  return response;
}
