import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodePostgresSqlClient } from '../../packages/runtime-node/index.mjs';

const root = resolve(process.cwd());
const port = Number(process.env.PORT ?? 4310);
const db = process.env.DATABASE_URL ? new NodePostgresSqlClient(process.env.DATABASE_URL,{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined}) : null;

async function jsonFile(path) {
  const full = resolve(root, path);
  if (!existsSync(full)) return null;
  try { return JSON.parse(await readFile(full, 'utf8')); } catch { return null; }
}

async function opsStatus(){
  if(!db) return {available:false,reason:'DATABASE_URL not configured'};
  try{
    const [jobs,budget,dead,recentRuns]=await Promise.all([
      db.query(`select state,count(*)::int as count from jobs group by state`),
      db.query(`select channel_key,spend_date,reserved_usd::float,actual_usd::float,jobs_scheduled from daily_budget_ledger order by spend_date desc,channel_key limit 8`),
      db.query(`select id,kind,attempts,max_attempts,last_error,updated_at from jobs where state='dead' order by updated_at desc limit 8`),
      db.query(`select id,state,total_cost_usd::float,metadata,created_at,updated_at from production_runs order by created_at desc limit 8`),
    ]);
    return {available:true,jobs:Object.fromEntries(jobs.rows.map((row)=>[row.state,Number(row.count)])),budget:budget.rows,deadLetters:dead.rows,recentRuns:recentRuns.rows};
  } catch(error){return {available:false,error:error instanceof Error?error.message:String(error)};}
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}

const html = String.raw`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>auto-ytb control</title><style>:root{font-family:Inter,system-ui,sans-serif;background:#0a0a0b;color:#f3f3f3}body{margin:0}.wrap{max-width:1280px;margin:auto;padding:40px 24px}h1{font-size:34px;margin:0 0 6px}.sub{color:#9c9ca3;margin-bottom:30px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}.card{background:#141416;border:1px solid #29292d;border-radius:16px;padding:18px}.label{color:#8e8e96;font-size:12px;text-transform:uppercase;letter-spacing:.1em}.value{font-size:25px;font-weight:700;margin-top:8px}.ok{color:#7ee787}.warn{color:#f2cc60}.bad{color:#ff7b72}.muted{color:#9c9ca3}.wide{grid-column:1/-1}pre{white-space:pre-wrap;font-size:12px;color:#c6c6ce;max-height:360px;overflow:auto}</style></head><body><div class="wrap"><h1>auto-ytb</h1><div class="sub">Autonomous YouTube Intelligence & Production OS</div><div id="app" class="grid"></div></div><script>const esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})};async function load(){const s=await fetch('/api/status').then(function(r){return r.json()});const niche=s.niche&&s.niche.decision;const pipe=s.pipeline;const ops=s.ops||{};const jobs=ops.jobs||{};const dead=Number(jobs.dead||0);const queued=Number(jobs.queued||0)+Number(jobs.retry||0);const running=Number(jobs.running||0);const ledger=ops.budget&&ops.budget[0];const spend=ledger?Number(ledger.actual_usd||0).toFixed(2):'—';const reserved=ledger?Number(ledger.reserved_usd||0).toFixed(2):'—';const stateClass=pipe&&pipe.state==='READY_FOR_REVIEW'?'ok':'warn';const nicheClass=niche&&niche.status==='PRIMARY'?'ok':'warn';document.getElementById('app').innerHTML='<div class="card"><div class="label">System</div><div class="value ok">ONLINE</div><div class="muted">'+esc(s.version)+'</div></div><div class="card"><div class="label">Queue</div><div class="value '+(dead?'bad':queued?'warn':'ok')+'">'+queued+' queued</div><div class="muted">'+running+' running · '+dead+' dead</div></div><div class="card"><div class="label">Daily spend</div><div class="value">$'+spend+'</div><div class="muted">$'+reserved+' reserved</div></div><div class="card"><div class="label">Niche decision</div><div class="value '+nicheClass+'">'+esc(niche?niche.status:'NO DATA')+'</div><div class="muted">'+esc(niche&&niche.label?niche.label:'Awaiting live evidence')+'</div></div><div class="card"><div class="label">Latest pipeline</div><div class="value '+stateClass+'">'+esc(pipe?pipe.state:'NO LOCAL RUN')+'</div><div class="muted">QA '+esc(pipe&&pipe.qa?pipe.qa.score:'—')+'</div></div><div class="card wide"><div class="label">Recent production runs</div><pre>'+esc(JSON.stringify(ops.recentRuns||[],null,2))+'</pre></div><div class="card wide"><div class="label">Dead-letter queue</div><pre>'+esc(JSON.stringify(ops.deadLetters||[],null,2))+'</pre></div><div class="card wide"><div class="label">Niche ranking</div><pre>'+esc(JSON.stringify(s.niche&&s.niche.niches?s.niche.niches:[],null,2))+'</pre></div>';}load();setInterval(load,15000);</script></body></html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/status') {
    const [niche, pipeline, ops] = await Promise.all([jsonFile('.data/niche-live-latest.json'), jsonFile('.data/pipeline-mock-latest.json'),opsStatus()]);
    return send(res, 200, { version: 'v0.7', niche, pipeline, ops, generatedAt: new Date().toISOString() });
  }
  if (req.url === '/health') {
    const ops=await opsStatus();
    return send(res, ops.available || !db ? 200 : 503, { ok:ops.available || !db,database:ops.available });
  }
  return send(res, 200, html, 'text/html; charset=utf-8');
});
server.listen(port, () => console.log(`auto-ytb control plane: http://localhost:${port}`));
