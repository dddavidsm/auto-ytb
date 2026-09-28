import { NextResponse } from 'next/server';
import { authenticatePasswordUser, clearSessionCookie, setSessionCookie, verifyControlToken } from '../../../lib/auth';

export const runtime='nodejs';

export async function POST(request:Request){
  const contentType=request.headers.get('content-type')||'';
  let token='';
  let email='';
  let password='';
  let jsonBody:any=null;
  if(contentType.includes('application/json')){jsonBody=await request.json().catch(()=>({}));token=String(jsonBody?.token??'');}
  else{const form=await request.formData();token=String(form.get('token')??'');}
  const workerAuthorized=request.headers.get('x-auto-ytb-control-authorized')==='1';
  if(contentType.includes('application/json')){
    email=String(jsonBody?.email??'').trim();password=String(jsonBody?.password??'');
  }
  if(email||password){
    if(!email||!password)return NextResponse.json({ok:false,error:'Email y contraseña son obligatorios.'},{status:400,headers:{'Cache-Control':'no-store'}});
    const user=await authenticatePasswordUser(email,password);
    if(!user)return NextResponse.json({ok:false,error:'Email o contraseña incorrectos.'},{status:401,headers:{'Cache-Control':'no-store'}});
    await setSessionCookie({email:user.email,auth:'password'});
  }else{
    if(!workerAuthorized&&!verifyControlToken(token))return NextResponse.json({ok:false,error:'Código de acceso incorrecto.'},{status:401,headers:{'Cache-Control':'no-store'}});
    await setSessionCookie({auth:'token'});
  }
  return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}

export async function DELETE(){await clearSessionCookie();return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});}
