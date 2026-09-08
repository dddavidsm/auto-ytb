type RetentionPoint={elapsed_ratio?:number;audience_watch_ratio?:number;elapsedRatio?:number;audienceWatchRatio?:number};
type Segment={segment_type?:string;segment_key?:string;start_seconds?:number;end_seconds?:number;start_ratio?:number;end_ratio?:number;start_retention?:number;end_retention?:number;average_retention?:number;retention_delta?:number;local_dips?:number;local_spikes?:number;features?:Record<string,unknown>};

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
const pct=(value:unknown)=>`${(n(value)*100).toFixed(1)}%`;
const seconds=(value:unknown)=>{const total=Math.max(0,Math.round(n(value)));const minutes=Math.floor(total/60);const rest=String(total%60).padStart(2,'0');return `${minutes}:${rest}`;};

export function RetentionTimeline({points,segments}:{points:RetentionPoint[];segments:Segment[]}){
  const normalized=points.map((point)=>({x:n(point.elapsed_ratio??point.elapsedRatio),y:n(point.audience_watch_ratio??point.audienceWatchRatio)})).filter((point)=>Number.isFinite(point.x)&&Number.isFinite(point.y)).sort((a,b)=>a.x-b.x);
  if(normalized.length<2)return <div className="empty">La curva Retention × Timeline aparecerá después de recibir datos suficientes de YouTube Analytics.</div>;
  const width=1000,height=270,left=58,right=18,top=18,bottom=42,plotW=width-left-right,plotH=height-top-bottom;
  const maxRetention=Math.max(1.05,Math.min(1.5,Math.max(...normalized.map((point)=>point.y))*1.05));
  const x=(ratio:number)=>left+clamp(ratio,0,1)*plotW;
  const y=(retention:number)=>top+(1-clamp(retention,0,maxRetention)/maxRetention)*plotH;
  const polyline=normalized.map((point)=>`${x(point.x).toFixed(1)},${y(point.y).toFixed(1)}`).join(' ');
  const interesting=[...segments].filter((segment)=>n(segment.local_dips)>0||n(segment.local_spikes)>0||Math.abs(n(segment.retention_delta))>=0.035).sort((a,b)=>Math.abs(n(b.retention_delta))-Math.abs(n(a.retention_delta))).slice(0,10);
  const grids=[1,.75,.5,.25].filter((value)=>value<=maxRetention);
  return <div className="retention-wrap">
    <svg className="retention-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Audience retention curve aligned with the video timeline">
      {grids.map((value)=><g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} className="chart-grid"/><text x={8} y={y(value)+4} className="chart-label">{Math.round(value*100)}%</text></g>)}
      {[0,.25,.5,.75,1].map((value)=><g key={value}><line x1={x(value)} x2={x(value)} y1={top} y2={height-bottom} className="chart-grid vertical"/><text x={x(value)} y={height-13} textAnchor="middle" className="chart-label">{Math.round(value*100)}%</text></g>)}
      {segments.filter((segment)=>segment.segment_type==='beat').map((segment,index)=>{const start=x(n(segment.start_ratio)),end=x(n(segment.end_ratio));const delta=n(segment.retention_delta);const className=delta<=-.05?'segment-band dip':delta>=.04?'segment-band spike':'segment-band';return <rect key={`${segment.segment_key}:${index}`} x={start} y={top} width={Math.max(1,end-start)} height={plotH} className={className}/>;})}
      <polyline points={polyline} className="retention-line" fill="none"/>
      {normalized.map((point,index)=>index%Math.max(1,Math.floor(normalized.length/18))===0?<circle key={index} cx={x(point.x)} cy={y(point.y)} r="3.2" className="retention-dot"/>:null)}
    </svg>
    <div className="timeline-legend"><span><i className="legend-line"/> Retención</span><span><i className="legend-block dip"/> caída local</span><span><i className="legend-block spike"/> pico local</span></div>
    {interesting.length?<div className="timeline-events">{interesting.map((segment,index)=>{const delta=n(segment.retention_delta);const feature=segment.features??{};return <div className="timeline-event" key={`${segment.segment_type}:${segment.segment_key}:${index}`}><div><strong>{seconds(segment.start_seconds)} · {segment.segment_type} {String(segment.segment_key??'')}</strong><div className="fine">{String(feature.purpose??feature.kind??feature.retentionDevice??'creative segment')} · avg {pct(segment.average_retention)}</div></div><div className={delta<0?'delta bad-text':'delta good-text'}>{delta>=0?'+':''}{(delta*100).toFixed(1)} pp</div></div>;})}</div>:null}
  </div>;
}
