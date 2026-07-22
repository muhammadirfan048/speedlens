import { Gauge, Radio, Upload, Waves, WifiOff } from "lucide-react";
import { SpeedTestResults } from "@/types/speedtest";
import { formatMbps, formatMs, formatPercent } from "@/utils/format";

export function MetricGrid({ results }: { results: SpeedTestResults }) {
  const metrics = [
    {
      label: "Download",
      value: `${formatMbps(results.downloadMbps)} Mbps`,
      icon: Gauge,
    },
    {
      label: "Upload",
      value: `${formatMbps(results.uploadMbps)} Mbps`,
      icon: Upload,
    },
    {
      label: "Ping",
      value: formatMs(results.pingMs),
      icon: Radio,
    },
    {
      label: "Jitter",
      value: formatMs(results.jitterMs),
      icon: Waves,
    },
    {
      label: "Packet Loss",
      value: formatPercent(results.packetLossPercent),
      icon: WifiOff,
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {metrics.map((metric) => {
        const Icon = metric.icon;

        return (
          <div
            key={metric.label}
            className="min-h-24 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left"
          >
            <dt className="flex items-center gap-2 text-xs text-muted">
              <Icon aria-hidden="true" className="h-3.5 w-3.5 text-accent" />
              {metric.label}
            </dt>
            <dd className="mt-3 text-base font-semibold tabular-nums text-white">{metric.value}</dd>
          </div>
        );
      })}
    </dl>
  );
}
