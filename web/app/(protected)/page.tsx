"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { MapView } from "@/components/map/map-view";
import { ContractorPanel } from "@/components/panels/contractor-panel";
import { JobStatusPanel } from "@/components/panels/job-status-panel";
import { useJob } from "@/components/providers/providers";
import { api } from "@/lib/api-client";

export default function MapPage() {
  const [selectedContractorId, setSelectedContractorId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const { activeJob, setActiveJob } = useJob();
  const searchParams = useSearchParams();

  // Pre-open rating panel for completed jobs linked from /jobs
  useEffect(() => {
    const rateJobId = searchParams.get("rate");
    if (!rateJobId || activeJob) return;
    api
      .getJob(rateJobId)
      .then((job) => {
        if (job.status === "completed") {
          setActiveJob({ id: job.id, status: "completed", quote: job.quote });
        }
      })
      .catch(() => {});
  }, [searchParams, activeJob, setActiveJob]);

  return (
    <div className="relative w-full h-full">
      <MapView
        onContractorClick={setSelectedContractorId}
        onUserLocationChange={setUserLocation}
      />

      {selectedContractorId && !activeJob && (
        <ContractorPanel
          contractorId={selectedContractorId}
          userLocation={userLocation}
          onClose={() => setSelectedContractorId(null)}
        />
      )}

      {activeJob && (
        <JobStatusPanel />
      )}
    </div>
  );
}
