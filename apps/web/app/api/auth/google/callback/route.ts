import { NextRequest, NextResponse } from 'next/server';
import { controlGoogleConfig, googleOauthStateCookieName, isAllowedControlEmail, setSessionCookie } from '../../../../../lib/auth';

export const runtime='nodejs';

function loginError(request:NextRequest,reason:string){
  const url=new URL('/login',request.url);url.searchParams.set('error',reason);return NextResponse.redirect(url);
}

export async function GET(request:NextRequest){
  const code=request.nextUrl.searchParams.get('code')||'';
  const state=request.nextUrl.searchParams.get('state')||'';
  const expected=request.cookies.get(googleOauthStateCookieName)?.value||'';
  if(!code||!state||!expected||state!==expected)return loginError(request,'oauth_state');

  const {clientId,clientSecret,redirectUri}=controlGoogleConfig();
  if(!clientId||!clientSecret)return loginError(request,'oauth_config');

  const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code'}),
    cache:'no-store',
  });
  if(!tokenResponse.ok)return loginError(request,'oauth_exchange');
  const tokens=await tokenResponse.json() as {access_token?:string};
  if(!tokens.access_token)return loginError(request,'oauth_token');

  const profileResponse=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{
    headers:{authorization:`Bearer ${tokens.access_token}`},cache:'no-store',
  });
  if(!profileResponse.ok)return loginError(request,'profile');
  const profile=await profileResponse.json() as {email?:string;email_verified?:boolean;verified_email?:boolean};
  const email=String(profile.email||'').trim().toLowerCase();
  const verified=profile.email_verified!==false&&profile.verified_email!==false;
  if(!verified||!email||!isAllowedControlEmail(email))return loginError(request,'not_allowed');

  await setSessionCookie({email,auth:'google'});
  const response=NextResponse.redirect(new URL('/',request.url));
  response.cookies.set(googleOauthStateCookieName,'',{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:0});
  return response;
}
