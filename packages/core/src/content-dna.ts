import type { BenchmarkChannel, BenchmarkVideo } from './benchmark.js';

export type TitleDNA = {
  length: number;
  wordCount: number;
  grammarPattern: string;
  question: boolean;
  statement: boolean;
  why: boolean;
  how: boolean;
  what: boolean;
  numbers: boolean;
  negation: boolean;
  superlative: boolean;
  danger: boolean;
  mystery: boolean;
  contradiction: boolean;
  curiosityGap: number;
  specificity: number;
  properNouns: number;
  timePressure: boolean;
  emotionalTrigger: string;
  informationWithheld: boolean;
};

export type ThumbnailDNA = {
  availability: 'VISION' | 'METADATA' | 'UNAVAILABLE';
  subjectCount?: number;
  mainSubject?: string;
  subjectScale?: 'SMALL' | 'MEDIUM' | 'LARGE';
  face?: boolean;
  objectUsage?: boolean;
  maps?: boolean;
  diagrams?: boolean;
  arrows?: boolean;
  textCount?: number;
  textWords?: string[];
  typographyClass?: string;
  textPlacement?: string;
  contrast?: number;
  dominantPalette?: string[];
  backgroundComplexity?: number;
  mobileReadability?: number;
  compositionType?: string;
  notes?: string;
};

export type ScriptDNA = {
  availability: 'TRANSCRIPT' | 'UNAVAILABLE';
  openingLengthSeconds?: number;
  hookType?: string;
  promise?: string;
  openLoops?: number;
  firstPayoffSeconds?: number;
  escalation?: boolean;
  revealTimingSeconds?: number;
  informationDensity?: number;
  narrationPaceWpm?: number;
  cta?: string;
  notes?: string;
};

export type VideoDNA = {
  durationSeconds: number;
  format: BenchmarkVideo['format'];
  shotLengthEstimateSeconds?: number;
  visualChangeFrequency?: number;
  footageTypes?: string[];
  cameraMovement?: string[];
  soundDesignDensity?: number;
  brandingRecurrence?: number;
};

export type ContentDNA = {
  version: 1;
  channelId: string;
  videoId?: string;
  observedAt: string;
  topicDNA: {
    topics: string[];
    subtopics: string[];
    entities: string[];
    conflict?: string;
    novelty?: number;
    stakes?: number;
    emotionalTrigger: string;
    audiencePromise?: string;
    evergreenTrending: 'EVERGREEN' | 'TRENDING' | 'UNKNOWN';
  };
  titleDNA: TitleDNA;
  thumbnailDNA: ThumbnailDNA;
  scriptDNA: ScriptDNA;
  videoDNA: VideoDNA;
};

export type ThumbnailObservation = Partial<Omit<ThumbnailDNA, 'availability'>> & { availability?: ThumbnailDNA['availability'] };

const round = (value: number) => Math.round(value * 10) / 10;
const words = (title: string) => title.trim().split(/\s+/).filter(Boolean);
const has = (title: string, pattern: RegExp) => pattern.test(title);

