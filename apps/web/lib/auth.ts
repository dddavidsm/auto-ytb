import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { query } from './db';

const COOKIE='auto_ytb_session';
export const googleOauthStateCookieName='auto_ytb_google_oauth_state';
const MAX_AGE_SECONDS=60*60*24*7;
const GOOGLE_COMPLETION_MAX_AGE_SECONDS=60*5;

type SessionPayload={exp:number;scope:'control-plane';email?:string;auth?:'google'|'token'|'password'};
type GoogleCompletionPayload={exp:number;scope:'control-plane-google-complete';email:string};

export type AppUser={id:string;email:string;name:string};

let authSchemaReady:Promise<void>|null=null;

export async function ensureAuthSchema(){
  if(!authSchemaReady){
    authSchemaReady=(async()=>{
      await query(`create table if not exists app_users (
        id uuid primary key default gen_random_uuid(),
        email text not null,
        name text not null default '',
        password_hash text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )`);
      await query(`create unique index if not exists app_users_email_lower_idx on app_users (lower(email))`);
    })().catch((error)=>{authSchemaReady=null;throw error;});
  }
  return authSchemaReady;
}

export function normalizeEmail(value:string){return String(value||'').trim().toLowerCase();}

function passwordHash(password:string){
  const salt=randomBytes(16).toString('base64url');
  const digest=scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('base64url');
  return `scrypt$16384$8$1$${salt}$${digest}`;
}

function verifyPassword(password:string,encoded:string){
  const [algorithm,n,r,p,salt,digest]=String(encoded||'').split('$');
  if(algorithm!=='scrypt'||!n||!r||!p||!salt||!digest)return false;
  try{
    const actual=scryptSync(password,salt,Buffer.from(digest,'base64url').length,{N:Number(n),r:Number(r),p:Number(p)});
    const expected=Buffer.from(digest,'base64url');
    return actual.length===expected.length&&timingSafeEqual(actual,expected);
  }catch{return false;}
}

export async function createPasswordUser(email:string,name:string,password:string):Promise<AppUser>{
  await ensureAuthSchema();
  const rows=await query<AppUser>(`insert into app_users(email,name,password_hash) values($1,$2,$3) returning id,email,name`,[normalizeEmail(email),String(name||'').trim().slice(0,100),passwordHash(password)]);
  return rows[0];
}

export async function authenticatePasswordUser(email:string,password:string):Promise<AppUser|null>{
  await ensureAuthSchema();
  const rows=await query<AppUser&{password_hash:string}>(`select id,email,name,password_hash from app_users where lower(email)=lower($1) limit 1`,[normalizeEmail(email)]);
  const user=rows[0];
  return user&&verifyPassword(password,user.password_hash)?{id:user.id,email:user.email,name:user.name}:null;
}

