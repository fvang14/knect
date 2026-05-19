export type UserRole = "contractor" | "customer" | "admin";
export type JobStatus =
  | "pending"
  | "accepted"
  | "denied"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface UserSummary {
  id: string;
  email: string;
  phone: string | null;
  role: UserRole;
  created_at: string;
  suspended_at: string | null;
}

export interface JobSummary {
  id: string;
  customer_id: string;
  contractor_id: string;
  status: JobStatus;
  description: string;
  created_at: string;
}

export interface Metrics {
  active_contractors: number;
  jobs_today: number;
  avg_rating: number;
}
