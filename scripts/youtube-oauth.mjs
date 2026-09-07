import { buildYouTubeAuthorizationUrl, GoogleOAuthTokenProvider } from '@auto-ytb/youtube';

const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
const redirectUri = process.env.YOUTUBE_REDIRECT_URI?.trim() || 'http://localhost:53682/oauth2/callback';
if (!clientId || !clientSecret) throw new Error('YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are required');
const codeArg = process.argv.find((arg) => arg.startsWith('--code='));
if (!codeArg) {
  console.log(buildYouTubeAuthorizationUrl({ clientId, redirectUri, state:'auto-ytb' }));
  console.log('\nOpen the URL, approve access, then run: npm run oauth:exchange -- --code=PASTE_CODE');
  process.exit(0);
}
const code = codeArg.slice('--code='.length);
const provider = new GoogleOAuthTokenProvider({ clientId, clientSecret, redirectUri });
const token = await provider.exchangeCode(code);
console.log(JSON.stringify({ refreshToken: token.refreshToken ?? null, expiresIn: token.expiresIn }, null, 2));
if (token.refreshToken) console.log('\nSet YOUTUBE_REFRESH_TOKEN to the returned refreshToken. Do not commit it.');
