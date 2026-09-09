import { NextResponse } from 'next/server';
import { clearSessionCookie, setSessionCookie, verifyControlToken } from '../../../lib/auth';

export const runtime='nodejs';

export async function POST(request:Request){
  const contentType=request.headers.get('content-type')||'';
  let token='';
  if(contentType.includes('application/json')){const body=await request.json().catch(()=>({}));token=String(body?.token??'');}
  else{const form=await request.formData();token=String(form.get('token')??'');}
  if(!verifyControlToken(token))return NextResponse.json({ok:false,error:'Invalid credentials'},{status:401,headers:{'Cache-Control':'no-store'}});
  await setSessionCookie({auth:'token'});
  return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}

export async function DELETE(){await clearSessionCookie();return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});}
