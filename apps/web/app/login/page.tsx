'use client';
import { FormEvent, useEffect, useState } from 'react';

const errorMessage=(code:string|null)=>({
  oauth_state:'La sesión de Google ha caducado. Vuelve a intentarlo.',
  oauth_config:'El acceso con Google aún no está configurado.',
  oauth_exchange:'Google no ha podido completar el inicio de sesión.',
  oauth_token:'Google no ha devuelto una sesión válida.',
  profile:'No se ha podido leer tu perfil de Google.',
  not_allowed:'Esta cuenta de Google no está autorizada para administrar AUTO-YTB.',
}[String(code||'')]||'');

export default function LoginPage(){
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{setError(errorMessage(new URLSearchParams(window.location.search).get('error')));},[]);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');const data=new FormData(event.currentTarget);const response=await fetch('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:data.get('token')})});if(response.ok){window.location.href='/';return;}setBusy(false);setError('No se ha podido iniciar sesión.');}
  return <main className="login-shell"><section className="login-card"><div className="brand-mark">A</div><div><p className="eyebrow">AUTO-YTB</p><h1>Control plane</h1><p className="muted">Producción, revisión, costes, rendimiento y aprendizaje creativo en un único panel.</p></div><form onSubmit={submit}><label htmlFor="token">Código de acceso</label><input id="token" name="token" type="password" autoComplete="current-password" required placeholder="Introduce tu código"/><button className="primary" disabled={busy}>{busy?'Entrando…':'Entrar en AUTO-YTB'}</button>{error?<p className="error">{error}</p>:null}</form><p className="fine">La sesión se guarda en una cookie HttpOnly firmada. El acceso con Google se activará cuando se añadan las credenciales OAuth de la cuenta.</p></section></main>;
}
