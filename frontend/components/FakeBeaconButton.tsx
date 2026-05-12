"use client";

import { useState } from "react";
import { Bluetooth, BluetoothOff, Radio, Cpu } from "lucide-react";

interface FakeBeaconButtonProps {
  runnerId?: string; // e.g. "Janzzen-SolaRunv1"
}

export function FakeBeaconButton({ runnerId = "RUNNER_CHIP" }: FakeBeaconButtonProps) {
  const [isActive, setIsActive] = useState(false);

  const activate = () => {
    if (!isActive) setIsActive(true);
  };

  return (
    <div className="border-2 border-primary p-lg space-y-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-label-caps text-label-caps">BLE_BEACON</h2>
        <span
          className={`px-xs py-1 font-label-caps text-[10px] ${
            isActive
              ? "bg-green-500 text-background"
              : "bg-outline-variant text-on-surface-variant"
          }`}
        >
          {isActive ? "TRANSMITTING" : "STANDBY"}
        </span>
      </div>

      {/* Chip ID */}
      <div className="flex items-center gap-sm border border-outline-variant p-sm">
        <Cpu className="h-4 w-4 text-primary flex-shrink-0" />
        <div>
          <p className="font-label-caps text-label-caps text-[10px] text-on-surface-variant">
            DEVICE_ID
          </p>
          <p className="font-body-sm text-body-sm font-mono text-primary">
            {runnerId}
          </p>
        </div>
      </div>

      {/* Signal animation */}
      {isActive && (
        <div className="flex items-center justify-center gap-xs py-sm">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
          <span className="w-2 h-2 rounded-full bg-green-500 animate-ping [animation-delay:0.2s]" />
          <span className="w-2 h-2 rounded-full bg-green-500 animate-ping [animation-delay:0.4s]" />
          <span className="font-label-caps text-[10px] text-green-500 ml-sm">
            ADVERTISING BLE...
          </span>
        </div>
      )}

      {/* Main button */}
      <button
        onClick={activate}
        disabled={isActive}
        className={`w-full py-md font-label-caps text-label-caps border-2 transition-none active:translate-y-1 flex items-center justify-center gap-sm ${
          isActive
            ? "border-green-500 text-green-500 bg-green-500/10 cursor-not-allowed"
            : "border-primary text-primary hover:bg-primary hover:text-background"
        }`}
      >
        {isActive ? (
          <>
            <Radio className="h-4 w-4 animate-pulse" />
            BROADCASTING... 🟢
          </>
        ) : (
          <>
            <Bluetooth className="h-4 w-4" />
            ACTIVATE BEACON
          </>
        )}
      </button>

      {/* Hint */}
      <p className="font-label-caps text-[10px] text-on-surface-variant text-center">
        {isActive
          ? "ESP32 SEDANG MEMINDAI SINYAL INI"
          : "TEKAN UNTUK MEMULAI BROADCAST BLE"}
      </p>
    </div>
  );
}
