import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import { loadRun } from '../../../lib/data';
import { RetentionTimeline } from '../../../components/retention-timeline';

export const dynamic='force-dynamic';
const money=(v:unknown)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(v||0));
const compact=(v:unknown)=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(Number(v||0));
const pretty=(v:unknown)=>JSON.stringify(v??{},null,2);
const percent=(v:unknown,digits=1)=>`${Number(v||0).toFixed(digits)}%`;
const pill=(state:unknown)=>{const s=String(state||'').toLowerCase();return s.includes('pass')||s.includes('ready')||s.includes('public')||s.includes('schedule')?'good':s.includes('fail')||s.includes('block')||s.includes('keep_private')?'bad':'warn';};

export default async function VideoPage({params}:{params:Promise<{id:string}>}){
  await requireSession();
  const {id}=await params;
  const run:any=await loadRun(id);
  if(!run)notFound();
  const attention=run.qa_report?.attention??run.metadata?.attention;
  const finalInspection=run.qa_report?.finalInspection??run.metadata?.finalInspection;
  const autonomousPublication=run.metadata?.autonomousPublication??null;
  const gate=autonomousPublication?.gateSnapshot??null;
  const releaseSafety=gate?.releaseSafety??null;
  const renderUri=String(run.metadata?.renderUri??'');
  const canPreview=renderUri.startsWith('file://')||renderUri.startsWith('/')||renderUri.startsWith('.');
  const fingerprint=run.fingerprint?.fingerprint??run.fingerprint??{};
  const script=run.script??{};
  const analytics=run.analytics??{};
  const audienceGroups=new Map<string,any[]>();
  for(const row of run.audienceContexts??[]){const key=String(row.context_type??'other');const list=audienceGroups.get(key)??[];list.push(row);audienceGroups.set(key,list);}
  return <div className="content">
    <header className="topbar"><div><p className="eyebrow">Video review</p><h1>{run.working_title||run.angle||id}</h1></div><Link href="/" className="pill info">← Portfolio</Link></header>
    <main className="main">
      <div className="detail-grid">
        <div>
          <section className="video-shell">{canPreview?<video controls preload="metadata" src={`/api/videos/${id}/stream`}/>:<div className="muted">Render no disponible en almacenamiento local.</div>}</section>
          <section className="section card">
            <div className="row"><div><p className="eyebrow">Readiness</p><h2>Autorevisión final</h2></div><span className={`pill ${pill(run.state)}`}>{run.state}</span></div>
            <div className="metric-grid detail-metrics">
              <div className="metric"><div className="label">QA</div><div className="value">{run.qa_score??'—'}</div></div>
              <div className="metric"><div className="label">Attention</div><div className="value">{attention?.score??'—'}</div></div>
              <div className="metric"><div className="label">Render QA</div><div className="value">{finalInspection?.score??'—'}</div></div>
              <div className="metric"><div className="label">Opportunity</div><div className="value">{run.opportunity_score??'—'}</div></div>
              <div className="metric"><div className="label">Views</div><div className="value">{analytics.views==null?'—':compact(analytics.views)}</div></div>
              <div className="metric"><div className="label">AVP</div><div className="value">{analytics.average_view_percentage==null?'—':percent(analytics.average_view_percentage)}</div></div>
            </div>
            {attention?.dimensions?.length?<div className="list" style={{marginTop:14}}>{attention.dimensions.map((d:any)=><div className="list-item" key={d.id}><div><strong>{d.id}</strong><div className="fine">{d.message}</div></div><span className={`pill ${d.score>=85?'good':d.score>=70?'warn':'bad'}`}>{Math.round(d.score)}</span></div>)}</div>:null}
          </section>
        </div>
        <aside>
          <section className="card"><p className="eyebrow">Economics</p><h2>Economía</h2><div className="list"><div className="list-item"><span>Coste</span><strong>{money(run.economic_cost??run.total_cost_usd)}</strong></div><div className="list-item"><span>Revenue</span><strong>{money(run.total_revenue_usd)}</strong></div><div className="list-item"><span>Profit</span><strong>{money(run.profit_usd)}</strong></div><div className="list-item"><span>ROI</span><strong>{run.roi==null?'—':`${Number(run.roi).toFixed(2)}x`}</strong></div><div className="list-item"><span>Watch min / $</span><strong>{run.watch_minutes_per_dollar==null?'—':Number(run.watch_minutes_per_dollar).toFixed(1)}</strong></div></div></section>
          <section className="section card"><p className="eyebrow">Provider ledger</p><h2>Coste desglosado</h2><div className="list">{run.costs?.map((c:any)=><div className="list-item" key={`${c.stage}:${c.provider}:${c.model}`}><div><strong>{c.stage}</strong><div className="fine">{c.provider} · {c.model}</div></div><strong>{money(c.cost)}</strong></div>)}{!run.costs?.length?<div className="empty">Sin costes registrados.</div>:null}</div></section>
          {run.youtube_video_id?<section className="section card"><p className="eyebrow">YouTube</p><h2>Private upload</h2><a className="run-link" target="_blank" rel="noreferrer" href={`https://www.youtube.com/watch?v=${run.youtube_video_id}`}>Abrir vídeo privado ↗</a><div className="fine" style={{marginTop:8}}>Estado: {run.publication_state}</div></section>:null}
          <section className="section card">
            <div className="row"><div><p className="eyebrow">Autonomous release</p><h2>Publication gate</h2></div><span className={`pill ${pill(autonomousPublication?.action)}`}>{autonomousPublication?.action??'NOT_EVALUATED'}</span></div>
            {gate?<div className="list">
              <div className="list-item"><span>QA</span><strong>{gate.qaScore} / {gate.minimumQaScore}</strong></div>
              <div className="list-item"><span>Research</span><strong>{gate.researchConfidence} / {gate.minimumResearchConfidence}</strong></div>
              <div className="list-item"><span>Attention</span><strong>{gate.attentionScore} / {gate.minimumAttentionScore}</strong></div>
              <div className="list-item"><span>Media QA</span><strong>{gate.finalMediaScore} / {gate.minimumFinalMediaScore}</strong></div>
              <div className="list-item"><span>Cost cap</span><strong>{money(gate.totalCostUsd)} / {money(gate.maximumAutoPublishCostUsd)}</strong></div>
              <div className="list-item"><span>Audio rights</span><span className={`pill ${releaseSafety?.audioReady===false?'bad':'good'}`}>{releaseSafety?.audioReady===false?'BLOCK':'READY'}</span></div>
              <div className="list-item"><span>Brand continuity</span><span className={`pill ${releaseSafety?.brandReady===false?'bad':'good'}`}>{releaseSafety?.brandReady===false?'BLOCK':'READY'}</span></div>
            </div>:<div className="empty">El gate se evaluará tras el upload privado.</div>}
            {autonomousPublication?.reasons?.length?<div style={{marginTop:12}}>{autonomousPublication.reasons.map((reason:string,index:number)=><div className="fine" key={`${index}:${reason}`}>• {reason}</div>)}</div>:null}
            {releaseSafety?.issues?.length?<div className="error" style={{marginTop:12}}>{releaseSafety.issues.map((issue:string,index:number)=><div key={`${index}:${issue}`}>• {issue}</div>)}</div>:null}
          </section>
        </aside>
      </div>

      <section className="section card">
        <div className="section-head"><div><p className="eyebrow">Creative Performance Lab</p><h2>Retention × Timeline</h2></div><span className="fine">Dips y spikes alineados con beats, escenas y recursos visuales</span></div>
        <RetentionTimeline points={run.retention??[]} segments={run.segments??[]}/>
      </section>

      <section className="section split">
        <div className="card"><p className="eyebrow">Creative fingerprint</p><h2>Huella creativa</h2><div className="kpis fingerprint-kpis"><div className="kpi"><span>Hook</span><strong>{String(fingerprint.hookRetentionDevice??run.fingerprint?.hook_retention_device??'—')}</strong></div><div className="kpi"><span>Narrative</span><strong>{String(fingerprint.narrativeArchetype??run.fingerprint?.narrative_archetype??'—')}</strong></div><div className="kpi"><span>Scenes</span><strong>{fingerprint.sceneCount??run.fingerprint?.scene_count??'—'}</strong></div></div><div className="list" style={{marginTop:12}}>{Object.entries(fingerprint.visualMix??run.fingerprint?.visual_mix??{}).map(([kind,count])=><div className="list-item" key={kind}><span>{kind}</span><strong>{String(count)}</strong></div>)}</div></div>
        <div className="card"><p className="eyebrow">Audience context</p><h2>Quién y desde dónde mira</h2>{audienceGroups.size?<div className="context-grid">{[...audienceGroups.entries()].map(([type,rows])=><div className="context-group" key={type}><strong>{type}</strong>{rows.slice(0,4).map((row:any)=><div className="context-row" key={`${type}:${row.context_value}`}><span>{String(row.context_value)}</span><span>{compact(row.views)}</span></div>)}</div>)}</div>:<div className="empty">El contexto aparecerá cuando YouTube Analytics lo exponga para este vídeo.</div>}</div>
      </section>

      <section className="section split">
        <div className="card"><p className="eyebrow">Script</p><h2>Guion final</h2>{script.beats?.length?<div className="script-beats">{script.beats.map((beat:any)=><article className="script-beat" key={beat.id}><div className="row"><strong>{beat.purpose} · {Math.round(Number(beat.startSec||0))}s</strong><span className="pill info">{beat.retentionDevice||'none'}</span></div><p>{beat.narration}</p><div className="fine">Visual: {beat.visualIntent}</div></article>)}</div>:<div className="code-box">{pretty(script)}</div>}</div>
        <div className="card"><p className="eyebrow">Final inspection</p><h2>Media QA</h2><div className="code-box">{pretty(finalInspection)}</div></div>
      </section>
    </main>
  </div>;
}
