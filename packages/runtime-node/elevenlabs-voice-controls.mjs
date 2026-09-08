function compactVoiceSettings(value){
  const source=value&&typeof value==='object'?value:{};
  const out={};
  const assign=(target,...keys)=>{for(const key of keys){const current=source[key];if(current!==null&&current!==undefined&&current!==''){out[target]=current;return;}}};
  assign('stability','stability');
  assign('similarity_boost','similarityBoost','similarity_boost');
  assign('style','style');
  assign('speed','speed');
  assign('use_speaker_boost','useSpeakerBoost','use_speaker_boost');
  return out;
}
function alignmentFrom(json){
  const raw=json.normalized_alignment??json.alignment;
  if(!raw?.characters?.length||!raw.character_start_times_seconds?.length||!raw.character_end_times_seconds?.length)return undefined;
  return{characters:raw.characters,characterStartTimesSeconds:raw.character_start_times_seconds,characterEndTimesSeconds:raw.character_end_times_seconds};
}

export function withElevenLabsVoiceControls(provider,options={}){
  const apiKey=String(options.apiKey??'').trim(),store=options.store,modelId=options.modelId||'eleven_multilingual_v2',outputFormat=options.outputFormat||'mp3_44100_128',base=options.endpoint||'https://api.elevenlabs.io/v1/text-to-speech',fetchFn=options.fetchFn||fetch;
  if(!apiKey||!store)return provider;
  return{
    name:provider.name,
    async synthesize(input){
      const voiceSettings=compactVoiceSettings(input.voiceSettings);
      const hasControls=Number.isInteger(input.seed)||Object.keys(voiceSettings).length>0;
      if(!hasControls)return provider.synthesize(input);
      const body={text:input.text,model_id:input.model||modelId,seed:Number.isInteger(input.seed)?input.seed:undefined,voice_settings:Object.keys(voiceSettings).length?voiceSettings:undefined};
      // Eleven multilingual_v2 ignores language_code; only send it to models that support it.
      if(input.language&&!/multilingual_v2/i.test(String(body.model_id)))body.language_code=String(input.language).slice(0,2);
      const response=await fetchFn(`${base}/${encodeURIComponent(input.voice)}/with-timestamps?output_format=${encodeURIComponent(outputFormat)}`,{method:'POST',headers:{'xi-api-key':apiKey,'content-type':'application/json'},body:JSON.stringify(body)});
      if(!response.ok)throw new Error(`ElevenLabs controlled TTS failed ${response.status}: ${(await response.text()).slice(0,600)}`);
      const json=await response.json();
      const bytes=new Uint8Array(Buffer.from(json.audio_base64,'base64'));
      const alignment=alignmentFrom(json),durationSeconds=alignment?.characterEndTimesSeconds?.at(-1)??Math.max(1,Math.round(String(input.text).split(/\s+/).length/2.5));
      const key=`voice/${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
      const stored=await store.put({key,contentType:'audio/mpeg',data:bytes});
      return{id:key.replace(/[^a-z0-9]/gi,'-'),uri:stored.uri,mimeType:'audio/mpeg',bytes:stored.bytes,provider:provider.name,model:body.model_id,durationSeconds,alignment,language:input.language,voiceId:input.voice,metadata:{voiceControls:{seed:body.seed??null,voiceSettings,controlled:true}}};
    },
  };
}
