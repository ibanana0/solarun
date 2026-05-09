'use client';

import React, { useRef } from 'react';
import { Map } from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CheckpointConfig, RouteCoordinate } from '@/lib/supabase';
import type { RunnerWithLogs } from '@/hooks/useRunners';

// Fix for default Leaflet icon in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Custom Marker Factories ────────────────────────────────────────
function makeCheckpointIcon(cpId: number, runnerCount: number, label: string) {
  const isStart = cpId === 0;
  const hasRunners = runnerCount > 0;
  const badgeHtml = hasRunners
    ? `<div style="position:absolute;top:-8px;right:-8px;background:#22c55e;color:#000;font-family:'Space Mono',monospace;font-weight:700;font-size:9px;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1.5px solid #141313;z-index:2;">${runnerCount}</div>`
    : '';
  const bgColor = isStart ? '#22c55e' : hasRunners ? '#f59e0b' : '#ffffff';
  return L.divIcon({
    className: 'custom-checkpoint-marker',
    html: `<div style="position:relative;width:20px;height:20px;background:${bgColor};border:3px solid #141313;box-shadow:2px 2px 0px rgba(0,0,0,0.5);">${badgeHtml}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -14],
  });
}

// Status color helper
const STATUS_COLOR: Record<string, string> = {
  registered: '#94a3b8',
  running: '#22c55e',
  finished: '#f59e0b',
  disqualified: '#ef4444',
};

// ── Checkpoint Marker with hover popup ──────────────────────────
function CheckpointMarkerWithPopup({
  cp,
  runnersAtOrPast,
}: {
  cp: CheckpointConfig;
  runnersAtOrPast: RunnerWithLogs[];
}) {
  const markerRef = useRef<L.Marker>(null);
  const icon = makeCheckpointIcon(cp.id, runnersAtOrPast.length, cp.label);

  return (
    <Marker
      ref={markerRef}
      position={[cp.lat, cp.lng]}
      icon={icon}
      eventHandlers={{
        mouseover: (e) => { e.target.openPopup(); },
        mouseout: (e) => { e.target.closePopup(); },
      }}
    >
      <Popup>
        <CheckpointPopupContent cp={cp} runners={runnersAtOrPast} />
      </Popup>
    </Marker>
  );
}

function CheckpointPopupContent({ cp, runners }: { cp: CheckpointConfig; runners: RunnerWithLogs[] }) {
  return (
    <div style={{ fontFamily: "'Space Mono', monospace", minWidth: 190, background: '#0f172a', margin: '-8px -10px', padding: '10px 12px' }}>
      <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#e2e8f0', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 6, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{cp.label}</span>
        <span style={{ background: runners.length > 0 ? '#22c55e' : '#334155', color: runners.length > 0 ? '#000' : '#94a3b8', padding: '1px 6px', fontSize: 10 }}>
          {runners.length} RUNNER{runners.length !== 1 ? 'S' : ''}
        </span>
      </div>
      {runners.length === 0 ? (
        <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', padding: '4px 0' }}>No runners here yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {runners.map((r) => {
            const log = r.race_logs?.find((l) => l.checkpoint_id === cp.id);
            const timeStr = log
              ? new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '—';
            const dotColor = STATUS_COLOR[r.status] ?? '#94a3b8';
            return (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 3 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#e2e8f0' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
                  {r.full_name}
                  {r.finish_position && <span style={{ color: '#f59e0b' }}> #{r.finish_position}</span>}
                </span>
                <span style={{ color: '#64748b', marginLeft: 8, flexShrink: 0 }}>{timeStr}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface RouteViewerProps {
  checkpoints: CheckpointConfig[];
  routeCoordinates: RouteCoordinate[];
  runners?: RunnerWithLogs[];
}

export default function RouteViewer({ checkpoints, routeCoordinates, runners = [] }: RouteViewerProps) {
  if (!routeCoordinates || routeCoordinates.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center border-2 border-primary bg-surface-container-lowest min-h-[300px]">
        <div className="text-center space-y-sm">
          <Map className="h-12 w-12 block mx-auto text-on-surface-variant" />
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

  // For each checkpoint, find which runners have passed through it
  const getRunnersAtCheckpoint = (cpId: number): RunnerWithLogs[] => {
    return runners.filter((r) => r.race_logs?.some((log) => log.checkpoint_id === cpId));
  };

  // Count active runners per checkpoint for the overlay legend
  const checkpointStats = checkpoints.map((cp) => ({
    cp,
    count: getRunnersAtCheckpoint(cp.id).length,
  }));

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

        {/* Checkpoint Markers with hover popup */}
        {checkpoints && checkpoints.map((cp) => (
          <CheckpointMarkerWithPopup
            key={cp.id}
            cp={cp}
            runnersAtOrPast={getRunnersAtCheckpoint(cp.id)}
          />
        ))}
      </MapContainer>

      {/* Overlay: Legend */}
      {checkpoints && checkpoints.length > 0 && (
        <div className="absolute top-md left-md z-[1000] border-2 border-primary bg-background/95 p-sm font-label-caps text-label-caps pointer-events-none max-w-[180px]">
          <div className="text-[9px] text-on-surface-variant opacity-60 mb-xs">CHECKPOINT STATUS</div>
          {checkpointStats.map(({ cp, count }) => (
            <div key={cp.id} className="flex items-center gap-xs mb-[2px]">
              <div
                className="w-3 h-3 border border-foreground/30 flex-shrink-0"
                style={{ background: cp.id === 0 ? '#22c55e' : count > 0 ? '#f59e0b' : '#334155' }}
              />
              <span className="text-[10px] truncate">{cp.label}</span>
              {count > 0 && (
                <span className="ml-auto text-[10px] text-green-400 font-bold flex-shrink-0">{count}</span>
              )}
            </div>
          ))}
          <div className="mt-xs pt-xs border-t border-primary/30 flex flex-col gap-[2px] text-[9px] text-on-surface-variant">
            <span><span style={{ display: 'inline-block', width: 7, height: 7, background: '#22c55e', marginRight: 4, verticalAlign: 'middle' }} />AT CHECKPOINT</span>
            <span><span style={{ display: 'inline-block', width: 7, height: 7, background: '#f59e0b', marginRight: 4, verticalAlign: 'middle' }} />RUNNERS PASSED</span>
            <span className="opacity-40 text-[8px] mt-[2px]">HOVER MARKER FOR DETAILS</span>
          </div>
        </div>
      )}

      {/* Global popup style override */}
      <style>{`
        .leaflet-popup-content-wrapper {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          border-radius: 0 !important;
        }
        .leaflet-popup-content {
          margin: 0 !important;
        }
        .leaflet-popup-tip-container {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
