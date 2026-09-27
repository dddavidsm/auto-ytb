const text=(value)=>String(value??'').trim();

const firstNonEmpty=(...values)=>values.map(text).find(Boolean)??'';

export function resolveVoiceId({provider='gemini',language='en',env=process.env,channelVoiceId=''}){
  const normalizedProvider=text(provider).toLowerCase();
  const normalizedLanguage=text(language).toLowerCase();
  if(normalizedProvider==='elevenlabs'){
    const languageVoice=normalizedLanguage.startsWith('es')
      ? env.ELEVENLABS_VOICE_ID_ES
      : normalizedLanguage.startsWith('en')
        ? env.ELEVENLABS_VOICE_ID_EN
        : env.ELEVENLABS_VOICE_ID;
    const voiceId=firstNonEmpty(languageVoice,env.ELEVENLABS_VOICE_ID,channelVoiceId);
    if(!voiceId)throw new Error(`ELEVENLABS_VOICE_ID_MISSING_FOR_LANGUAGE:${normalizedLanguage||'unknown'}`);
    return voiceId;
  }
  return firstNonEmpty(env.GEMINI_VOICE_ID,env.VOICE_ID,channelVoiceId,'Kore');
}
