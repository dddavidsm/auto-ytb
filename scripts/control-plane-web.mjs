import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import net from 'node:net';

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

const webHost='127.0.0.1';

async function portAvailable(port){
  return await new Promise((resolvePort)=>{
    const probe=net.createServer();
    probe.unref();
    probe.once('error',()=>resolvePort(false));
    probe.listen({port,host:webHost,exclusive:true},()=>probe.close(()=>resolvePort(true)));
  });
}

async function resolveWebPort(){
  const explicit=Number(process.env.CONTROL_PLANE_PORT||0);
  if(explicit){
    if(await portAvailable(explicit))return explicit;
    throw new Error(`CONTROL_PLANE_PORT ${explicit} is already in use on ${webHost}. Stop that process or remove CONTROL_PLANE_PORT so AUTO-YTB can choose a free port automatically.`);
  }
  for(let port=3000;port<=3010;port++)if(await portAvailable(port))return port;
  throw new Error('No free control-plane port found in range 3000-3010.');
}

loadRootEnv();
const mode=process.argv[2]==='start'?'start':'dev';
const webPort=await resolveWebPort();
const redirectUri=new URL(process.env.CONTROL_GOOGLE_REDIRECT_URI||'http://localhost:53683/oauth2/callback');
const bridgePort=Number(redirectUri.port||80);
const bridgeHost=redirectUri.hostname;

if(webPort!==3000)console.log(`Port 3000 is busy. AUTO-YTB will use http://localhost:${webPort} instead.`);

const bridge=createServer((req,res)=>{
  const incoming=new URL(req.url||'/',`http://${req.headers.host||`${bridgeHost}:${bridgePort}`}`);
  if(incoming.pathname!==redirectUri.pathname){res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');return;}
  const target=new URL('/api/auth/google/callback',`http://localhost:${webPort}`);
  target.search=incoming.search;
  res.writeHead(302,{location:target.toString(),'cache-control':'no-store'});res.end();
});
bridge.on('error',(error)=>{console.error(`Control OAuth bridge failed on ${bridgeHost}:${bridgePort}:`,error.message);process.exitCode=1;});
bridge.listen(bridgePort,bridgeHost,()=>console.log(`Control OAuth bridge READY: ${redirectUri.toString()} -> http://localhost:${webPort}/api/auth/google/callback`));

const childEnv={...process.env,PORT:String(webPort),CONTROL_PLANE_PORT:String(webPort)};
let child;
if(process.platform==='win32'){
  const command=`npm --workspace @auto-ytb/web run ${mode} -- --hostname ${webHost} --port ${webPort}`;
  child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c',command],{stdio:'inherit',env:childEnv});
}else{
  child=spawn('npm',['--workspace','@auto-ytb/web','run',mode,'--','--hostname',webHost,'--port',String(webPort)],{stdio:'inherit',env:childEnv});
}
const shutdown=(signal)=>{try{bridge.close();}catch{}if(!child.killed)child.kill(signal);};
process.on('SIGINT',()=>shutdown('SIGINT'));
process.on('SIGTERM',()=>shutdown('SIGTERM'));
child.on('exit',(code,signal)=>{try{bridge.close();}catch{}if(signal)process.kill(process.pid,signal);else process.exit(code??1);});
