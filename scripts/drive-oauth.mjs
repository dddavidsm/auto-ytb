import { buildGoogleDriveAuthorizationUrl, GoogleOAuthTokenProvider } from '@auto-ytb/youtube';

const clientId=(process.env.DRIVE_CLIENT_ID||process.env.YOUTUBE_CLIENT_ID||'').trim();
const clientSecret=(process.env.DRIVE_CLIENT_SECRET||process.env.YOUTUBE_CLIENT_SECRET||'').trim();
const redirectUri=(process.env.DRIVE_REDIRECT_URI||'http://localhost:53683/oauth2/callback').trim();
if(!clientId||!clientSecret)throw new Error('DRIVE_CLIENT_ID/DRIVE_CLIENT_SECRET are required (or reuse the Google OAuth app client via YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET)');
const codeArg=process.argv.find((arg)=>arg.startsWith('--code='));
if(!codeArg){
  console.log(buildGoogleDriveAuthorizationUrl({clientId,redirectUri,state:'auto-ytb-drive'}));
  console.log('\nOpen the URL with the Google account that owns the AUTO-YTB Drive, approve Drive access, then run: npm run drive:oauth:exchange -- --code=PASTE_CODE');
  process.exit(0);
}
const code=codeArg.slice('--code='.length);
const provider=new GoogleOAuthTokenProvider({clientId,clientSecret,redirectUri});
const token=await provider.exchangeCode(code);
console.log(JSON.stringify({refreshToken:token.refreshToken??null,expiresIn:token.expiresIn},null,2));
if(token.refreshToken)console.log('\nSet DRIVE_REFRESH_TOKEN to the returned refreshToken. Do not commit it.');
