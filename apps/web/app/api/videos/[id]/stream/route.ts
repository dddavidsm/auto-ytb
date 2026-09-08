import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { hasSession } from '../../../../../lib/auth';
import { query } from '../../../../../lib/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function localPath(uri:string){if(uri.startsWith('file://'))return fileURLToPath(uri);if(uri.startsWith('/')||uri.startsWith('.'))return resolve(uri);return null;}
function safeRenderPath(uri:string){const path=localPath(uri);if(!path)return null;const root=resolve(process.env.LOCAL_RENDER_ROOT||'.data/renders');const rel=relative(root,resolve(path));return rel.startsWith('..')||rel.includes(`..${process.platform==='win32'?'\\':'/'}`)?null:path;}

export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  if(!(await hasSession()))return NextResponse.json({error:'Unauthorized'},{status:401});
  const {id}=await context.params;
  const rows=await query<{metadata:any}>(`select metadata from production_runs where id=$1`,[id]);
  const uri=String(rows[0]?.metadata?.renderUri??'');const path=safeRenderPath(uri);if(!path)return NextResponse.json({error:'Render unavailable in local storage'},{status:404});
  const info=await stat(path).catch(()=>null);if(!info||!info.isFile())return NextResponse.json({error:'Render not found'},{status:404});
  const size=info.size,range=request.headers.get('range');let start=0,end=size-1;
  if(range){const match=/bytes=(\d*)-(\d*)/.exec(range);if(match){start=match[1]?Number(match[1]):0;end=match[2]?Number(match[2]):Math.min(size-1,start+8*1024*1024-1);}}
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
  end=Math.min(end,size-1);const stream=createReadStream(path,{start,end});
  return new Response(Readable.toWeb(stream) as ReadableStream,{status:range?206:200,headers:{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${size}`,'Cache-Control':'private, no-store'}});
}
