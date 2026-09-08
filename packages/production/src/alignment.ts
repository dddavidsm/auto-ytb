import type { VoiceAlignment } from '@auto-ytb/providers';
import type { Scene, VideoScript } from './types.js';

export type AudioSyncResult = {
  script: VideoScript;
  scenes: Scene[];
  durationSeconds: number;
  beatWindows: Array<{ beatId:string; startSec:number; endSec:number }>;
  alignmentCoverage: number;
};

function clampIndex(value:number,max:number){return Math.max(0,Math.min(max,value));}

export function synchronizeTimelineToVoice(script:VideoScript,scenes:Scene[],alignment:VoiceAlignment|undefined,fallbackDuration?:number):AudioSyncResult{
  const fullText=script.beats.map((beat)=>beat.narration).join('\n\n');
  const fallback=Math.max(0.1,fallbackDuration??script.targetDurationSec);
  if(!alignment||!alignment.characters.length||alignment.characterEndTimesSeconds.length!==alignment.characters.length){
    const scale=fallback/Math.max(0.1,script.targetDurationSec);
    const retimedScript={...script,targetDurationSec:fallback,beats:script.beats.map((beat)=>({...beat,startSec:beat.startSec*scale,targetDurationSec:beat.targetDurationSec*scale}))};
    const retimedScenes=scenes.map((scene)=>({...scene,startSec:scene.startSec*scale,durationSec:scene.durationSec*scale}));
    return {script:retimedScript,scenes:retimedScenes,durationSeconds:fallback,beatWindows:retimedScript.beats.map((beat)=>({beatId:beat.id,startSec:beat.startSec,endSec:beat.startSec+beat.targetDurationSec})),alignmentCoverage:0};
  }
  const chars=alignment.characters.join('');
  const starts=alignment.characterStartTimesSeconds;
  const ends=alignment.characterEndTimesSeconds;
  const windows:Array<{beatId:string;startSec:number;endSec:number}>=[];
  let searchFrom=0;
  let matchedChars=0;
  for(const beat of script.beats){
    const needle=beat.narration;
    let index=chars.indexOf(needle,searchFrom);
    if(index<0){
      const compactNeedle=needle.replace(/\s+/g,' ').trim();
      const compactChars=chars.replace(/\s+/g,' ');
      index=compactChars.indexOf(compactNeedle);
    }
    if(index>=0){
      const startIndex=clampIndex(index,starts.length-1);
      const endIndex=clampIndex(index+needle.length-1,ends.length-1);
      windows.push({beatId:beat.id,startSec:starts[startIndex]??0,endSec:ends[endIndex]??starts[startIndex]??0});
      searchFrom=index+needle.length;
      matchedChars+=needle.length;
    } else windows.push({beatId:beat.id,startSec:NaN,endSec:NaN});
  }
  const totalDuration=Math.max(fallback,ends.at(-1)??0.1);
  let cursor=0;
  const fixed=windows.map((window,index)=>{
    if(Number.isFinite(window.startSec)&&Number.isFinite(window.endSec)&&window.endSec>window.startSec){cursor=window.endSec;return window;}
    const remaining=script.beats.slice(index).reduce((sum,beat)=>sum+beat.narration.length,0)||1;
    const share=script.beats[index].narration.length/remaining;
    const duration=Math.max(0.2,(totalDuration-cursor)*share);
    const fallbackWindow={beatId:window.beatId,startSec:cursor,endSec:cursor+duration};cursor+=duration;return fallbackWindow;
  });
  const retimedBeats=script.beats.map((beat,index)=>({...beat,startSec:fixed[index].startSec,targetDurationSec:Math.max(0.2,fixed[index].endSec-fixed[index].startSec)}));
  const beatById=new Map(retimedBeats.map((beat)=>[beat.id,beat]));
  const retimedScenes=scenes.map((scene)=>{
    const beatId=scene.id.replace(/-s\d+$/,'');
    const beat=beatById.get(beatId);
    const originalBeat=script.beats.find((candidate)=>candidate.id===beatId);
    if(!beat||!originalBeat)return scene;
    const offsetRatio=originalBeat.targetDurationSec>0?(scene.startSec-originalBeat.startSec)/originalBeat.targetDurationSec:0;
    const durationRatio=originalBeat.targetDurationSec>0?scene.durationSec/originalBeat.targetDurationSec:1;
    return {...scene,startSec:beat.startSec+beat.targetDurationSec*Math.max(0,offsetRatio),durationSec:Math.max(0.2,beat.targetDurationSec*durationRatio)};
  });
  return {script:{...script,targetDurationSec:totalDuration,beats:retimedBeats},scenes:retimedScenes,durationSeconds:totalDuration,beatWindows:fixed,alignmentCoverage:Math.min(1,matchedChars/Math.max(1,fullText.length))};
}
