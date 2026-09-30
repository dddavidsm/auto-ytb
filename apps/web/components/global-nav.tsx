'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const items=[
  ['/','Inicio','⌂'],['/radar','Radar','◈'],['/idea-lab','Ideas','✦'],['/create','Crear vídeo','＋'],['/gallery','Galería','▣'],['/series','Series','◌'],['/reference-lab','Referencias','◎'],['/reference-analyzer','Analizar vídeo','⌕'],['/channels','Canales','♧'],
] as const;

export default function GlobalNav(){
  const pathname=usePathname();
  const [open,setOpen]=useState(false);
  if(pathname==='/login')return null;
  const active=(href:string)=>href==='/'?pathname==='/':pathname.startsWith(href);
  return <>
    <aside className={`global-sidebar ${open?'open':''}`}>
      <Link href="/" className="brand" onClick={()=>setOpen(false)}><span className="brand-mark">A</span><span className="brand-copy"><strong>AUTO-YTB</strong><span>Studio operativo</span></span></Link>
      <div className="global-nav-label">Workspace</div>
      <nav className="nav">{items.map(([href,label,icon])=><Link key={href} href={href} className={active(href)?'active':''} onClick={()=>setOpen(false)}><span className="nav-icon">{icon}</span>{label}</Link>)}</nav>
      <div className="global-sidebar-footer"><span className="pill good"><span className="status-dot"/>Sistema activo</span><Link href="/login" className="logout" onClick={async(event)=>{event.preventDefault();await fetch('/api/session',{method:'DELETE'});window.location.href='/login';}}>Cerrar sesión</Link></div>
    </aside>
    <button type="button" className="mobile-menu-button" aria-label="Abrir menú" onClick={()=>setOpen((value)=>!value)}>{open?'×':'☰'}</button>
    {open?<button type="button" className="nav-backdrop" aria-label="Cerrar menú" onClick={()=>setOpen(false)}/>:null}
  </>;
}
