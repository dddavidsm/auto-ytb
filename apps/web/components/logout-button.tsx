'use client';
export function LogoutButton(){return <button className="logout" onClick={async()=>{await fetch('/api/session',{method:'DELETE'});window.location.href='/login';}}>Cerrar sesión</button>;}
