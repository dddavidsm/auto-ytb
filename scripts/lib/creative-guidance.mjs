const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const num=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?n:fallback;};

function evidenceScore(row){
  const avp=num(row.average_video_avp);
  const localDelta=num(row.average_retention_delta)*100;
  const segment=num(row.average_segment_retention)*100;
  const share=num(row.average_share_rate);
  const roi=clamp(num(row.average_roi),-1,3);
  const confidence=clamp(num(row.confidence),0,1);
  const base=avp+localDelta*0.22+Math.max(0,segment-avp)*0.08+share*1.2+roi*1.8;
  return base*(0.55+confidence*0.45);
}
function usable(row){return num(row.sample_size)>=3&&num(row.confidence)>=0.32&&num(row.weighted_views)>=300;}
function midpoint(bucket){const map={'<5s':4,'5-8s':6.5,'8-12s':10,'12-18s':15,'18s+':20,'<4':15,'4-7':10,'7-11':7,'11-18':4.5,'18+':3};return map[bucket]??null;}

export function buildCreativeLearningGuidance(rows=[]){
  const latest=new Map();
  for(const row of rows){const key=`${row.feature_name}|${row.feature_value}`;if(!latest.has(key))latest.set(key,row);}
  const grouped=new Map();
  for(const row of latest.values()){if(!usable(row))continue;const bucket=grouped.get(row.feature_name)??[];bucket.push({...row,evidenceScore:evidenceScore(row)});grouped.set(row.feature_name,bucket);}
  const winners=[];
  for(const [featureName,items] of grouped){if(items.length<2)continue;items.sort((a,b)=>b.evidenceScore-a.evidenceScore);const best=items[0],runner=items[1];const advantage=best.evidenceScore-runner.evidenceScore;if(advantage<3.5||num(best.confidence)<0.42)continue;winners.push({featureName,featureValue:String(best.feature_value),advantage:Math.round(advantage*10)/10,sampleSize:num(best.sample_size),confidence:num(best.confidence),score:Math.round(best.evidenceScore*10)/10});}
  const guidance=[];let targetSceneDurationSec=null;
  for(const winner of winners){
    if(winner.featureName==='video:hookRetentionDevice'||winner.featureName==='segment:beat:retentionDevice')guidance.push(`Owned-channel evidence favors the ${winner.featureValue} retention device for this format. Use it when it fits the story naturally; do not force it when the premise requires another opening.`);
    else if(winner.featureName==='video:narrativeArchetype')guidance.push(`Owned-channel evidence currently favors the ${winner.featureValue} narrative progression. Preserve the topic-specific story, but use this progression as the structural prior.`);
    else if(winner.featureName==='video:averageSceneDuration'){targetSceneDurationSec=midpoint(winner.featureValue);guidance.push(`Owned-channel evidence favors average scene durations around ${winner.featureValue}. Treat this as a pacing prior, not a fixed cut interval.`);}
    else if(winner.featureName==='video:visualChangeRate'){const seconds=midpoint(winner.featureValue);if(seconds!=null)targetSceneDurationSec=targetSceneDurationSec==null?seconds:(targetSceneDurationSec+seconds)/2;guidance.push(`Owned-channel evidence favors roughly ${winner.featureValue} visual changes per minute. Use meaningful changes at narrative transitions rather than arbitrary cuts.`);}
    else if(winner.featureName==='segment:scene:kind')guidance.push(`Segments using ${winner.featureValue} visuals currently show stronger local retention. Prefer this visual mode when it communicates the beat more clearly and rights/cost gates allow it.`);
    else if(winner.featureName==='video:dominantVisualKind')guidance.push(`Videos led by ${winner.featureValue} currently outperform alternatives. Keep visual diversity, but use ${winner.featureValue} as the default explanatory mode where appropriate.`);
  }
  return{guidance:guidance.join('\n'),targetSceneDurationSec:targetSceneDurationSec==null?null:Math.round(targetSceneDurationSec*10)/10,winners};
}
