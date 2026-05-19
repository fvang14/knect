export type JobStatus =
  | "pending"
  | "accepted"
  | "denied"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface ContractorPosition {
  contractor_id: string;
  lat: number;
  lng: number;
}

export interface NearbyContractor {
  user_id: string;
  display_name: string;
  bio: string | null;
  base_rate: number | null;
  base_rate_unit: "per_hour" | "per_job" | null;
  is_busy: boolean;
  avg_rating: number;
  rating_count: number;
  current_lat: number | null;
  current_lng: number | null;
  distance_meters: number;
}

export interface PublicRating {
  score: number;
  review_text: string | null;
  created_at: string;
}

export interface PublicContractorProfile {
  user_id: string;
  display_name: string;
  bio: string | null;
  base_rate: number | null;
  base_rate_unit: "per_hour" | "per_job" | null;
  is_available: boolean;
  is_busy: boolean;
  avg_rating: number;
  rating_count: number;
  ratings: PublicRating[];
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

export interface CustomerJobListItem {
  id: string;
  contractor_id: string;
  contractor_display_name: string;
  status: JobStatus;
  description: string;
  created_at: string;
  has_rating: boolean;
}

export interface ActiveJob {
  id: string;
  status: JobStatus;
  quote: QuoteDetail | null;
}

export type WsEvent =
  | { type: "snapshot"; contractors: ContractorPosition[] }
  | { type: "location_update"; contractor_id: string; lat: number; lng: number }
  | { type: "job_accepted"; job_id: string }
  | { type: "job_denied"; job_id: string }
  | { type: "job_completed"; job_id: string }
  | { type: "job_cancelled"; job_id: string };
