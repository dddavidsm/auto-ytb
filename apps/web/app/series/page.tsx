import Link from 'next/link';
import { requireSession } from '../../lib/auth';
import { query } from '../../lib/db';

export const dynamic='force-dynamic';
const compact=(v:unknown)=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(Number(v||0));
const money=(v:unknown)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(v||0));
const pill=(value:unknown)=>{const s=String(value||'').toLowerCase();return ['active','continue','scale','passed'].some((x)=>s.includes(x))?'good':['paused','conflict','blocked'].some((x)=>s.includes(x))?'bad':'warn';};

export default async function SeriesPage(){
  await requireSession();
  const rows:any[]=await query(`select s.id,s.series_key,s.title,s.language,s.audience_mode,s.target_age_min,s.target_age_max,s.lifecycle_state,s.current_bible_version,s.performance_policy,
      c.title as channel_title,c.channel_key,
      coalesce(ec.episodes,0)::int as episodes,coalesce(ec.published,0)::int as published,coalesce(ec.conflicts,0)::int as conflicts,
      sd.decision as strategy_decision,sd.confidence::float as strategy_confidence,sd.score::float as strategy_score,sd.rationale as strategy_rationale,
      ps.views,ps.average_view_percentage::float,ps.roi::float,ps.profit_usd::float,ps.watch_minutes_per_dollar::float,ps.sample_size
    from series s join channels c on c.id=s.channel_id
    left join lateral (select count(*) episodes,count(*) filter(where status='published') published,count(*) filter(where continuity_status in ('conflict','blocked')) conflicts from series_episodes x where x.series_id=s.id) ec on true
    left join lateral (select * from series_strategy_decisions x where x.series_id=s.id order by observed_at desc limit 1) sd on true
    left join lateral (select * from series_performance_snapshots x where x.series_id=s.id order by observed_at desc limit 1) ps on true
    order by case s.lifecycle_state when 'active' then 0 when 'paused' then 1 else 2 end,coalesce(ps.profit_usd,0) desc,s.updated_at desc`);
  return <div className="content"><header className="topbar"><div><p className="eyebrow">IP / Series Memory</p><h1>Series Continuity</h1></div><Link href="/" className="pill info">← Portfolio</Link></header><main className="main">
    <section className="section"><div className="section-head"><div><p className="eyebrow">Persistent franchises</p><h2>Series activas y memoria</h2></div><span className="fine">Bible versionada · personajes · mundo · episodios · rendimiento</span></div>
      <div className="cards">{rows.map((row)=><article className="card" key={row.id}>
        <div className="row"><div><h3><Link className="run-link" href={`/series/${row.id}`}>{row.title}</Link></h3><div className="meta">{row.channel_title||row.channel_key} · {String(row.language||'en').toUpperCase()}</div></div><span className={`pill ${pill(row.lifecycle_state)}`}>{row.lifecycle_state}</span></div>
        <div className="row" style={{marginTop:10}}><span className={`pill ${row.audience_mode==='MADE_FOR_KIDS'?'warn':'info'}`}>{row.audience_mode==='MADE_FOR_KIDS'?`Kids ${row.target_age_min??'?'}–${row.target_age_max??'?'}`:'General audience'}</span><span className="pill">Bible v{row.current_bible_version}</span></div>
        <div className="kpis" style={{marginTop:14}}><div className="kpi"><span>Episodes</span><strong>{row.episodes}</strong></div><div className="kpi"><span>Views</span><strong>{row.views==null?'—':compact(row.views)}</strong></div><div className="kpi"><span>AVP</span><strong>{row.average_view_percentage==null?'—':`${Number(row.average_view_percentage).toFixed(1)}%`}</strong></div></div>
        <div className="kpis"><div className="kpi"><span>Profit</span><strong>{row.profit_usd==null?'—':money(row.profit_usd)}</strong></div><div className="kpi"><span>ROI</span><strong>{row.roi==null?'—':`${Number(row.roi).toFixed(2)}x`}</strong></div><div className="kpi"><span>Conflicts</span><strong>{row.conflicts}</strong></div></div>
        <div className="list" style={{marginTop:14}}><div className="list-item"><span>Strategy</span><span className={`pill ${pill(row.strategy_decision)}`}>{row.strategy_decision||'LEARN'}</span></div><div className="list-item"><span>Confidence</span><strong>{row.strategy_confidence==null?'—':`${(Number(row.strategy_confidence)*100).toFixed(0)}%`}</strong></div><div className="list-item"><span>Watch min / $</span><strong>{row.watch_minutes_per_dollar==null?'—':Number(row.watch_minutes_per_dollar).toFixed(1)}</strong></div></div>
      </article>)}{!rows.length?<div className="card empty">Aún no hay series persistentes. Cuando el router detecte contenido episódico/personajes recurrentes, aparecerán aquí automáticamente.</div>:null}</div>
    </section>
  </main></div>;
}
