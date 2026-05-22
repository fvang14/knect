"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useMapContractors, useAuth } from "@/components/providers/providers";
import { api } from "@/lib/api-client";
import type { NearbyContractor } from "@/lib/types";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

const DEFAULT_LAT = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? "40.7128");
const DEFAULT_LNG = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? "-74.006");

interface Props {
  onContractorClick: (contractorId: string) => void;
  onUserLocationChange: (pos: { lat: number; lng: number }) => void;
}

function createCapsuleElement(
  rate: number | null,
  isAvailable: boolean,
  onClick: () => void
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "cursor: pointer; transform: translate(-50%, -100%);";

  const pill = document.createElement("div");
  pill.style.cssText = `
    display: inline-flex; align-items: center; gap: 6px;
    background: #fff; border-radius: 9999px; padding: 3px 9px 3px 4px;
    box-shadow: 0 4px 12px -2px rgba(15,23,42,0.18), 0 0 0 1px rgba(15,23,42,0.06);
    font-size: 11px; font-weight: 600; color: #0f172a;
    font-variant-numeric: tabular-nums;
  `;

  const dot = document.createElement("span");
  dot.style.cssText = `
    width: 16px; height: 16px; border-radius: 9999px;
    background: ${isAvailable ? "#2563eb" : "#9ca3af"};
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(15,23,42,0.1);
    flex-shrink: 0;
  `;

  const label = document.createElement("span");
  label.textContent = rate != null ? `$${rate}` : "···";

  const tail = document.createElement("div");
  tail.style.cssText = `
    width: 0; height: 0; margin: 0 auto;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 5px solid #fff;
    filter: drop-shadow(0 2px 1px rgba(15,23,42,0.1));
  `;

  pill.appendChild(dot);
  pill.appendChild(label);
  wrapper.appendChild(pill);
  wrapper.appendChild(tail);

  if (isAvailable) {
    wrapper.addEventListener("click", onClick);
  } else {
    wrapper.style.cursor = "default";
    wrapper.style.opacity = "0.6";
  }

  return wrapper;
}

export function MapView({ onContractorClick, onUserLocationChange }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const { token } = useAuth();
  const { contractors, availableIds, setAvailableIds } = useMapContractors();
  const [locationBanner, setLocationBanner] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const onClickRef = useRef(onContractorClick);
  const onLocationRef = useRef(onUserLocationChange);
  useEffect(() => { onClickRef.current = onContractorClick; }, [onContractorClick]);
  useEffect(() => { onLocationRef.current = onUserLocationChange; }, [onUserLocationChange]);

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

  const fetchNearby = useCallback(async () => {
    if (!userPos || !token) return;
    try {
      const nearby = await api.nearbyContractors(userPos.lat, userPos.lng);
      setAvailableIds(new Set(nearby.map((c: NearbyContractor) => c.user_id)));
    } catch {
      // keep previous
    }
  }, [userPos, token, setAvailableIds]);

  useEffect(() => {
    fetchNearby();
    const interval = setInterval(fetchNearby, 30_000);
    return () => clearInterval(interval);
  }, [fetchNearby]);

  // User location pin
  useEffect(() => {
    if (!mapRef.current || !userPos) return;
    userMarkerRef.current?.remove();
    const el = document.createElement("div");
    el.style.cssText = `
      width: 16px; height: 16px; border-radius: 50%;
      background: #0f172a; border: 3px solid #fff;
      box-shadow: 0 0 0 6px rgba(15,23,42,0.12);
    `;
    userMarkerRef.current = new mapboxgl.Marker({ element: el })
      .setLngLat([userPos.lng, userPos.lat])
      .addTo(mapRef.current!);
  }, [userPos]);

  // Contractor capsule pins
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const [id, pos] of contractors) {
      const isAvailable = availableIds.has(id);
      const rate: number | null = null; // rate not in position data; shown as ···
      const el = createCapsuleElement(rate, isAvailable, () => {
        router.push(`/pro/${id}`);
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([pos.lng, pos.lat])
        .addTo(mapRef.current!);
      markersRef.current.push(marker);
    }
  }, [contractors, availableIds, router]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {locationBanner && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow px-4 py-2 text-sm text-slate-700 flex items-center gap-2 z-10">
          <span>Using default location — enable location for better results.</span>
          <button onClick={() => setLocationBanner(false)} className="text-slate-400 hover:text-slate-600 ml-1">✕</button>
        </div>
      )}
    </div>
  );
}
