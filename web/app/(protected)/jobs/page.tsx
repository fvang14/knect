import { serverApi } from "@/lib/api-server";
import type { CustomerJobListItem, JobStatus } from "@/lib/types";

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  denied: "Denied",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<JobStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  accepted: "bg-green-100 text-green-800",
  denied: "bg-red-100 text-red-800",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-gray-100 text-gray-500",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function JobsPage() {
  let jobs: CustomerJobListItem[] = [];
  try {
    jobs = await serverApi.listJobs();
  } catch {
    // session may have expired; middleware will redirect if needed
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">My Jobs</h1>

      {jobs.length === 0 && (
        <p className="text-gray-500 text-sm">No jobs yet.</p>
      )}

      <ul className="space-y-3">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="bg-white rounded-lg shadow-sm border p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-gray-900">
                  {job.contractor_display_name}
                </p>
                <p className="text-sm text-gray-600 line-clamp-2">
                  {job.description}
                </p>
              </div>
              <span
                className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                  STATUS_COLORS[job.status]
                }`}
              >
                {STATUS_LABELS[job.status]}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{formatDate(job.created_at)}</span>
              {job.status === "completed" && !job.has_rating && (
                <a
                  href={`/?rate=${job.id}`}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Leave a rating
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