function secret(){
  const value=(process.env.SESSION_SECRET||process.env.CONTROL_PLANE_TOKEN||'').trim();
  if(!value)throw new Error('SESSION_SECRET (or CONTROL_PLANE_TOKEN fallback) is required');
  if(process.env.NODE_ENV==='production'&&value.length<32)throw new Error('SESSION_SECRET must be at least 32 characters in production');
  return value;
}
function sign(body:string){return createHmac('sha256',secret()).update(body).digest('base64url');}
function safeEqual(a:string,b:string){const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
function signPayload(payload:object){const body=Buffer.from(JSON.stringify(payload)).toString('base64url');return `${body}.${sign(body)}`;}
function readSignedPayload<T>(token:string|undefined|null):T|null{
  if(!token)return null;const [body,signature]=token.split('.');if(!body||!signature||!safeEqual(sign(body),signature))return null;
  try{return JSON.parse(Buffer.from(body,'base64url').toString('utf8')) as T;}catch{return null;}
}
export function verifyControlToken(value:string){const expected=(process.env.CONTROL_PLANE_TOKEN||'').trim();return Boolean(expected)&&safeEqual(value,expected);}
export function allowedControlEmails(){return String(process.env.CONTROL_GOOGLE_ALLOWED_EMAILS||'').split(',').map((value)=>value.trim().toLowerCase()).filter(Boolean);}
export function isAllowedControlEmail(email:string){const allowed=allowedControlEmails();return allowed.length>0&&allowed.includes(String(email||'').trim().toLowerCase());}
export function controlGoogleConfig(){
  const clientId=(process.env.CONTROL_GOOGLE_CLIENT_ID||process.env.DRIVE_CLIENT_ID||process.env.YOUTUBE_CLIENT_ID||'').trim();
  const clientSecret=(process.env.CONTROL_GOOGLE_CLIENT_SECRET||process.env.DRIVE_CLIENT_SECRET||process.env.YOUTUBE_CLIENT_SECRET||'').trim();
  const redirectUri=(process.env.CONTROL_GOOGLE_REDIRECT_URI||'http://localhost:53683/oauth2/callback').trim();
  return {clientId,clientSecret,redirectUri};
}
export function publicAppOrigin(request?:Request){
  const forwardedOrigin=(request?.headers.get('x-auto-ytb-public-origin')||'').trim();
  if(forwardedOrigin){try{return new URL(forwardedOrigin).origin;}catch{}}
  const configured=(process.env.CONTROL_GOOGLE_REDIRECT_URI||'').trim();
  if(configured){try{return new URL(configured).origin;}catch{}}
  const forwardedHost=request?.headers.get('x-forwarded-host')||request?.headers.get('host')||'localhost:3000';
  const forwardedProto=request?.headers.get('x-forwarded-proto')||'https';
  return `${forwardedProto}://${forwardedHost}`;
}
export function createSessionToken(options:{email?:string;auth?:'google'|'token'|'password';now?:number}={}){
  const now=options.now??Date.now();
  const payload:SessionPayload={exp:Math.floor(now/1000)+MAX_AGE_SECONDS,scope:'control-plane',...(options.email?{email:options.email.toLowerCase()}:{}),...(options.auth?{auth:options.auth}:{})};
  return signPayload(payload);
}
export function createGoogleCompletionTicket(email:string,now=Date.now()){
  return signPayload({exp:Math.floor(now/1000)+GOOGLE_COMPLETION_MAX_AGE_SECONDS,scope:'control-plane-google-complete',email:email.trim().toLowerCase()} satisfies GoogleCompletionPayload);
}
export function readGoogleCompletionTicket(token:string|undefined|null){
  const payload=readSignedPayload<GoogleCompletionPayload>(token);
  if(!payload||payload.scope!=='control-plane-google-complete'||payload.exp<=Math.floor(Date.now()/1000)||!payload.email)return null;
  return payload;
}
export function sessionCookieOptions(){return{httpOnly:true as const,sameSite:'lax' as const,secure:process.env.NODE_ENV==='production',path:'/',maxAge:MAX_AGE_SECONDS};}
export function readSessionToken(token:string|undefined|null):SessionPayload|null{
  const payload=readSignedPayload<SessionPayload>(token);
  return payload&&payload.scope==='control-plane'&&payload.exp>Math.floor(Date.now()/1000)?payload:null;
}
export function verifySessionToken(token:string|undefined|null){return Boolean(readSessionToken(token));}
export async function currentSession(){const store=await cookies();return readSessionToken(store.get(COOKIE)?.value);}
export async function hasSession(){return Boolean(await currentSession());}
export async function requireSession(){if(!(await hasSession()))redirect('/login');}
export async function setSessionCookie(options:{email?:string;auth?:'google'|'token'|'password'}={}){const store=await cookies();store.set(COOKIE,createSessionToken(options),sessionCookieOptions());}
export async function clearSessionCookie(){const store=await cookies();store.set(COOKIE,'',{...sessionCookieOptions(),maxAge:0});}
export const sessionCookieName=COOKIE;
