"use client";

import { Bot, Server } from "lucide-react";
import { SpeedTestResults } from "@/types/speedtest";
import { formatMs, formatNullable, formatPercent } from "@/utils/format";

export default function AdvancedPanel({ results }: { results: SpeedTestResults | null }) {
  const diagnostics = results?.diagnostics;
  const rows = [
    ["Server Name", results?.server.name ?? null],
    ["Server Location", results ? `${results.server.location}, ${results.server.region}` : null],
    ["IPv4", diagnostics?.ipv4 ?? null],
    ["IPv6", diagnostics?.ipv6 ?? null],
    ["DNS Lookup Time", formatMs(diagnostics?.dnsLookupMs ?? null)],
    ["Latency", formatMs(results?.pingMs ?? null)],
    ["Loaded Latency", formatMs(diagnostics?.loadedLatencyMs ?? null)],
    ["Unloaded Latency", formatMs(diagnostics?.unloadedLatencyMs ?? null)],
    ["Jitter", formatMs(diagnostics?.jitterMs ?? null)],
    ["Packet Loss", formatPercent(diagnostics?.packetLossPercent ?? null)],
    ["Connection Type", diagnostics?.connectionType ?? null],
    ["Browser", diagnostics?.browser ?? null],
    ["OS", diagnostics?.os ?? null],
    ["Screen Resolution", diagnostics?.screenResolution ?? null],
    ["Device Memory", diagnostics?.deviceMemoryGb ? `${diagnostics.deviceMemoryGb} GB` : null],
    ["CPU Threads", diagnostics?.cpuThreads ?? null],
    ["Network Effective Type", diagnostics?.networkEffectiveType ?? null],
    ["Save Data Mode", diagnostics?.saveData ?? null],
    ["Timezone", diagnostics?.timezone ?? null],
    ["Language", diagnostics?.language ?? null],
    ["User Agent", diagnostics?.userAgent ?? null],
  ] as const;

  return (
    <section
      aria-label="Advanced diagnostics"
      className="rounded-lg border border-white/10 bg-white/[0.03] p-4 sm:p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <Server aria-hidden="true" className="h-4 w-4 text-accent" />
          Advanced
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <Bot aria-hidden="true" className="h-3.5 w-3.5" />
          AI Diagnosis disabled
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0 border-t border-white/[0.06] pt-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-1 break-words text-sm text-white/90">{formatNullable(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
