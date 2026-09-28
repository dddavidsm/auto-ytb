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
    {mode!=='token'?<a className="google-login" href="/api/auth/google">Continuar con Google</a>:null}<p className="fine auth-footnote">La sesión se guarda con cookie HttpOnly firmada. Tu contraseña nunca se almacena en texto plano; se protege con scrypt y salt único.</p></section></main>;
}
