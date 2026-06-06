export type SearchConsoleProperty = {
  id: string;
  projectId: string;
  googleConnectionId: string;
  siteUrl: string;
  permissionLevel: string;
  verified: boolean;
  lastSyncedAt: string;
};

export type LinkedProperty = {
  siteId: string;
  active: boolean;
  linkedAt: string;
  linkedByUserId: string;
  property: SearchConsoleProperty;
  updatedAt: string;
  lastImportedAt?: string | null;
};

export type CandidateMatch =
  | 'domain-property'
  | 'exact-url-prefix'
  | 'www-url-prefix'
  | 'related'
  | 'none';

export type CandidateProperty = SearchConsoleProperty & {
  match: CandidateMatch;
};

export type CandidatesResponse = {
  linked: LinkedProperty | null;
  recommendedPropertyId: string | null;
  site: { id: string; projectId: string; domain: string; normalizedDomain: string };
  properties: CandidateProperty[];
};

export type PerformanceSummary = {
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type TimeseriesPoint = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type TopPerformanceRow = {
  value: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  /** Clicks in the comparison period, present only when a comparison is active. */
  previousClicks?: number;
};

export type OpportunityRow = {
  value: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  potentialClicks: number;
};

export type CannibalizationPage = {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type CannibalizationGroup = {
  query: string;
  clicks: number;
  impressions: number;
  pages: CannibalizationPage[];
  /** Share of impressions held by the dominant URL (0-1). Lower = more evenly split = worse. */
  dominantShare: number;
  /** Conflict severity: impressions weighted by how evenly they split between URLs. */
  severity: number;
};

export type DecayRow = {
  value: string;
  previousClicks: number;
  recentClicks: number;
  clicksLost: number;
  changeRatio: number;
};

export type TrackedKeyword = {
  query: string;
  createdAt: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type ImportResponse = {
  importedRows: number;
  startDate: string;
  endDate: string;
};
