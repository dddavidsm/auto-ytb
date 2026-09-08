import { GoogleOAuthTokenProvider } from './oauth.js';

export type AnalyticsTable = { columns: string[]; rows: Array<Record<string, string | number | null>> };

export class YouTubeAnalyticsClient {
  constructor(private readonly tokenProvider: GoogleOAuthTokenProvider, private readonly fetchFn: typeof fetch = fetch) {}

  private async query(params: Record<string, string>): Promise<AnalyticsTable> {
    const token = await this.tokenProvider.getAccessToken();
    const qs = new URLSearchParams(params);
    const response = await this.fetchFn(`https://youtubeanalytics.googleapis.com/v2/reports?${qs.toString()}`, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`YouTube Analytics failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const json = await response.json() as { columnHeaders?: Array<{ name: string }>; rows?: Array<Array<string | number | null>> };
    const columns = (json.columnHeaders ?? []).map((header) => header.name);
    const rows = (json.rows ?? []).map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? null])));
    return { columns, rows };
  }

  private async dimensionalVideoReport(input:{videoId:string;startDate:string;endDate:string;dimension:string;metrics?:string;sort?:string}):Promise<AnalyticsTable>{
    return this.query({ids:'channel==MINE',startDate:input.startDate,endDate:input.endDate,filters:`video==${input.videoId}`,dimensions:input.dimension,metrics:input.metrics??'views,estimatedMinutesWatched',...(input.sort?{sort:input.sort}:{})});
  }

  async getVideoPerformance(input: { videoId: string; startDate: string; endDate: string }): Promise<AnalyticsTable> {
    const base={ids:'channel==MINE',startDate:input.startDate,endDate:input.endDate,filters:`video==${input.videoId}`};
    try{
      return await this.query({...base,metrics:'views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost,estimatedRevenue,videosAddedToPlaylists,videosRemovedFromPlaylists'});
    }catch{
      return this.query({...base,metrics:'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,estimatedRevenue'});
    }
  }

  async getRetention(input: { videoId: string; startDate: string; endDate: string }): Promise<AnalyticsTable> {
    return this.query({ids:'channel==MINE',startDate:input.startDate,endDate:input.endDate,filters:`video==${input.videoId}`,dimensions:'elapsedVideoTimeRatio',metrics:'audienceWatchRatio',sort:'elapsedVideoTimeRatio'});
  }

  async getTrafficSources(input: { videoId: string; startDate: string; endDate: string }): Promise<AnalyticsTable> {return this.dimensionalVideoReport({...input,dimension:'insightTrafficSourceType',sort:'-views'});}
  async getDeviceTypes(input:{videoId:string;startDate:string;endDate:string}):Promise<AnalyticsTable>{return this.dimensionalVideoReport({...input,dimension:'deviceType',sort:'-views'});}
  async getSubscriberStatus(input:{videoId:string;startDate:string;endDate:string}):Promise<AnalyticsTable>{return this.dimensionalVideoReport({...input,dimension:'subscribedStatus',sort:'-views'});}
  async getCountries(input:{videoId:string;startDate:string;endDate:string}):Promise<AnalyticsTable>{return this.dimensionalVideoReport({...input,dimension:'country',sort:'-views'});}
  async getPlaybackLocations(input:{videoId:string;startDate:string;endDate:string}):Promise<AnalyticsTable>{return this.dimensionalVideoReport({...input,dimension:'insightPlaybackLocationType',sort:'-views'});}
}
