import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const port = Number(process.env.PORT ?? 4310);

async function jsonFile(path) {
  const full = resolve(root, path);
  if (!existsSync(full)) return null;
  try { return JSON.parse(await readFile(full, 'utf8')); } catch { return null; }
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}

const html = String.raw`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>auto-ytb control</title><style>:root{font-family:Inter,system-ui,sans-serif;background:#0a0a0b;color:#f3f3f3}body{margin:0}.wrap{max-width:1200px;margin:auto;padding:40px 24px}h1{font-size:34px;margin:0 0 6px}.sub{color:#9c9ca3;margin-bottom:30px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}.card{background:#141416;border:1px solid #29292d;border-radius:16px;padding:18px}.label{color:#8e8e96;font-size:12px;text-transform:uppercase;letter-spacing:.1em}.value{font-size:25px;font-weight:700;margin-top:8px}.ok{color:#7ee787}.warn{color:#f2cc60}.muted{color:#9c9ca3}.wide{grid-column:1/-1}pre{white-space:pre-wrap;font-size:12px;color:#c6c6ce;max-height:420px;overflow:auto}</style></head><body><div class="wrap"><h1>auto-ytb</h1><div class="sub">Autonomous YouTube Intelligence & Production OS</div><div id="app" class="grid"></div></div><script>async function load(){const s=await fetch('/api/status').then(function(r){return r.json()});const niche=s.niche&&s.niche.decision;const pipe=s.pipeline;const stateClass=pipe&&pipe.state==='READY_FOR_REVIEW'?'ok':'warn';const nicheClass=niche&&niche.status==='PRIMARY'?'ok':'warn';const cost=pipe&&pipe.manifest&&typeof pipe.manifest.estimatedCostUsd==='number'?pipe.manifest.estimatedCostUsd.toFixed(2):'—';document.getElementById('app').innerHTML='<div class="card"><div class="label">System</div><div class="value ok">ONLINE</div><div class="muted">'+s.version+'</div></div>'+'<div class="card"><div class="label">Niche decision</div><div class="value '+nicheClass+'">'+(niche?niche.status:'NO DATA')+'</div><div class="muted">'+(niche&&niche.label?niche.label:'Run niche:live')+'</div></div>'+'<div class="card"><div class="label">Latest pipeline</div><div class="value '+stateClass+'">'+(pipe?pipe.state:'NO RUN')+'</div><div class="muted">QA '+(pipe&&pipe.qa?pipe.qa.score:'—')+'</div></div>'+'<div class="card"><div class="label">Production cost</div><div class="value">$'+cost+'</div><div class="muted">estimated per latest run</div></div>'+'<div class="card wide"><div class="label">Pipeline events</div><pre>'+JSON.stringify(pipe&&pipe.events?pipe.events:[],null,2)+'</pre></div>'+'<div class="card wide"><div class="label">Niche ranking</div><pre>'+JSON.stringify(s.niche&&s.niche.niches?s.niche.niches:[],null,2)+'</pre></div>';}load();setInterval(load,30000);</script></body></html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/status') {
    const [niche, pipeline] = await Promise.all([jsonFile('.data/niche-live-latest.json'), jsonFile('.data/pipeline-mock-latest.json')]);
    return send(res, 200, { version: 'v0.6', niche, pipeline, generatedAt: new Date().toISOString() });
  }
  if (req.url === '/health') return send(res, 200, { ok: true });
  return send(res, 200, html, 'text/html; charset=utf-8');
});
server.listen(port, () => console.log(`auto-ytb control plane: http://localhost:${port}`));
