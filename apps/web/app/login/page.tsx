'use client';

import { FormEvent, useEffect, useState } from 'react';

const errorMessage=(code:string|null)=>({oauth_state:'La sesión de Google ha caducado. Vuelve a intentarlo.',oauth_config:'El acceso con Google aún no está configurado.',oauth_exchange:'Google no ha podido completar el inicio de sesión.',oauth_token:'Google no ha devuelto una sesión válida.',profile:'No se ha podido leer tu perfil de Google.',not_allowed:'Esta cuenta de Google no está autorizada para administrar AUTO-YTB.'}[String(code||'')]||'');

export default function LoginPage(){
  const [mode,setMode]=useState<'login'|'register'|'token'>('login');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  useEffect(()=>{setError(errorMessage(new URLSearchParams(window.location.search).get('error')));},[]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setNotice('');const data=new FormData(event.currentTarget);
    const body=mode==='token'?{token:data.get('token')}:{email:data.get('email'),password:data.get('password'),...(mode==='register'?{name:data.get('name')}: {})};
    const endpoint=mode==='register'?'/api/auth/register':'/api/session';
    try{const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const payload=await response.json().catch(()=>({}));if(response.ok){window.location.href='/';return;}setError(payload.error||'No se ha podido completar el acceso.');}catch{setError('No se pudo contactar con AUTO-YTB.');}finally{setBusy(false);}
  }
  const register=mode==='register';
  return <main className="login-shell"><section className="login-card auth-card"><div className="auth-hero"><div className="brand-mark">A</div><div><p className="eyebrow">AUTO-YTB STUDIO</p><h1>{register?'Crea tu workspace':'Bienvenido de nuevo'}</h1><p className="muted">Ideas, radar, producción, revisión y galería en una sola experiencia operativa.</p></div></div><div className="auth-tabs"><button type="button" className={mode==='login'?'selected':''} onClick={()=>{setMode('login');setError('');}}>Entrar</button><button type="button" className={register?'selected':''} onClick={()=>{setMode('register');setError('');}}>Registrarme</button><button type="button" className={mode==='token'?'selected':''} onClick={()=>{setMode('token');setError('');}}>Código</button></div>
    <form onSubmit={submit}>
      {mode==='token' ? <><label htmlFor="token">Código de control</label><input id="token" name="token" type="password" autoComplete="current-password" required placeholder="Introduce tu código de acceso"/></> : <>{register && <><label htmlFor="name">Nombre</label><input id="name" name="name" autoComplete="name" required minLength={2} placeholder="Tu nombre"/></>}<label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required placeholder="tu@email.com"/><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete={register?'new-password':'current-password'} minLength={10} required placeholder="Mínimo 10 caracteres"/></>}
      <button className="primary auth-submit" disabled={busy}>{busy?(register?'Creando cuenta…':'Entrando…'):(register?'Crear cuenta':'Entrar en AUTO-YTB')}</button>{error?<p className="error">{error}</p>:null}{notice?<p className="notice">{notice}</p>:null}
    </form>
    {mode!=='token'?<a className="google-login" href="/api/auth/google" aria-label="Continuar con Google"><svg className="google-logo" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.878 2.684-6.615Z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258c-.806.54-1.835.86-3.048.86-2.344 0-4.328-1.584-5.036-3.715H.958v2.331A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.962H.958A9 9 0 0 0 0 9c0 1.453.348 2.827.958 4.038l3.006-2.331Z"/><path fill="#EA4335" d="M9 3.578c1.322 0 2.507.454 3.44 1.346l2.582-2.582C13.463.89 11.426 0 9 0A9 9 0 0 0 .958 4.962l3.006 2.331C4.672 5.162 6.656 3.578 9 3.578Z"/></svg><span>Continuar con Google</span></a>:null}<p className="fine auth-footnote">La sesión se guarda con cookie HttpOnly firmada. Tu contraseña nunca se almacena en texto plano; se protege con scrypt y salt único.</p></section></main>;
}
