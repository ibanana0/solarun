'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapPinPlus, CheckCircle, Loader2 } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet icon in React/Next.js bundler
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export interface Waypoint {
  lat: number;
  lng: number;
  label: string;
}

// ── Custom Brutalist Marker ────────────────────────────────────────
const brutalistIcon = L.divIcon({
  className: 'custom-brutalist-marker',
  html: `<div style="width: 16px; height: 16px; background-color: #ffffff; border: 3px solid #141313; box-shadow: 2px 2px 0px rgba(255,255,255,0.8);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -10]
});

// ── Routing Machine Integration ───────────────────────────────────
function RoutingControl({
  waypoints,
  onRouteCalculated,
}: {
  waypoints: Waypoint[];
  onRouteCalculated: (coords: Array<{ lat: number; lng: number }>, distanceMeters: number) => void;
}) {
  const map = useMap();
  const controlRef = useRef<any>(null);

  useEffect(() => {
    if (waypoints.length < 2) {
      if (controlRef.current) {
        map.removeControl(controlRef.current);
        controlRef.current = null;
      }
      return;
    }

    const LRM = require('leaflet-routing-machine');

    if (controlRef.current) {
      map.removeControl(controlRef.current);
      controlRef.current = null;
    }

    const control = (L as any).Routing.control({
      waypoints: waypoints.map((wp) => L.latLng(wp.lat, wp.lng)),
      routeWhileDragging: false,
      showAlternatives: false,
      fitSelectedRoutes: true,
      addWaypoints: false,
      lineOptions: {
        styles: [{ color: '#ffffff', weight: 4, opacity: 0.9 }],
        extendToWaypoints: true,
        missingRouteTolerance: 0,
      },
      createMarker: () => null,
    }).addTo(map);

    const container = control.getContainer();
    if (container) {
      container.style.display = 'none';
    }

    control.on('routesfound', (e: any) => {
      const route = e.routes[0];
      const coords = route.coordinates.map((c: L.LatLng) => ({ lat: c.lat, lng: c.lng }));
      onRouteCalculated(coords, route.summary.totalDistance);
    });

    // FALLBACK: Jika OSRM error/down, gunakan garis lurus antar waypoint
    control.on('routingerror', (e: any) => {
      console.warn('Routing engine failed, falling back to straight lines.', e);
      const coords = waypoints.map((w) => ({ lat: w.lat, lng: w.lng }));
      let dist = 0;
      for (let i = 0; i < coords.length - 1; i++) {
        dist += L.latLng(coords[i].lat, coords[i].lng).distanceTo(L.latLng(coords[i + 1].lat, coords[i + 1].lng));
      }
      onRouteCalculated(coords, dist);
    });

    controlRef.current = control;

    return () => {
      if (controlRef.current) {
        map.removeControl(controlRef.current);
        controlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, JSON.stringify(waypoints.map((w) => [w.lat, w.lng]))]);

  return null;
}

// ── Click handler to add waypoints ────────────────────────────────
function MapClickHandler({ onAdd }: { onAdd: (latlng: L.LatLng) => void }) {
  useMapEvents({ click: (e) => onAdd(e.latlng) });
  return null;
}

// ── Main component ────────────────────────────────────────────────
export interface AdminMapBuilderProps {
  onRouteChange: (
    checkpoints: Array<{ id: number; label: string; lat: number; lng: number }>,
    routeCoords: Array<{ lat: number; lng: number }>,
    distanceMeters: number,
  ) => void;
  disabled?: boolean;
}

export default function AdminMapBuilder({ onRouteChange, disabled }: AdminMapBuilderProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [routeCoords, setRouteCoords] = useState<Array<{ lat: number; lng: number }>>([]);
  const [distance, setDistance] = useState(0);

  const handleAdd = useCallback(
    (latlng: L.LatLng) => {
      if (disabled) return;
      if (waypoints.length >= 10) return;

      let defaultLabel = 'CP_' + String(waypoints.length).padStart(2, '0');
      if (waypoints.length === 0) defaultLabel = 'START';

      const userLabel = window.prompt('Masukkan legenda/nama untuk checkpoint ini (contoh: Pos Air, Finish):', defaultLabel);
      if (userLabel === null) return; // User cancelled

      const label = userLabel.trim() || defaultLabel;

      const newWaypoint = { lat: latlng.lat, lng: latlng.lng, label };
      const newWaypoints = [...waypoints, newWaypoint];
      
      setWaypoints(newWaypoints);

      // If it's the first point, or we only have 1 point, update straight away
      // because RoutingControl only triggers on 2+ points
      if (newWaypoints.length < 2) {
          const mapped = newWaypoints.map((wp, i) => ({ id: i, label: wp.label, lat: wp.lat, lng: wp.lng }));
          onRouteChange(mapped, [], 0);
      }
    },
    [disabled, waypoints, onRouteChange],
  );

  const handleClear = () => {
    setWaypoints([]);
    setRouteCoords([]);
    setDistance(0);
    onRouteChange([], [], 0);
  };

  const handleRouteCalculated = useCallback(
    (coords: Array<{ lat: number; lng: number }>, dist: number) => {
      setRouteCoords(coords);
      setDistance(dist);
      const checkpoints = waypoints.map((wp, i) => ({
        id: i,
        label: wp.label,
        lat: wp.lat,
        lng: wp.lng,
      }));
      onRouteChange(checkpoints, coords, dist);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(waypoints.map((w) => [w.lat, w.lng])), waypoints.map((w) => w.label).join(',')],
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
        <div className="aspect-video bg-surface-container border-2 border-primary flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
        </div>
    );
  }

  const distKm = (distance / 1000).toFixed(2);

  // Determine if we need to draw a straight line fallback manually
  // LRM usually draws the line itself if it succeeds. If routeCoords length matches waypoints exactly, 
  // it means we fell back to straight lines, or it hasn't resolved.
  const isFallback = routeCoords.length > 0 && routeCoords.length === waypoints.length;

  return (
    <div className="space-y-lg">
      {/* Map */}
      <div className="aspect-video bg-surface-container border-2 border-primary relative overflow-hidden cursor-crosshair">
        <MapContainer
          center={[-6.2, 106.816666]}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <MapClickHandler onAdd={handleAdd} />

          {/* Explicit polyline fallback for when OSRM routing fails */}
          {isFallback && (
             <Polyline positions={routeCoords.map(c => [c.lat, c.lng] as [number, number])} color="#ffffff" weight={4} dashArray="10, 10" />
          )}

          {waypoints.map((wp, i) => (
            <Marker key={`wp-${i}-${wp.lat}-${wp.lng}`} position={[wp.lat, wp.lng]} icon={brutalistIcon}>
              <Popup>
                <span className="font-space-mono font-bold">{wp.label}</span>
              </Popup>
            </Marker>
          ))}

          <RoutingControl waypoints={waypoints} onRouteCalculated={handleRouteCalculated} />
        </MapContainer>

        {/* Overlay: instructions when empty */}
        {waypoints.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40 pointer-events-none">
            <div className="border-2 border-primary bg-background px-lg py-md text-center">
              <MapPinPlus className="h-12 w-12 block mx-auto mb-sm text-on-surface-variant" />
              <p className="font-label-caps text-label-caps text-on-surface-variant">CLICK TO ADD CHECKPOINTS</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs opacity-60">START → CHECKPOINT → FINISH</p>
            </div>
          </div>
        )}
      </div>

      {/* Checkpoint list */}
      <div className="space-y-md">
        <div className="flex flex-col gap-sm">
          <label className="font-label-caps text-label-caps text-on-surface-variant">ACTIVE_CHECKPOINTS</label>
          {waypoints.length === 0 && (
            <div className="border-2 border-outline-variant p-sm">
              <span className="font-body-sm text-xs text-on-surface-variant opacity-60">NO CHECKPOINTS CONFIGURED</span>
            </div>
          )}
          {waypoints.map((wp, i) => {
            return (
              <div key={i} className="border-2 border-outline-variant p-sm flex justify-between items-center">
                <span className="font-body-sm text-xs text-on-surface-variant">
                  <span className="text-primary font-bold mr-2">{wp.label}</span>
                  {wp.lat.toFixed(5)}° , {wp.lng.toFixed(5)}°
                </span>
                <CheckCircle className="h-3.5 w-3.5 text-primary" />
              </div>
            );
          })}
        </div>

        {/* Stats & Clear */}
        <div className="flex justify-between items-center">
          <span className="font-label-caps text-label-caps text-on-surface-variant">
            {waypoints.length} CP // {distKm} KM
          </span>
          {waypoints.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="font-label-caps text-label-caps text-xs border-2 border-primary px-md py-xs hover:bg-primary hover:text-background transition-none text-on-surface-variant"
            >
              CLEAR_ROUTE
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
