'use client';

import React from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CheckpointConfig, RouteCoordinate } from '@/lib/supabase';

// Fix for default Leaflet icon in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Custom Brutalist Marker ────────────────────────────────────────
const brutalistIcon = L.divIcon({
  className: 'custom-brutalist-marker',
  html: `<div style="width: 16px; height: 16px; background-color: #ffffff; border: 3px solid #141313; box-shadow: 2px 2px 0px rgba(255,255,255,0.8);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -10]
});

interface RouteViewerProps {
  checkpoints: CheckpointConfig[];
  routeCoordinates: RouteCoordinate[];
}

export default function RouteViewer({ checkpoints, routeCoordinates }: RouteViewerProps) {
  if (!routeCoordinates || routeCoordinates.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center border-2 border-primary bg-surface-container-lowest min-h-[300px]">
        <div className="text-center space-y-sm">
          <span
            className="material-symbols-outlined text-[48px] block mx-auto text-on-surface-variant"
            style={{ fontVariationSettings: "'FILL' 0" }}
          >
            map
          </span>
          <p className="font-label-caps text-label-caps text-on-surface-variant">ROUTE_NOT_CONFIGURED</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant opacity-60">
            CREATOR HAS NOT SET UP A ROUTE FOR THIS EVENT
          </p>
        </div>
      </div>
    );
  }

  // Center map on the midpoint of the route
  const centerLat = routeCoordinates[Math.floor(routeCoordinates.length / 2)].lat;
  const centerLng = routeCoordinates[Math.floor(routeCoordinates.length / 2)].lng;

  return (
    <div className="h-full w-full relative z-0 border-2 border-primary">
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={14}
        style={{ height: '100%', width: '100%' }}
        attributionControl={false}
      >
        {/* Same minimalist CartoDB layer to match the Admin view */}
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

        {/* Draw the snapped-to-road route */}
        <Polyline
          positions={routeCoordinates.map((c) => [c.lat, c.lng] as [number, number])}
          color="#ffffff"
          weight={4}
          opacity={0.9}
        />

        {/* Checkpoint Markers */}
        {checkpoints &&
          checkpoints.map((wp) => (
            <Marker key={wp.id} position={[wp.lat, wp.lng]} icon={brutalistIcon}>
              <Popup>
                <span style={{ fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>{wp.label}</span>
              </Popup>
            </Marker>
          ))}
      </MapContainer>

      {/* Overlay: checkpoint count badge */}
      {checkpoints && checkpoints.length > 0 && (
        <div className="absolute top-md left-md z-[1000] border-2 border-primary bg-background p-sm font-label-caps text-label-caps pointer-events-none">
          {checkpoints.map((cp) => (
            <div key={cp.id}>
              {cp.label}: {cp.lat.toFixed(4)}°, {cp.lng.toFixed(4)}°
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
