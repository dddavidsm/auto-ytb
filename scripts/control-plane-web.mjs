import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

function loadRootEnv(path=resolve('.env.local')){
  try{
    const text=readFileSync(path,'utf8');
    for(const raw of text.split(/\r?\n/)){
      const line=raw.trim();if(!line||line.startsWith('#'))continue;
      const index=line.indexOf('=');if(index<=0)continue;
      const key=line.slice(0,index).trim();let value=line.slice(index+1).trim();
      if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
      if(!(key in process.env))process.env[key]=value;
    }
  }catch(error){throw new Error(`Cannot load ${path}: ${error instanceof Error?error.message:String(error)}`);}
}

loadRootEnv();
const mode=process.argv[2]==='start'?'start':'dev';
const webPort=Number(process.env.CONTROL_PLANE_PORT||3000);
const redirectUri=new URL(process.env.CONTROL_GOOGLE_REDIRECT_URI||'http://localhost:53683/oauth2/callback');
const bridgePort=Number(redirectUri.port||80);
const bridgeHost=redirectUri.hostname;

const bridge=createServer((req,res)=>{
  const incoming=new URL(req.url||'/',`http://${req.headers.host||`${bridgeHost}:${bridgePort}`}`);
  if(incoming.pathname!==redirectUri.pathname){res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');return;}
  const target=new URL('/api/auth/google/callback',`http://localhost:${webPort}`);
  target.search=incoming.search;
  res.writeHead(302,{location:target.toString(),'cache-control':'no-store'});res.end();
});
bridge.on('error',(error)=>{console.error(`Control OAuth bridge failed on ${bridgeHost}:${bridgePort}:`,error.message);process.exitCode=1;});
bridge.listen(bridgePort,bridgeHost,()=>console.log(`Control OAuth bridge READY: ${redirectUri.toString()} -> http://localhost:${webPort}/api/auth/google/callback`));

const npm=process.platform==='win32'?'npm.cmd':'npm';
const child=spawn(npm,['--workspace','@auto-ytb/web','run',mode],{stdio:'inherit',env:{...process.env,PORT:String(webPort)}});
const shutdown=(signal)=>{try{bridge.close();}catch{}if(!child.killed)child.kill(signal);};
process.on('SIGINT',()=>shutdown('SIGINT'));
process.on('SIGTERM',()=>shutdown('SIGTERM'));
child.on('exit',(code,signal)=>{try{bridge.close();}catch{}if(signal)process.kill(process.pid,signal);else process.exit(code??1);});
