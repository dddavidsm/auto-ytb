import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodePostgresSqlClient } from '../../packages/runtime-node/index.mjs';

const root = resolve(process.cwd());
const port = Number(process.env.PORT ?? 4310);
const db = process.env.DATABASE_URL ? new NodePostgresSqlClient(process.env.DATABASE_URL,{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined}) : null;
const controlToken=process.env.CONTROL_PLANE_TOKEN?.trim() || null;

async function jsonFile(path) {
  const full = resolve(root, path);
  if (!existsSync(full)) return null;
  try { return JSON.parse(await readFile(full, 'utf8')); } catch { return null; }
}

async function opsStatus(){
  if(!db) return {available:false,reason:'DATABASE_URL not configured'};
  try{
    const [jobs,budget,dead,recentRuns,reviewQueue]=await Promise.all([
      db.query(`select state,count(*)::int as count from jobs group by state`),
      db.query(`select channel_key,spend_date,reserved_usd::float,actual_usd::float,jobs_scheduled from daily_budget_ledger order by spend_date desc,channel_key limit 8`),
      db.query(`select id,kind,attempts,max_attempts,last_error,updated_at from jobs where state='dead' order by updated_at desc limit 8`),
      db.query(`select id,state,total_cost_usd::float,metadata,created_at,updated_at from production_runs order by created_at desc limit 8`),
      db.query(`
        select p.id,p.youtube_video_id,p.state,p.publish_at,p.content_format,p.metadata,p.created_at,
          pr.total_cost_usd::float as total_cost_usd,ci.working_title,o.angle,o.score::float as opportunity_score,
          q.score::float as qa_score,q.blockers
        from publications p
        left join production_runs pr on pr.id=p.production_run_id
        left join content_ideas ci on ci.id=pr.content_idea_id
        left join opportunities o on o.id=ci.opportunity_id
        left join lateral (select score,blockers from qa_reports qr where qr.production_run_id=pr.id order by qr.created_at desc limit 1) q on true
        where p.state in ('private','reviewed')
        order by p.created_at asc limit 20`),
    ]);
    return {available:true,mutationsEnabled:Boolean(controlToken),jobs:Object.fromEntries(jobs.rows.map((row)=>[row.state,Number(row.count)])),budget:budget.rows,deadLetters:dead.rows,recentRuns:recentRuns.rows,reviewQueue:reviewQueue.rows};
  } catch(error){return {available:false,error:error instanceof Error?error.message:String(error)};}
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}

function authorized(req){
  if(!controlToken) return false;
  const bearer=String(req.headers.authorization ?? '').replace(/^Bearer\s+/i,'').trim();
  const header=String(req.headers['x-control-token'] ?? '').trim();
  return bearer===controlToken || header===controlToken;
}

async function readJson(req){
  let body='';
  for await (const chunk of req){body+=chunk.toString();if(body.length>64_000)throw new Error('Request body too large');}
  return body?JSON.parse(body):{};
}

async function reviewAction(req,res,publicationId,action){
  if(!db) return send(res,503,{error:'DATABASE_URL not configured'});
  if(!authorized(req)) return send(res,401,{error:'Valid CONTROL_PLANE_TOKEN required'});
  const body=await readJson(req);
  const current=(await db.query(`select id,state,youtube_video_id from publications where id=$1`,[publicationId])).rows[0];
  if(!current) return send(res,404,{error:'Publication not found'});
  if(action==='approve'){
    if(current.state!=='private') return send(res,409,{error:`Cannot approve publication in ${current.state}`});
    await db.query(`update publications set state='reviewed',updated_at=now() where id=$1`,[publicationId]);
    await db.query(`insert into review_decisions (publication_id,action,note,metadata) values ($1,'approve',$2,$3::jsonb)`,[publicationId,body.note??null,JSON.stringify({youtubeVideoId:current.youtube_video_id})]);
    return send(res,200,{ok:true,publicationId,state:'reviewed'});
  }
  if(action==='reject'){
    if(!['private','reviewed'].includes(current.state)) return send(res,409,{error:`Cannot reject publication in ${current.state}`});
    await db.query(`update publications set state='rejected',updated_at=now() where id=$1`,[publicationId]);
    await db.query(`insert into review_decisions (publication_id,action,note,metadata) values ($1,'reject',$2,$3::jsonb)`,[publicationId,body.note??null,JSON.stringify({youtubeVideoId:current.youtube_video_id})]);
    return send(res,200,{ok:true,publicationId,state:'rejected'});
  }
  if(action==='schedule'){
    if(current.state!=='reviewed') return send(res,409,{error:'Approve the publication before scheduling it'});
    const publishAt=new Date(body.publishAt);
    if(!Number.isFinite(publishAt.getTime())||publishAt.getTime()<=Date.now()) return send(res,400,{error:'publishAt must be a future timestamp'});
    const jobKey=`schedule-publication:${publicationId}:${publishAt.toISOString()}`;
    const inserted=await db.query(`insert into jobs (job_key,kind,state,priority,max_attempts,payload) values ($1,'schedule_publication','queued',95,4,$2::jsonb) on conflict (job_key) do nothing returning id`,[jobKey,JSON.stringify({publicationId,publishAt:publishAt.toISOString()})]);
    if(!inserted.rows[0]) return send(res,200,{ok:true,deduped:true,publicationId,publishAt:publishAt.toISOString()});
    await db.query(`insert into job_events (job_id,event_type,detail) values ($1,'scheduled',$2::jsonb)`,[inserted.rows[0].id,JSON.stringify({publicationId,publishAt:publishAt.toISOString(),source:'control-plane'})]);
    return send(res,202,{ok:true,jobId:inserted.rows[0].id,publicationId,publishAt:publishAt.toISOString()});
  }
  return send(res,404,{error:'Unknown review action'});
}

