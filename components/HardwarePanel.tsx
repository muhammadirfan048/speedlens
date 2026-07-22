"use client";

import { Cpu } from "lucide-react";
import { useEffect, useState } from "react";
import { HardwareDiagnostics } from "@/types/speedtest";
import { getHardwareDiagnostics } from "@/lib/hardwareDiagnostics";
import { formatNullable } from "@/utils/format";

type DiagnosticRow = [label: string, value: string | number | boolean | null];

export default function HardwarePanel() {
  const [diagnostics, setDiagnostics] = useState<HardwareDiagnostics | null>(null);

  useEffect(() => {
    let mounted = true;

    void getHardwareDiagnostics().then((value) => {
      if (mounted) {
        setDiagnostics(value);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const rows: DiagnosticRow[] = diagnostics
    ? [
        ["CPU Threads", diagnostics.cpuThreads],
        ["RAM", diagnostics.ramGb ? `${diagnostics.ramGb} GB` : null],
        ["GPU Renderer", diagnostics.gpuRenderer],
        ["Screen Refresh Rate", diagnostics.refreshRateHz ? `${diagnostics.refreshRateHz} Hz` : null],
        ["Battery", diagnostics.battery],
        ["Touch Support", diagnostics.touchSupport],
        ["Camera Availability", diagnostics.cameraAvailability],
        ["Microphone Availability", diagnostics.microphoneAvailability],
        ["Bluetooth Availability", diagnostics.bluetoothAvailability],
        ["WebGPU Support", diagnostics.webGpuSupport],
        ["WebGL Support", diagnostics.webGlSupport],
        ["Local Storage", diagnostics.localStorage],
        ["IndexedDB", diagnostics.indexedDb],
        ["Cookies Enabled", diagnostics.cookiesEnabled],
        ["Hardware Acceleration", diagnostics.hardwareAcceleration],
      ]
    : [];

  return (
    <section
      aria-label="Hardware diagnostics"
      className="rounded-lg border border-white/10 bg-white/[0.03] p-4 sm:p-5"
    >
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white">
        <Cpu aria-hidden="true" className="h-4 w-4 text-accent" />
        Hardware Test
      </div>

      {diagnostics ? (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0 border-t border-white/[0.06] pt-3">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-1 break-words text-sm text-white/90">{formatNullable(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted">Checking supported hardware signals...</p>
      )}
    </section>
  );
}