export function extractTitleDNA(title: string): TitleDNA {
  const clean = title.trim();
  const tokens = words(clean);
  const lower = clean.toLowerCase();
  const question = /\?$/.test(clean);
  const why = /^why\b/i.test(clean);
  const how = /^how\b/i.test(clean);
  const what = /^what\b/i.test(clean);
  const numbers = /\b\d+(?:\.\d+)?%?\b/.test(clean);
  const negation = /\b(no|not|never|without|n't|failed|collapse|broke|wrong)\b/i.test(clean);
  const danger = /\b(danger|threat|risk|war|collapse|crisis|deadly|destroy|attack)\b/i.test(clean);
  const mystery = /\b(secret|hidden|mystery|truth|nobody|unknown|actually|really)\b/i.test(clean);
  const contradiction = /\b(actually|but|despite|wrong|isn't|is not|not what)\b/i.test(clean);
  const curiosityGap = Math.min(100, (mystery ? 28 : 0) + (question ? 18 : 0) + (contradiction ? 22 : 0) + (negation ? 12 : 0) + (tokens.length >= 5 ? 12 : 0));
  const specificity = Math.min(100, (numbers ? 20 : 0) + Math.min(40, tokens.filter((token) => /^[A-Z][a-z]/.test(token)).length * 12) + (tokens.length >= 7 ? 25 : tokens.length >= 4 ? 15 : 5));
  const trigger = danger ? 'danger' : mystery ? 'mystery' : contradiction ? 'contradiction' : numbers ? 'scale' : 'information';
  const grammarPattern = why ? 'WHY_CLAUSE' : how ? 'HOW_PROCESS' : what ? 'WHAT_OBJECT' : numbers ? 'NUMBER_LED' : question ? 'OPEN_QUESTION' : contradiction ? 'CONTRADICTION' : 'DIRECT_CLAIM';
  return {
    length: clean.length,
    wordCount: tokens.length,
    grammarPattern,
    question,
    statement: !question,
    why,
    how,
    what,
    numbers,
    negation,
    superlative: has(clean, /\b(biggest|largest|most|worst|best|only|first|last)\b/i),
    danger,
    mystery,
    contradiction,
    curiosityGap,
    specificity,
    properNouns: tokens.filter((token) => /^[A-Z][a-z]/.test(token)).length,
    timePressure: has(clean, /\b(today|now|soon|hour|day|year|future|before)\b/i),
    emotionalTrigger: trigger,
    informationWithheld: mystery || question || contradiction,
  };
}

export function extractContentDNA(input: {
  channel: BenchmarkChannel;
  video: BenchmarkVideo;
  thumbnail?: ThumbnailObservation;
  transcript?: { openingLengthSeconds?: number; hookType?: string; promise?: string; openLoops?: number; firstPayoffSeconds?: number; escalation?: boolean; revealTimingSeconds?: number; informationDensity?: number; narrationPaceWpm?: number; cta?: string };
  topic?: string;
  subtopics?: string[];
  entities?: string[];
}): ContentDNA {
  const thumbnail = input.thumbnail;
  const script = input.transcript;
  return {
    version: 1,
    channelId: input.channel.id,
    videoId: input.video.id,
    observedAt: new Date().toISOString(),
    topicDNA: {
      topics: input.topic ? [input.topic] : input.video.topic ? [input.video.topic] : [],
      subtopics: input.subtopics ?? [],
      entities: input.entities ?? [],
      emotionalTrigger: extractTitleDNA(input.video.title).emotionalTrigger,
      evergreenTrending: input.video.ageHours > 24 * 30 && input.video.recentPerformance === 'STABLE' ? 'EVERGREEN' : input.video.recentPerformance === 'ACCELERATING' ? 'TRENDING' : 'UNKNOWN',
    },
    titleDNA: extractTitleDNA(input.video.title),
    thumbnailDNA: { availability: thumbnail ? thumbnail.availability ?? 'METADATA' : input.video.thumbnailUrl ? 'METADATA' : 'UNAVAILABLE', ...thumbnail },
    scriptDNA: script ? { availability: 'TRANSCRIPT', ...script } : { availability: 'UNAVAILABLE', notes: 'Transcript was not available from an allowed source; no script claims were inferred.' },
    videoDNA: {
      durationSeconds: input.video.durationSeconds,
      format: input.video.format,
    },
  };
}

export function aggregateChannelDNA(input: { channel: BenchmarkChannel; videos: BenchmarkVideo[]; thumbnailByVideoId?: Record<string, ThumbnailObservation> }): ContentDNA {
  const videos = input.videos.filter((video) => video.channelId === input.channel.id);
  const source = videos[0] ?? { id: `${input.channel.id}:empty`, channelId: input.channel.id, title: input.channel.name, publishDate: new Date().toISOString(), durationSeconds: 0, views: 0, likes: null, comments: null, channelSubscribers: input.channel.subscribers, viewsPerSubscriber: null, ageHours: 1, viewsPerDay: 0, viewsPerHour: 0, historicalPerformance: 'UNKNOWN', recentPerformance: 'UNKNOWN', likelyOutlier: { score: 0, classification: 'NORMAL', rawViewMultiple: 1, velocityMultiple: 1, subscriberRatio: null, persistenceScore: 0, engagementProxy: null, reasons: [] }, format: 'LONG_FORM' } as BenchmarkVideo;
  const dna = extractContentDNA({ channel: input.channel, video: source, thumbnail: input.thumbnailByVideoId?.[source.id] });
  const titlePatterns = videos.map((video) => extractTitleDNA(video.title));
  if (titlePatterns.length) {
    dna.titleDNA = {
      ...dna.titleDNA,
      length: round(titlePatterns.reduce((sum, item) => sum + item.length, 0) / titlePatterns.length),
      wordCount: round(titlePatterns.reduce((sum, item) => sum + item.wordCount, 0) / titlePatterns.length),
      curiosityGap: round(titlePatterns.reduce((sum, item) => sum + item.curiosityGap, 0) / titlePatterns.length),
      specificity: round(titlePatterns.reduce((sum, item) => sum + item.specificity, 0) / titlePatterns.length),
    };
  }
  return { ...dna, videoId: undefined, observedAt: new Date().toISOString(), topicDNA: { ...dna.topicDNA, topics: [...new Set(videos.flatMap((video) => video.topic ? [video.topic] : []))] } };
}