const html = String.raw`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>auto-ytb control</title><style>:root{font-family:Inter,system-ui,sans-serif;background:#0a0a0b;color:#f3f3f3}body{margin:0}.wrap{max-width:1280px;margin:auto;padding:40px 24px}h1{font-size:34px;margin:0 0 6px}.sub{color:#9c9ca3;margin-bottom:30px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}.card{background:#141416;border:1px solid #29292d;border-radius:16px;padding:18px}.label{color:#8e8e96;font-size:12px;text-transform:uppercase;letter-spacing:.1em}.value{font-size:25px;font-weight:700;margin-top:8px}.ok{color:#7ee787}.warn{color:#f2cc60}.bad{color:#ff7b72}.muted{color:#9c9ca3}.wide{grid-column:1/-1}pre{white-space:pre-wrap;font-size:12px;color:#c6c6ce;max-height:360px;overflow:auto}.review{border-top:1px solid #29292d;padding:14px 0}.review:first-of-type{border-top:0}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}button,input{background:#202024;color:#f3f3f3;border:1px solid #3a3a40;border-radius:8px;padding:8px 10px}button{cursor:pointer}.approve{border-color:#2f7d49}.reject{border-color:#8c3b3b}.title{font-weight:700;margin:4px 0}.meta{font-size:12px;color:#9c9ca3}</style></head><body><div class="wrap"><h1>auto-ytb</h1><div class="sub">Autonomous YouTube Intelligence & Production OS</div><div id="app" class="grid"></div></div><script>const esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})};function token(){let t=localStorage.getItem('autoYtbControlToken');if(!t){t=prompt('CONTROL_PLANE_TOKEN (only required for review actions)')||'';if(t)localStorage.setItem('autoYtbControlToken',t)}return t}async function act(id,action,payload){const t=token();if(!t)return;const r=await fetch('/api/review/'+encodeURIComponent(id)+'/'+action,{method:'POST',headers:{'content-type':'application/json','x-control-token':t},body:JSON.stringify(payload||{})});const j=await r.json();if(!r.ok){alert(j.error||'Action failed');return}await load()}function reviewHtml(rows,enabled){if(!rows||!rows.length)return '<div class="muted">No videos waiting for review.</div>';return rows.map(function(r){const title=r.working_title||r.angle||r.youtube_video_id;const yt=r.youtube_video_id?'https://www.youtube.com/watch?v='+encodeURIComponent(r.youtube_video_id):null;return '<div class="review"><div class="title">'+esc(title)+'</div><div class="meta">'+esc(r.content_format||'LONG_HORIZONTAL')+' · state '+esc(r.state)+' · QA '+esc(r.qa_score==null?'—':r.qa_score)+' · opportunity '+esc(r.opportunity_score==null?'—':r.opportunity_score)+' · cost $'+esc(r.total_cost_usd==null?'—':Number(r.total_cost_usd).toFixed(2))+'</div>'+(yt?'<div class="meta"><a style="color:#9ecbff" target="_blank" rel="noreferrer" href="'+yt+'">Open private YouTube video</a></div>':'')+(enabled?'<div class="actions">'+(r.state==='private'?'<button class="approve" onclick="act(\''+esc(r.id)+'\',\'approve\')">Approve</button>':'')+'<button class="reject" onclick="act(\''+esc(r.id)+'\',\'reject\',{note:prompt(\'Reason (optional)\')||null})">Reject</button>'+(r.state==='reviewed'?'<input id="dt-'+esc(r.id)+'" type="datetime-local"><button onclick="const v=document.getElementById(\'dt-'+esc(r.id)+'\').value;if(v)act(\''+esc(r.id)+'\',\'schedule\',{publishAt:new Date(v).toISOString()})">Schedule</button>':'')+'</div>':'<div class="meta">Set CONTROL_PLANE_TOKEN to enable review actions.</div>')+'</div>'}).join('')}async function load(){const s=await fetch('/api/status').then(function(r){return r.json()});const niche=s.niche&&s.niche.decision;const pipe=s.pipeline;const ops=s.ops||{};const jobs=ops.jobs||{};const dead=Number(jobs.dead||0);const queued=Number(jobs.queued||0)+Number(jobs.retry||0);const running=Number(jobs.running||0);const ledger=ops.budget&&ops.budget[0];const spend=ledger?Number(ledger.actual_usd||0).toFixed(2):'—';const reserved=ledger?Number(ledger.reserved_usd||0).toFixed(2):'—';const stateClass=pipe&&pipe.state==='READY_FOR_REVIEW'?'ok':'warn';const nicheClass=niche&&niche.status==='PRIMARY'?'ok':'warn';document.getElementById('app').innerHTML='<div class="card"><div class="label">System</div><div class="value ok">ONLINE</div><div class="muted">'+esc(s.version)+'</div></div><div class="card"><div class="label">Queue</div><div class="value '+(dead?'bad':queued?'warn':'ok')+'">'+queued+' queued</div><div class="muted">'+running+' running · '+dead+' dead</div></div><div class="card"><div class="label">Daily spend</div><div class="value">$'+spend+'</div><div class="muted">$'+reserved+' reserved</div></div><div class="card"><div class="label">Niche decision</div><div class="value '+nicheClass+'">'+esc(niche?niche.status:'NO DATA')+'</div><div class="muted">'+esc(niche&&niche.label?niche.label:'Awaiting live evidence')+'</div></div><div class="card"><div class="label">Latest pipeline</div><div class="value '+stateClass+'">'+esc(pipe?pipe.state:'NO LOCAL RUN')+'</div><div class="muted">QA '+esc(pipe&&pipe.qa?pipe.qa.score:'—')+'</div></div><div class="card wide"><div class="label">Human review queue</div>'+reviewHtml(ops.reviewQueue||[],Boolean(ops.mutationsEnabled))+'</div><div class="card wide"><div class="label">Recent production runs</div><pre>'+esc(JSON.stringify(ops.recentRuns||[],null,2))+'</pre></div><div class="card wide"><div class="label">Dead-letter queue</div><pre>'+esc(JSON.stringify(ops.deadLetters||[],null,2))+'</pre></div><div class="card wide"><div class="label">Niche ranking</div><pre>'+esc(JSON.stringify(s.niche&&s.niche.niches?s.niche.niches:[],null,2))+'</pre></div>';}load();setInterval(load,15000);</script></body></html>`;

