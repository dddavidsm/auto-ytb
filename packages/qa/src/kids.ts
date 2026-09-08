import type { PackagingVariant, VideoScript } from '@auto-ytb/production';

export type KidsAudienceContext = {
  mode: 'GENERAL' | 'MADE_FOR_KIDS';
  targetAgeMin?: number | null;
  targetAgeMax?: number | null;
  vocabularyRules?: string[];
  safetyRules?: string[];
  emotionalRules?: string[];
};

export type KidsQualityIssue = {
  code: string;
  severity: 'WARN' | 'FAIL';
  message: string;
};

export type KidsQualityReview = {
  required: boolean;
  passed: boolean;
  score: number;
  issues: KidsQualityIssue[];
  metrics: {
    sentenceCount: number;
    wordCount: number;
    averageWordsPerSentence: number;
    longestSentenceWords: number;
    dangerousImitationMatches: number;
    manipulativePromotionMatches: number;
    frighteningContentMatches: number;
    hasClearPayoff: boolean;
  };
};

const clamp=(value:number,min=0,max=100)=>Math.max(min,Math.min(max,value));
const normalize=(value:string)=>value.toLowerCase().replace(/[’]/g,"'").replace(/\s+/g,' ').trim();
const words=(value:string)=>normalize(value).replace(/[^a-z0-9'\-\s]/g,' ').split(/\s+/).filter(Boolean);
const sentences=(value:string)=>value.split(/[.!?]+/).map((part)=>part.trim()).filter(Boolean);
const countMatches=(text:string,patterns:RegExp[])=>patterns.reduce((sum,pattern)=>sum+(text.match(pattern)?.length??0),0);

const DANGEROUS_IMITATION=[
  /\btry (?:this|it) (?:yourself|at home)\b/g,
  /\bdo (?:this|it) at home\b/g,
  /\bjump (?:off|from)\b/g,
  /\bhold your breath\b/g,
  /\bplay with (?:fire|matches|knives?|guns?|weapons?)\b/g,
  /\b(?:drink|eat|swallow) (?:soap|detergent|medicine|cleaner|chemicals?)\b/g,
  /\b(?:drive|ride) without (?:a |your )?(?:helmet|seatbelt)\b/g,
];
const MANIPULATIVE_PROMOTION=[
  /\bbuy now\b/g,
  /\bask your parents? to buy\b/g,
  /\blimited time\b/g,
  /\bget yours? now\b/g,
  /\bsubscribe (?:now )?to (?:win|get|unlock)\b/g,
  /\bclick (?:the )?link to buy\b/g,
];
const FRIGHTENING_CONTENT=[
  /\b(?:blood|bloody|gore|gory|corpse|dead body|decapitat|dismember)\w*\b/g,
  /\b(?:kill|murder|stab|shoot)\w*\b/g,
];
const FALSE_EDUCATIONAL_CERTAINTY=[
  /\bguaranteed to make you smarter\b/g,
  /\bthis will make you (?:a genius|smarter)\b/g,
  /\b(?:always|never) works for everyone\b/g,
];
const RESOLUTION_WORDS=/\b(?:safe|help|helped|together|understand|understood|learn|learned|kind|friend|friends|calm|okay|alright|reassur|solve|solved|share|care|hug|home)\w*\b/i;

function emptyReview(required:boolean):KidsQualityReview{
  return{required,passed:true,score:100,issues:[],metrics:{sentenceCount:0,wordCount:0,averageWordsPerSentence:0,longestSentenceWords:0,dangerousImitationMatches:0,manipulativePromotionMatches:0,frighteningContentMatches:0,hasClearPayoff:true}};
}

export function reviewKidsFamilyQuality(input:{script:VideoScript;packaging?:PackagingVariant[];audience?:KidsAudienceContext|null}):KidsQualityReview{
  const audience=input.audience;
  if(!audience||audience.mode!=='MADE_FOR_KIDS')return emptyReview(false);
  const narration=input.script.beats.map((beat)=>beat.narration).join(' ');
  const allText=normalize([input.script.title,input.script.thesis,narration,input.script.outro,...(input.packaging??[]).flatMap((item)=>[item.title,item.promise,item.thumbnailText??''])].join(' '));
  const sentenceList=sentences([narration,input.script.outro].join(' '));
  const sentenceLengths=sentenceList.map((sentence)=>words(sentence).length).filter((length)=>length>0);
  const wordCount=words([narration,input.script.outro].join(' ')).length;
  const averageWordsPerSentence=sentenceLengths.length?sentenceLengths.reduce((sum,length)=>sum+length,0)/sentenceLengths.length:0;
  const longestSentenceWords=sentenceLengths.length?Math.max(...sentenceLengths):0;
  const ageMax=Number(audience.targetAgeMax??8);
  const avgLimit=ageMax<=6?14:ageMax<=9?18:22;
  const longestLimit=ageMax<=6?24:ageMax<=9?30:36;
  const dangerousImitationMatches=countMatches(allText,DANGEROUS_IMITATION);
  const manipulativePromotionMatches=countMatches(allText,MANIPULATIVE_PROMOTION);
  const frighteningContentMatches=countMatches(allText,FRIGHTENING_CONTENT);
  const falseEducationalMatches=countMatches(allText,FALSE_EDUCATIONAL_CERTAINTY);
  const beatPurposes=new Set(input.script.beats.map((beat)=>beat.purpose));
  const hasClearPayoff=beatPurposes.has('payoff')||beatPurposes.has('reveal');
  const resolutionText=[...input.script.beats.filter((beat)=>beat.purpose==='payoff'||beat.purpose==='reveal').map((beat)=>beat.narration),input.script.outro].join(' ');
  const hasEmotionalResolution=RESOLUTION_WORDS.test(resolutionText)||Boolean(audience.emotionalRules?.length&&resolutionText.trim().length>=30);
  const issues:KidsQualityIssue[]=[];
  if(audience.targetAgeMin==null||audience.targetAgeMax==null)issues.push({code:'kids-age-band-missing',severity:'FAIL',message:'Made-for-kids content requires an explicit target age band.'});
  if(dangerousImitationMatches)issues.push({code:'unsafe-imitation',severity:'FAIL',message:`Detected ${dangerousImitationMatches} unsafe imitation instruction pattern(s).`});
  if(manipulativePromotionMatches)issues.push({code:'manipulative-promotion',severity:'FAIL',message:`Detected ${manipulativePromotionMatches} child-directed purchase/subscription pressure pattern(s).`});
  if(frighteningContentMatches)issues.push({code:'graphic-or-frightening-content',severity:'FAIL',message:`Detected ${frighteningContentMatches} graphic/violent term pattern(s) unsuitable for the configured young audience.`});
  if(falseEducationalMatches)issues.push({code:'misleading-educational-claim',severity:'FAIL',message:'Detected an ungrounded educational certainty claim.'});
  if(!hasClearPayoff)issues.push({code:'unclear-narrative-payoff',severity:'FAIL',message:'A child-directed episode must contain an explicit reveal or payoff beat.'});
  if(!beatPurposes.has('hook')||input.script.beats.length<3)issues.push({code:'weak-story-structure',severity:'WARN',message:'The episode lacks a sufficiently clear opening/progression structure for young viewers.'});
  if(averageWordsPerSentence>avgLimit)issues.push({code:'language-too-complex',severity:averageWordsPerSentence>avgLimit*1.35?'FAIL':'WARN',message:`Average sentence length ${averageWordsPerSentence.toFixed(1)} words exceeds the age-band target of about ${avgLimit}.`});
  if(longestSentenceWords>longestLimit)issues.push({code:'sentence-too-long',severity:longestSentenceWords>longestLimit*1.35?'FAIL':'WARN',message:`Longest sentence is ${longestSentenceWords} words; target maximum is about ${longestLimit} for this age band.`});
  if(!hasEmotionalResolution)issues.push({code:'weak-emotional-resolution',severity:'WARN',message:'The ending does not clearly signal safety, understanding, help, kindness or another reassuring resolution.'});
  if(wordCount<35)issues.push({code:'low-substance',severity:'WARN',message:'The episode contains very little narrated substance and may feel thin or mass-produced.'});
  const penalty=issues.reduce((sum,issue)=>sum+(issue.severity==='FAIL'?22:7),0);
  const score=clamp(100-penalty);
  return{required:true,passed:!issues.some((issue)=>issue.severity==='FAIL'),score,issues,metrics:{sentenceCount:sentenceList.length,wordCount,averageWordsPerSentence:Math.round(averageWordsPerSentence*10)/10,longestSentenceWords,dangerousImitationMatches,manipulativePromotionMatches,frighteningContentMatches,hasClearPayoff}};
}
