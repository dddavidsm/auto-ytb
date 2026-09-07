type Check = { subsystem: string; status: 'READY' | 'PARTIAL' | 'BLOCKED'; missing: string[]; note: string };
const present = (name: string) => Boolean(process.env[name]?.trim());
const check = (subsystem: string, required: string[], optional: string[], note: string): Check => {
  const missing = required.filter((key) => !present(key));
  const optionalMissing = optional.filter((key) => !present(key));
  return { subsystem, status: missing.length ? 'BLOCKED' : optionalMissing.length ? 'PARTIAL' : 'READY', missing: [...missing, ...optionalMissing.map((key) => `${key} (optional)`)], note };
};
const checks: Check[] = [
  check('Market intelligence', ['YOUTUBE_API_KEY'], [], 'Required for live niche/competitor discovery'),
  check('Database', ['DATABASE_URL'], [], 'Required for durable state in production'),
  check('Editorial research', ['SEARCH_PROVIDER','SEARCH_API_KEY','TEXT_MODEL_RESEARCH','TEXT_MODEL_API_KEY'], ['TEXT_MODEL_CREATIVE'], 'Mocks work without these; live autonomous research needs them'),
  check('Voice', ['VOICE_PROVIDER','VOICE_API_KEY'], [], 'Required for final narration'),
  check('Generative image', ['IMAGE_PROVIDER','IMAGE_API_KEY'], [], 'Required by the current live scene generator; Runway is the reference adapter'),
  check('Generative video', ['VIDEO_PROVIDER','VIDEO_API_KEY'], [], 'Required by the current live scene generator and constrained by the production cost cap'),
  check('Storage', [], ['OBJECT_STORE'], 'Local file storage is production-capable on a single runner; object storage is optional for distributed workers'),
  check('YouTube publishing', ['YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET','YOUTUBE_REFRESH_TOKEN'], [], 'Private upload and scheduling'),
  check('YouTube analytics', ['YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET','YOUTUBE_REFRESH_TOKEN','YOUTUBE_CHANNEL_ID'], [], 'Owned-channel learning loop'),
];
console.table(checks.map((item) => ({ subsystem:item.subsystem,status:item.status,missing:item.missing.join(', ') || '—',note:item.note })));
const blocked = checks.filter((item) => item.status === 'BLOCKED').length;
console.log(JSON.stringify({ liveReady: blocked === 0, blocked, partial: checks.filter((item) => item.status === 'PARTIAL').length }, null, 2));