const server = http.createServer(async (req, res) => {
  try{
    const url=new URL(req.url ?? '/',`http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname === '/api/status' && req.method==='GET') {
      const [niche, pipeline, ops] = await Promise.all([jsonFile('.data/niche-live-latest.json'), jsonFile('.data/pipeline-mock-latest.json'),opsStatus()]);
      return send(res, 200, { version: 'v0.8-dev', niche, pipeline, ops, generatedAt: new Date().toISOString() });
    }
    if (url.pathname === '/health' && req.method==='GET') {
      const ops=await opsStatus();
      return send(res, ops.available || !db ? 200 : 503, { ok:ops.available || !db,database:ops.available,mutationsEnabled:Boolean(controlToken) });
    }
    const match=url.pathname.match(/^\/api\/review\/([0-9a-f-]+)\/(approve|reject|schedule)$/i);
    if(match && req.method==='POST') return await reviewAction(req,res,match[1],match[2].toLowerCase());
    if(url.pathname.startsWith('/api/')) return send(res,404,{error:'Not found'});
    return send(res, 200, html, 'text/html; charset=utf-8');
  } catch(error){return send(res,500,{error:error instanceof Error?error.message:String(error)});}
});
server.listen(port, () => console.log(`auto-ytb control plane: http://localhost:${port}`));
