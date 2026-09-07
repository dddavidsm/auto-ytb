export const YOUTUBE_SCOPES = {
  upload: 'https://www.googleapis.com/auth/youtube.upload',
  manage: 'https://www.googleapis.com/auth/youtube.force-ssl',
  analytics: 'https://www.googleapis.com/auth/yt-analytics.readonly',
  analyticsMonetary: 'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
} as const;

export type OAuthCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  refreshToken?: string;
};

export function buildYouTubeAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  scopes?: string[];
  state?: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: (input.scopes ?? [YOUTUBE_SCOPES.upload, YOUTUBE_SCOPES.manage, YOUTUBE_SCOPES.analytics, YOUTUBE_SCOPES.analyticsMonetary]).join(' '),
  });
  if (input.state) params.set('state', input.state);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export class GoogleOAuthTokenProvider {
  private accessToken?: { value: string; expiresAt: number };
  constructor(private readonly credentials: OAuthCredentials, private readonly fetchFn: typeof fetch = fetch) {}

  async exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
    if (!this.credentials.redirectUri) throw new Error('redirectUri is required to exchange an OAuth code');
    const body = new URLSearchParams({
      code,
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      redirect_uri: this.credentials.redirectUri,
      grant_type: 'authorization_code',
    });
    const response = await this.fetchFn('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!response.ok) throw new Error(`Google OAuth code exchange failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const json = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
    return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn: json.expires_in };
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    if (!this.credentials.refreshToken) throw new Error('YOUTUBE_REFRESH_TOKEN is required for unattended OAuth access');
    const body = new URLSearchParams({
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      refresh_token: this.credentials.refreshToken,
      grant_type: 'refresh_token',
    });
    const response = await this.fetchFn('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!response.ok) throw new Error(`Google OAuth refresh failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const json = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }
}
