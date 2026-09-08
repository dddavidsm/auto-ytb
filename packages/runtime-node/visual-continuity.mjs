const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,Number(value??0)));

export function decideVisualContinuity(inspections,options={}){
  const minOverall=clamp(options.minOverall??80);
  const minCharacter=clamp(options.minCharacter??84);
  const minStyle=clamp(options.minStyle??78);
  const hardCharacter=clamp(options.hardCharacter??65);
  const hardStyle=clamp(options.hardStyle??60);
  const rows=(Array.isArray(inspections)?inspections:[]).map((item)=>({
    ...item,
    overallScore:clamp(item?.overallScore),
    characterIdentityScore:clamp(item?.characterIdentityScore??100),
    styleScore:clamp(item?.styleScore),
    paletteScore:clamp(item?.paletteScore),
    compositionScore:clamp(item?.compositionScore),
    confidence:clamp(item?.confidence),
    characterVisible:Boolean(item?.characterVisible),
    issues:Array.isArray(item?.issues)?item.issues:[],
  }));
  if(!rows.length)return{passed:false,status:'blocked',score:0,issues:['no-visual-inspections'],metrics:{inspected:0,characterScenes:0}};
  const blocking=[];const warnings=[];
  for(const row of rows){
    if(row.overallScore<65)blocking.push(`${row.sceneId??'unknown'}: severe overall visual drift (${row.overallScore})`);
    if(row.styleScore<hardStyle)blocking.push(`${row.sceneId??'unknown'}: severe style drift (${row.styleScore})`);
    else if(row.styleScore<minStyle)warnings.push(`${row.sceneId??'unknown'}: style below target (${row.styleScore})`);
    if(row.characterVisible&&row.characterIdentityScore<hardCharacter)blocking.push(`${row.sceneId??'unknown'}: severe character identity drift (${row.characterIdentityScore})`);
    else if(row.characterVisible&&row.characterIdentityScore<minCharacter)warnings.push(`${row.sceneId??'unknown'}: character identity below target (${row.characterIdentityScore})`);
    if(row.overallScore<minOverall&&row.overallScore>=65)warnings.push(`${row.sceneId??'unknown'}: overall continuity below target (${row.overallScore})`);
    for(const issue of row.issues){
      const message=String(issue?.message??issue?.code??'visual issue');
      if(String(issue?.severity??'WARN').toUpperCase()==='BLOCK')blocking.push(`${row.sceneId??'unknown'}: ${message}`);
      else warnings.push(`${row.sceneId??'unknown'}: ${message}`);
    }
  }
  const weightSum=rows.reduce((sum,row)=>sum+Math.max(0.25,row.confidence/100),0);
  const score=Math.round(rows.reduce((sum,row)=>sum+row.overallScore*Math.max(0.25,row.confidence/100),0)/Math.max(0.25,weightSum));
  if(score<72)blocking.push(`episode-average: severe visual continuity drift (${score})`);
  else if(score<minOverall)warnings.push(`episode-average: visual continuity below target (${score})`);
  const passed=blocking.length===0;
  return{passed,status:passed?(warnings.length?'warn':'passed'):'blocked',score,issues:[...blocking,...warnings],blocking,warnings,metrics:{inspected:rows.length,characterScenes:rows.filter((row)=>row.characterVisible).length,minOverall,minCharacter,minStyle}};
}
