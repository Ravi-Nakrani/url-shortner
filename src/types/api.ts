export interface CreateLinkRequest {
  longUrl: string;
}

export interface CreateLinkResponse {
  shortCode: string;
  shortUrl: string;
  longUrl: string;
  createdAt: string;
}

export interface ApiErrorResponse {
  error: {
    message: string;
    code: string;
  };
}

export interface ProcessOutboxResponse {
  processedCount: number;
  groupsUpdated: number;
  tookMs: number;
}
