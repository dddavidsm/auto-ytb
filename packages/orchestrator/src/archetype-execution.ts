import type { ResearchDossier, StoryAngle } from '@auto-ytb/editorial';
import type { ContentExecutionPlan, ProductionContentFormat, ProductionManifest } from '@auto-ytb/production';
import type { QaReport } from '@auto-ytb/qa';

export type ContentArchetypeRuntimeProfile = {
  id?: string;
  label?: string;
  voiceMode?: string;
  realityMode?: string;
  cameraProfile?: string;
  syntheticDisclosurePolicy?: string;
  preferredFormats?: ProductionContentFormat[];
  allowIntegratedNarrator?: boolean;
  requiresCanonicalCast?: boolean;
  researchRequired?: boolean;
  factClaimMode?: string;
  targetSceneDurationSec?: { short?: number; long?: number };
  generativeSpendBias?: number;
  [key: string]: unknown;
};

export type ContentArchetypeRuntimeDecision = {
  archetype?: string;
  confidence?: number;
  reasons?: string[];
  profile?: ContentArchetypeRuntimeProfile;
};

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

export function buildArchetypeExecutionPlan(decision: ContentArchetypeRuntimeDecision | undefined, contentFormat: ProductionContentFormat): ContentExecutionPlan {
  const profile=decision?.profile??{};
  const voiceMode=String(profile.voiceMode??'SINGLE_NARRATOR');
  const researchRequired=profile.researchRequired!==false;
  const factClaimMode=String(profile.factClaimMode??(researchRequired?'VERIFY_CLAIMS':'CREATIVE_ORIGINAL')) as ContentExecutionPlan['factClaimMode'];
  const requiresCanonicalCast=profile.requiresCanonicalCast===true;
  const realityMode=String(profile.realityMode??(researchRequired?'FACTUAL':'ORIGINAL_FICTION'));
  const generativeSpendBias=clamp(Number(profile.generativeSpendBias??0.65),0,1);
  const scriptMode:ContentExecutionPlan['scriptMode']=voiceMode==='NONE'
    ?'VISUAL_ACTION'
    :voiceMode==='MULTI_CHARACTER_DIALOGUE'
      ?'DIALOGUE'
      :voiceMode==='HYBRID_DIALOGUE_NARRATION'
        ?'HYBRID'
        :'NARRATION';
  const audioMode:ContentExecutionPlan['audioMode']=voiceMode==='NONE'
    ?'NATURAL_SOUND'
    :voiceMode==='MULTI_CHARACTER_DIALOGUE'
      ?'DIALOGUE_LED'
      :voiceMode==='HYBRID_DIALOGUE_NARRATION'
        ?'HYBRID'
        :'NARRATION_LED';
  const captionMode:ContentExecutionPlan['captionMode']=voiceMode==='NONE'
    ?'CONTEXT_ONLY'
    :voiceMode==='MULTI_CHARACTER_DIALOGUE'||voiceMode==='HYBRID_DIALOGUE_NARRATION'
      ?'SPEAKER_AWARE'
      :'FULL_SPEECH';
  const visualMode:ContentExecutionPlan['visualMode']=requiresCanonicalCast
    ?'CHARACTER_CONTINUITY'
    :realityMode==='REALISTIC_SYNTHETIC'||(!researchRequired&&generativeSpendBias>=0.72)
      ?'GENERATIVE_FIRST'
      :researchRequired
        ?'EVIDENCE_FIRST'
        :'HYBRID';
  const targetSceneDurationSec=contentFormat==='SHORT_VERTICAL'
    ? Number(profile.targetSceneDurationSec?.short??0)||undefined
    : Number(profile.targetSceneDurationSec?.long??0)||undefined;
  const preferredFormats=Array.isArray(profile.preferredFormats)&&profile.preferredFormats.length
    ? profile.preferredFormats
    : ['LONG_HORIZONTAL','SHORT_VERTICAL'] as ProductionContentFormat[];
  return {
    archetypeId:String(decision?.archetype??profile.id??'DEFAULT_FACTUAL'),
    researchMode:researchRequired?'FACTUAL_RESEARCH':'CREATIVE_ORIGINAL',
    researchRequired,
    factClaimMode,
    scriptMode,
    voiceMode,
    voiceRequired:voiceMode!=='NONE',
    allowIntegratedNarrator:profile.allowIntegratedNarrator===true,
    requiresCanonicalCast,
    audioMode,
    captionMode,
    visualMode,
    realityMode,
    cameraProfile:String(profile.cameraProfile??'POLISHED_DOCUMENTARY'),
    syntheticDisclosurePolicy:String(profile.syntheticDisclosurePolicy??'REQUIRED_WHEN_PLATFORM_POLICY_APPLIES'),
    preferredFormats,
    targetSceneDurationSec,
    generativeSpendBias,
    requiredCapabilities:{search:researchRequired,voice:voiceMode!=='NONE',image:true,video:visualMode==='GENERATIVE_FIRST'||visualMode==='CHARACTER_CONTINUITY'},
  };
}

