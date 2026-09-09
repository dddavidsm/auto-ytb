import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE='auto_ytb_session';
export const googleOauthStateCookieName='auto_ytb_google_oauth_state';
const MAX_AGE_SECONDS=60*60*24*7;

type SessionPayload={exp:number;scope:'control-plane';email?:string;auth?:'google'|'token'};

function secret(){
  const value=(process.env.SESSION_SECRET||process.env.CONTROL_PLANE_TOKEN||'').trim();
  if(!value)throw new Error('SESSION_SECRET (or CONTROL_PLANE_TOKEN fallback) is required');
  if(process.env.NODE_ENV==='production'&&value.length<32)throw new Error('SESSION_SECRET must be at least 32 characters in production');
  return value;
}
function sign(body:string){return createHmac('sha256',secret()).update(body).digest('base64url');}
function safeEqual(a:string,b:string){const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
export function verifyControlToken(value:string){const expected=(process.env.CONTROL_PLANE_TOKEN||'').trim();return Boolean(expected)&&safeEqual(value,expected);}
export function allowedControlEmails(){return String(process.env.CONTROL_GOOGLE_ALLOWED_EMAILS||'').split(',').map((value)=>value.trim().toLowerCase()).filter(Boolean);}
export function isAllowedControlEmail(email:string){const allowed=allowedControlEmails();return allowed.length>0&&allowed.includes(String(email||'').trim().toLowerCase());}
export function controlGoogleConfig(){
  const clientId=(process.env.CONTROL_GOOGLE_CLIENT_ID||process.env.DRIVE_CLIENT_ID||process.env.YOUTUBE_CLIENT_ID||'').trim();
  const clientSecret=(process.env.CONTROL_GOOGLE_CLIENT_SECRET||process.env.DRIVE_CLIENT_SECRET||process.env.YOUTUBE_CLIENT_SECRET||'').trim();
  const redirectUri=(process.env.CONTROL_GOOGLE_REDIRECT_URI||'http://localhost:53683/oauth2/callback').trim();
  return {clientId,clientSecret,redirectUri};
}
export function createSessionToken(options:{email?:string;auth?:'google'|'token';now?:number}={}){
  const now=options.now??Date.now();
  const payload:SessionPayload={exp:Math.floor(now/1000)+MAX_AGE_SECONDS,scope:'control-plane',...(options.email?{email:options.email.toLowerCase()}:{}),...(options.auth?{auth:options.auth}:{})};
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}
// OAuth returns from accounts.google.com. SameSite=Strict can suppress the freshly-set
// session cookie on the immediate callback -> dashboard redirect in some browsers.
// Lax still protects ordinary cross-site subrequests while allowing this top-level OAuth flow.
export function sessionCookieOptions(){return{httpOnly:true as const,sameSite:'lax' as const,secure:process.env.NODE_ENV==='production',path:'/',maxAge:MAX_AGE_SECONDS};}
export function readSessionToken(token:string|undefined|null):SessionPayload|null{
  if(!token)return null;const [body,signature]=token.split('.');if(!body||!signature||!safeEqual(sign(body),signature))return null;
  try{const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8')) as SessionPayload;return payload.scope==='control-plane'&&payload.exp>Math.floor(Date.now()/1000)?payload:null;}catch{return null;}
}
export function verifySessionToken(token:string|undefined|null){return Boolean(readSessionToken(token));}
export async function currentSession(){const store=await cookies();return readSessionToken(store.get(COOKIE)?.value);}
export async function hasSession(){return Boolean(await currentSession());}
export async function requireSession(){if(!(await hasSession()))redirect('/login');}
export async function setSessionCookie(options:{email?:string;auth?:'google'|'token'}={}){const store=await cookies();store.set(COOKIE,createSessionToken(options),sessionCookieOptions());}
export async function clearSessionCookie(){const store=await cookies();store.set(COOKIE,'',{...sessionCookieOptions(),maxAge:0});}
export const sessionCookieName=COOKIE;
