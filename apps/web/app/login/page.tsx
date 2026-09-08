'use client';
import { FormEvent, useState } from 'react';

export default function LoginPage(){
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');const data=new FormData(event.currentTarget);const response=await fetch('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:data.get('token')})});if(response.ok){window.location.href='/';return;}setBusy(false);setError('No se ha podido iniciar sesión.');}
  return <main className="login-shell"><section className="login-card"><div className="brand-mark">A</div><div><p className="eyebrow">AUTO-YTB</p><h1>Control plane</h1><p className="muted">Producción, revisión, costes, rendimiento y aprendizaje creativo en un único panel.</p></div><form onSubmit={submit}><label htmlFor="token">Clave de acceso</label><input id="token" name="token" type="password" autoComplete="current-password" required autoFocus placeholder="••••••••••••"/><button className="primary" disabled={busy}>{busy?'Entrando…':'Acceder'}</button>{error?<p className="error">{error}</p>:null}</form><p className="fine">La sesión se guarda únicamente en una cookie HttpOnly firmada.</p></section></main>;
}
