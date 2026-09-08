import type { ContentStyleFingerprint } from './channel-routing.js';

export type ChannelBrandBlueprint = {
  version: number;
  channelName: string;
  tagline: string;
  description: string;
  language: string;
  character: {
    mode: 'none' | 'persistent-character' | 'host-persona';
    name?: string | null;
    continuityKey: string;
    referencePrompt?: string;
  };
  palette: { background: string; foreground: string; accent: string; secondary: string };
  typography: { headline: string; body: string; rules: string[] };
  prompts: { avatar: string; banner: string; watermark: string; socialBanner: string; characterReference?: string };
  thumbnailSystem: { rules: string[]; promptPrefix: string };
  social: { youtubeDescription: string; instagramBio: string; tiktokBio: string; xBio: string };
  visualRules: string[];
};

function has(values:string[],needle:string){return values.some((value)=>value.toLowerCase().includes(needle));}
function titleCase(value:string){return value.split(/[-_\s]+/).filter(Boolean).map((word)=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');}
function simpleHash(value:string){let h=2166136261;for(const char of value){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}

export function buildChannelBrandBlueprint(input:{candidateKey:string;proposedName?:string;positioning?:string;fingerprint:ContentStyleFingerprint}):ChannelBrandBlueprint{
  const {fingerprint}=input;
  const characterMode=fingerprint.characterMode??'none';
  const characterName=fingerprint.characterName??null;
  const themes=fingerprint.themes.length?fingerprint.themes:['stories'];
  const cozy=has(fingerprint.styleTags,'cozy')||has(fingerprint.styleTags,'bedtime')||has(themes,'folklore');
  const tech=has(themes,'ai')||has(themes,'technology')||has(themes,'internet')||has(fingerprint.styleTags,'analytical');
  const channelName=input.proposedName?.trim()||characterName||`${titleCase(themes.slice(0,2).join(' '))} Studio`;
  const tagline=characterName?`Stories told by ${characterName}`:tech?'Stories behind the systems shaping tomorrow':`Remarkable ${themes.slice(0,2).join(' & ')} stories, told clearly`;
  const description=input.positioning?.trim()||`${channelName} publishes original English-first stories about ${themes.slice(0,5).join(', ')} with a consistent ${fingerprint.styleTags.slice(0,4).join(', ')} identity.`;
  const continuityKey=`${input.candidateKey}:${simpleHash(JSON.stringify({themes:fingerprint.themes,styles:fingerprint.styleTags,characterName}))}`;
  const palette=cozy
    ? {background:'#101522',foreground:'#F5E9D0',accent:'#E1A84B',secondary:'#6B7A99'}
    : tech
      ? {background:'#090D12',foreground:'#F2F6FA',accent:'#55D6FF',secondary:'#6B7C93'}
      : {background:'#111318',foreground:'#F4F1E8',accent:'#D9A45B',secondary:'#778096'};
  const referencePrompt=characterMode==='none'?undefined:`Create the canonical character reference sheet for ${characterName||channelName}. ${fingerprint.styleTags.join(', ')} visual language. Show the exact same character in front, three-quarter and profile views with consistent face proportions, silhouette, clothing, materials and signature accessory. Neutral studio presentation, no readable text, no logos, no watermark. This is the immutable master visual identity for future generations. Continuity key ${continuityKey}.`;
  const subject=characterMode==='none'
    ? `a distinctive abstract editorial symbol representing ${themes.slice(0,4).join(', ')}`
    : `${characterName||'the channel host'}, matching the canonical character reference exactly`;
  const baseStyle=`Premium original channel branding, ${fingerprint.styleTags.join(', ')}. ${cozy?'warm storybook lighting and tactile illustration':'cinematic editorial lighting, restrained detail and strong silhouette'}. No existing brand logos, no watermarks, no readable text.`;
  const avatar=`${baseStyle} Center ${subject} in a clean iconic composition designed to survive a square crop and a small circular profile crop. Simple background, unmistakable silhouette, direct visual identity.`;
  const banner=`${baseStyle} Wide YouTube channel banner environment built around ${subject}. Keep the central safe area calm for deterministic typography overlay. Visual storytelling about ${themes.slice(0,5).join(', ')}. Do not render letters.`;
  const watermark=`${baseStyle} Minimal isolated emblem based on ${subject}, centered, high contrast, no text, designed for a tiny transparent-style video watermark.`;
  const socialBanner=`${baseStyle} Extra-wide social profile header using the same identity, palette, subject and environment as the YouTube banner. Keep center-left negative space for deterministic typography. No letters.`;
  const visualRules=[
    `Continuity key ${continuityKey} must remain stable across all channel assets.`,
    characterMode==='none'?'Use the same recurring symbol, palette and editorial lighting across profile/banner/thumbnails.':'Never change the character face proportions, silhouette, signature clothing or signature accessory without a new identity version.',
    'One dominant focal idea per composition.',
    'Do not fabricate third-party logos, UI or endorsements.',
    'Use deterministic typography outside the generative image model.',
    'Preserve high mobile readability and strong foreground/background separation.',
  ];
  const socialBase=characterName?`${characterName} tells original ${themes.slice(0,3).join(', ')} stories.`:`Original ${themes.slice(0,4).join(', ')} explain-stories in English.`;
  return {
    version:1,channelName,tagline,description,language:fingerprint.language,
    character:{mode:characterMode,name:characterName,continuityKey,referencePrompt},
    palette,
    typography:{headline:'bold geometric sans-serif',body:'neutral highly legible sans-serif',rules:['Never generate typography inside AI images.','Use short high-contrast headlines.','Keep banner title inside the central YouTube safe area.']},
    prompts:{avatar,banner,watermark,socialBanner,characterReference:referencePrompt},
    thumbnailSystem:{rules:['One focal subject.','One visual conflict or unanswered question.','0-5 words of deterministic text only when it adds information.','Reuse channel palette and character/symbol continuity.','No fake logos or fabricated UI.'],promptPrefix:`${baseStyle} YouTube thumbnail background for ${channelName}.`},
    social:{youtubeDescription:description,instagramBio:`${socialBase} New videos from ${channelName}.`,tiktokBio:`${socialBase}`,xBio:`${socialBase} — ${tagline}`},
    visualRules,
  };
}