export function buildCreativeDossier(topic:string, decision:ContentArchetypeRuntimeDecision|undefined):ResearchDossier{
  const archetype=String(decision?.archetype??decision?.profile?.id??'CREATIVE_ORIGINAL');
  const angle:StoryAngle={
    id:'creative-original',
    title:topic,
    thesis:`Create an original ${archetype} production around ${topic}.`,
    viewerPromise:topic,
    hook:`Open on the most immediately understandable action, problem, surprise or curiosity in ${topic}.`,
    novelty:88,
    emotionalPull:82,
    retentionPotential:86,
    monetizationFit:70,
    evidenceFit:100,
    productionFit:88,
    risk:10,
    score:86,
  };
  return{
    topic,
    generatedAt:new Date().toISOString(),
    executiveSummary:`Original ${archetype} production. Factual research was intentionally skipped because the selected Content Archetype is creative-original; invented elements must not be presented as real-world evidence.`,
    sources:[],
    claims:[],
    contradictions:[],
    timeline:[],
    angles:[angle],
    recommendedAngleId:angle.id,
    researchConfidence:100,
    blockingIssues:[],
  };
}

function replaceCheck(report:QaReport,id:string,status:'PASS'|'WARN'|'FAIL',score:number,message:string):void{
  const index=report.checks.findIndex((check)=>check.id===id);
  const next={id,status,score,message};
  if(index>=0)report.checks[index]=next;
  else report.checks.push(next);
}

export function reconcileQaForExecutionPlan(base:QaReport, manifest:ProductionManifest, plan:ContentExecutionPlan):QaReport{
  const report:QaReport&{contentArchetype?:ProductionManifest['contentArchetype'];executionPlan?:ProductionManifest['executionPlan']}={...base,checks:base.checks.map((check)=>({...check})),blockers:[...base.blockers]};
  if(!plan.researchRequired){
    replaceCheck(report,'factual','PASS',100,`Factual research intentionally skipped for ${plan.archetypeId}; creative-original safety rules apply instead.`);
  }
  if(!plan.voiceRequired){
    replaceCheck(report,'audio-visual-sync','PASS',100,`No synthesized narration is required for ${plan.archetypeId}; scene timing is visual-first.`);
  }
  const detectedSynthetic=manifest.scenes.some((scene)=>scene.generated)||manifest.assets.some((asset)=>asset.generated);
  const disclosureMismatch=detectedSynthetic!==Boolean(manifest.containsSyntheticMedia);
  replaceCheck(
    report,
    'synthetic-disclosure',
    disclosureMismatch?'FAIL':'PASS',
    disclosureMismatch?0:100,
    disclosureMismatch
      ?'Synthetic media detection and manifest disclosure flag disagree.'
      :detectedSynthetic
        ?`Synthetic media is explicitly carried to publication; policy ${plan.syntheticDisclosurePolicy}.`
        :'No synthetic visual media detected by the production manifest.',
  );
  const voiceContractFail=plan.voiceRequired?!manifest.voice:Boolean(manifest.voice);
  const formatPreferred=plan.preferredFormats.includes(manifest.contentFormat);
  replaceCheck(
    report,
    'archetype-contract',
    voiceContractFail?'FAIL':formatPreferred?'PASS':'WARN',
    voiceContractFail?0:formatPreferred?100:78,
    voiceContractFail
      ?`Voice contract mismatch: ${plan.voiceMode} requires voice=${plan.voiceRequired} but manifest voice presence is ${Boolean(manifest.voice)}.`
      :`${plan.archetypeId} executed as ${plan.scriptMode}/${plan.voiceMode}/${plan.visualMode}; format ${manifest.contentFormat}${formatPreferred?' is preferred':' is supported but not preferred'}.`,
  );
  report.contentArchetype=manifest.contentArchetype;
  report.executionPlan=manifest.executionPlan;
  report.blockers=report.checks.filter((check)=>check.status==='FAIL').map((check)=>check.id);
  report.passed=report.blockers.length===0;
  report.score=Math.round(report.checks.reduce((sum,check)=>sum+check.score,0)/Math.max(1,report.checks.length));
  return report;
}
