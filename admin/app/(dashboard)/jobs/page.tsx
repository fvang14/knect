import { api } from "@/lib/api";
import { JobsTable } from "@/components/jobs-table";
import { Suspense } from "react";

export default async function JobsPage() {
  const jobs = await api.jobs();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Jobs</h1>
      <Suspense>
        <JobsTable jobs={jobs} />
      </Suspense>
    </div>
  );
}
