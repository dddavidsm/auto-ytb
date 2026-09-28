import { NextResponse } from 'next/server';
import { createPasswordUser, setSessionCookie } from '../../../../lib/auth';

export const runtime='nodejs';

export async function POST(request:Request){
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;
  const email=String(body.email||'').trim().toLowerCase();
  const name=String(body.name||'').trim();
  const password=String(body.password||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({ok:false,error:'Introduce un email válido.'},{status:400});
  if(password.length<10)return NextResponse.json({ok:false,error:'La contraseña debe tener al menos 10 caracteres.'},{status:400});
  if(name.length<2)return NextResponse.json({ok:false,error:'Introduce tu nombre.'},{status:400});
  try{
    const user=await createPasswordUser(email,name,password);
    await setSessionCookie({email:user.email,auth:'password'});
    return NextResponse.json({ok:true,user:{email:user.email,name:user.name}},{headers:{'Cache-Control':'no-store'}});
  }catch(error:any){
    if(error?.code==='23505')return NextResponse.json({ok:false,error:'Ya existe una cuenta con ese email.'},{status:409});
    console.error('[auth/register]',error);
    return NextResponse.json({ok:false,error:'No se pudo crear la cuenta.'},{status:500});
  }
}
