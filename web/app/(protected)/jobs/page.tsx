import { serverApi } from "@/lib/api-server";
import { JobsClient } from "@/components/jobs/jobs-client";
import type { CustomerJobListItem } from "@/lib/types";

function computeSpent(_jobs: CustomerJobListItem[]): number | null {
  // Spent total requires quote data not available in list response
  return null;
}

export default async function JobsPage() {
  let jobs: CustomerJobListItem[] = [];
  try {
    jobs = await serverApi.listJobs();
  } catch {
    // session may have expired; middleware will redirect if needed
  }

  return <JobsClient jobs={jobs} totalSpent={computeSpent(jobs)} />;
}
