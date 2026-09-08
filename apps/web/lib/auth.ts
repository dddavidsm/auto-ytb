import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE='auto_ytb_session';
const MAX_AGE_SECONDS=60*60*24*7;

type SessionPayload={exp:number;scope:'control-plane'};

function secret(){
  const value=(process.env.SESSION_SECRET||process.env.CONTROL_PLANE_TOKEN||'').trim();
  if(!value)throw new Error('SESSION_SECRET (or CONTROL_PLANE_TOKEN fallback) is required');
  if(process.env.NODE_ENV==='production'&&value.length<32)throw new Error('SESSION_SECRET must be at least 32 characters in production');
  return value;
}
function sign(body:string){return createHmac('sha256',secret()).update(body).digest('base64url');}
function safeEqual(a:string,b:string){const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
export function verifyControlToken(value:string){const expected=(process.env.CONTROL_PLANE_TOKEN||'').trim();return Boolean(expected)&&safeEqual(value,expected);}
export function createSessionToken(now=Date.now()){
  const payload:SessionPayload={exp:Math.floor(now/1000)+MAX_AGE_SECONDS,scope:'control-plane'};
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}
export function verifySessionToken(token:string|undefined|null){
  if(!token)return false;const [body,signature]=token.split('.');if(!body||!signature||!safeEqual(sign(body),signature))return false;
  try{const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8')) as SessionPayload;return payload.scope==='control-plane'&&payload.exp>Math.floor(Date.now()/1000);}catch{return false;}
}
export async function hasSession(){const store=await cookies();return verifySessionToken(store.get(COOKIE)?.value);}
export async function requireSession(){if(!(await hasSession()))redirect('/login');}
export async function setSessionCookie(){const store=await cookies();store.set(COOKIE,createSessionToken(),{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/',maxAge:MAX_AGE_SECONDS});}
export async function clearSessionCookie(){const store=await cookies();store.set(COOKIE,'',{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/',maxAge:0});}
export const sessionCookieName=COOKIE;
