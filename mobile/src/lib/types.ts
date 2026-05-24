export type JobStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'denied'
  | 'cancelled';

export type RateUnit = 'per_hour' | 'per_job';

export interface TradeCategory {
  id: string;
  name: string;
  icon_slug: string;
}

export interface ContractorProfile {
  user_id: string;
  display_name: string;
  bio: string | null;
  base_rate: number | null;
  base_rate_unit: RateUnit | null;
  is_available: boolean;
  is_busy: boolean;
  current_lat: number | null;
  current_lng: number | null;
  avg_rating: number;
  rating_count: number;
  trade_categories: TradeCategory[];
}

export interface JobQueueItem {
  id: string;
  customer_id: string;
  status: JobStatus;
  description: string;
  location_lat: number;
  location_lng: number;
  location_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteDetail {
  id: string;
  base_rate_snapshot: number | null;
  custom_amount: number | null;
  custom_note: string | null;
  created_at: string;
}

export interface JobDetail {
  id: string;
  customer_id: string;
  contractor_id: string;
  status: JobStatus;
  description: string;
  location_lat: number;
  location_lng: number;
  location_address: string | null;
  created_at: string;
  updated_at: string;
  quote: QuoteDetail | null;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

// Incoming request card populated from WS job_requested event
export interface PendingRequest {
  job_id: string;
  description: string;
  location_lat: number;
  location_lng: number;
  received_at: string;
}

export type WsEvent =
  | { type: 'snapshot'; contractors: unknown[] }
  | { type: 'location_update'; contractor_id: string; lat: number; lng: number }
  | { type: 'job_requested'; job_id: string; description: string; location_lat: number; location_lng: number }
  | { type: 'job_accepted'; job_id: string }
  | { type: 'job_denied'; job_id: string }
  | { type: 'job_completed'; job_id: string }
  | { type: 'job_cancelled'; job_id: string };

export type WsEventType = WsEvent['type'];
