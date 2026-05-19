"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapView } from "@/components/map/map-view";
import { ContractorPanel } from "@/components/panels/contractor-panel";
import { JobStatusPanel } from "@/components/panels/job-status-panel";
import { useJob } from "@/components/providers/providers";

export default function MapPage() {
  const [selectedContractorId, setSelectedContractorId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const { activeJob } = useJob();
  const searchParams = useSearchParams();
  const rateJobId = searchParams.get("rate");

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
