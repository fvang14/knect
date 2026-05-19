"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useMapContractors } from "@/components/providers/providers";
import { api } from "@/lib/api-client";
import type { NearbyContractor } from "@/lib/types";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

const DEFAULT_LAT = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? "40.7128");
const DEFAULT_LNG = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? "-74.006");

interface Props {
  onContractorClick: (contractorId: string) => void;
  onUserLocationChange: (pos: { lat: number; lng: number }) => void;
}

export function MapView({ onContractorClick, onUserLocationChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const { contractors, availableIds, setAvailableIds } = useMapContractors();
  const [locationBanner, setLocationBanner] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const onClickRef = useRef(onContractorClick);
  const onLocationRef = useRef(onUserLocationChange);
  useEffect(() => { onClickRef.current = onContractorClick; }, [onContractorClick]);
  useEffect(() => { onLocationRef.current = onUserLocationChange; }, [onUserLocationChange]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [DEFAULT_LNG, DEFAULT_LAT],
      zoom: 13,
    });
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Get user location and seed nearby fetch
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserPos({ lat, lng });
        onLocationRef.current({ lat, lng });
        mapRef.current?.flyTo({ center: [lng, lat], zoom: 14 });
      },
      () => {
        setLocationBanner(true);
        const fallback = { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
        setUserPos(fallback);
        onLocationRef.current(fallback);
      }
    );
  }, []);

  // Fetch nearby contractors (availability layer) every 30s
  const fetchNearby = useCallback(async () => {
    if (!userPos) return;
    try {
      const nearby = await api.nearbyContractors(userPos.lat, userPos.lng);
      setAvailableIds(new Set(nearby.map((c: NearbyContractor) => c.user_id)));
    } catch {
      // keep previous availableIds on error
    }
  }, [userPos, setAvailableIds]);

  useEffect(() => {
    fetchNearby();
    const interval = setInterval(fetchNearby, 30_000);
    return () => clearInterval(interval);
  }, [fetchNearby]);

  // Render markers whenever contractor positions or availability changes
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const [id, pos] of contractors) {
      const isAvailable = availableIds.has(id);
      const el = document.createElement("div");
      el.style.cssText = `
        width: 16px; height: 16px; border-radius: 50%;
        background: ${isAvailable ? "#2563eb" : "#9ca3af"};
        border: 2px solid white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        cursor: ${isAvailable ? "pointer" : "default"};
      `;
      if (isAvailable) {
        el.addEventListener("click", () => onClickRef.current(id));
      }
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([pos.lng, pos.lat])
        .addTo(mapRef.current!);
      markersRef.current.push(marker);
    }
  }, [contractors, availableIds]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {locationBanner && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow px-4 py-2 text-sm text-gray-700 flex items-center gap-2 z-10">
          <span>Using default location — enable location for better results.</span>
          <button
            onClick={() => setLocationBanner(false)}
            className="text-gray-400 hover:text-gray-600 ml-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
