"use client";

import { useState, useEffect, useCallback } from "react";
import { MapPin } from "lucide-react";
import { DirectoryList } from "./directory-list";
import { MapView } from "@/components/map/map-view";
import { JobStatusPanel } from "@/components/panels/job-status-panel";
import { useJob } from "@/components/providers/providers";
import { api } from "@/lib/api-client";
import type { NearbyContractor } from "@/lib/types";

const DEFAULT_LAT = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? "40.7128");
const DEFAULT_LNG = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? "-74.006");

interface SignedInDirectoryProps {
  initialContractors: NearbyContractor[];
}

export function SignedInDirectory({ initialContractors }: SignedInDirectoryProps) {
  const [contractors, setContractors] = useState<NearbyContractor[]>(initialContractors);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const { activeJob } = useJob();

  const fetchContractors = useCallback(async () => {
    try {
      const lat = userLocation?.lat ?? DEFAULT_LAT;
      const lng = userLocation?.lng ?? DEFAULT_LNG;
      const nearby = await api.nearbyContractors(lat, lng);
      setContractors(nearby);
    } catch {
      // keep previous data on error
    }
  }, [userLocation]);

  useEffect(() => {
    fetchContractors();
    const interval = setInterval(fetchContractors, 30_000);
    return () => clearInterval(interval);
  }, [fetchContractors]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Hero */}
      <section className="px-10 pt-5 pb-3 flex-shrink-0">
        <h2 className="text-[22px] font-semibold text-slate-900 m-0">
          {contractors.length} pros near you
        </h2>
      </section>

      {/* Two-column */}
      <div className="flex gap-6 px-10 pb-7 flex-1 min-h-0 overflow-hidden">
        {/* List */}
        <main className="flex-1 min-w-0 flex flex-col min-h-0">
          <DirectoryList
            contractors={contractors}
            isLoggedIn={true}
            showLiveIndicator={true}
          />
        </main>

        {/* Map sidebar */}
        <aside className="w-[380px] flex-shrink-0 flex flex-col gap-3">
          <div className="relative flex-1 min-h-[360px] bg-white border border-warm-border rounded-card overflow-hidden">
            <MapView
              onContractorClick={(id) => {
                // Navigation handled by capsule pins via router.push in MapView
              }}
              onUserLocationChange={setUserLocation}
            />
            {/* Recenter button */}
            <button
              className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-white border border-warm-border flex items-center justify-center"
              style={{ boxShadow: "0 2px 6px -2px rgba(15,23,42,0.15)" }}
              onClick={() => {}}
              aria-label="Recenter map"
            >
              <MapPin size={16} />
            </button>
          </div>
        </aside>
      </div>

      {activeJob && <JobStatusPanel />}
    </div>
  );
}
