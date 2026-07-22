"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion, useSpring, useTransform } from "framer-motion";
import { Activity, Cpu, RotateCcw, SlidersHorizontal, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { useSpeedTest } from "@/hooks/useSpeedTest";
import { formatMbps } from "@/utils/format";
import { MetricGrid } from "@/components/MetricGrid";

const AdvancedPanel = dynamic(() => import("@/components/AdvancedPanel"), {
  loading: () => <PanelLoading label="Advanced" />,
  ssr: false,
});

const HardwarePanel = dynamic(() => import("@/components/HardwarePanel"), {
  loading: () => <PanelLoading label="Hardware" />,
  ssr: false,
});

export function SpeedTestApp() {
  const { snapshot, results, error, retry } = useSpeedTest();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hardwareOpen, setHardwareOpen] = useState(false);
  const animatedSpeed = useSpring(snapshot.downloadMbps, {
    stiffness: 80,
    damping: 20,
    mass: 0.7,
  });
  const roundedSpeed = useTransform(animatedSpeed, (value) => formatMbps(value));
  const isComplete = snapshot.stage === "complete";
  const failed = snapshot.stage === "error" || error !== null;

  useEffect(() => {
    animatedSpeed.set(snapshot.downloadMbps);
  }, [animatedSpeed, snapshot.downloadMbps]);

  return (
    <main className="min-h-screen overflow-hidden px-5 py-6 text-white sm:px-8">
      <section
        aria-labelledby="speedlens-title"
        className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col items-center justify-center gap-8"
      >
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex items-center gap-2 text-sm font-semibold tracking-normal text-white"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
            <Wifi aria-hidden="true" className="h-4 w-4 text-accent" />
          </span>
          <h1 id="speedlens-title">SpeedLens</h1>
        </motion.div>

        <div className="flex w-full flex-col items-center gap-5 text-center">
          <div aria-live="polite" aria-atomic="true" className="flex flex-col items-center">
            <motion.span className="speed-number max-w-full font-semibold tabular-nums text-white">
              {roundedSpeed}
            </motion.span>
            <span className="-mt-1 text-base font-medium text-muted sm:text-lg">Mbps</span>
          </div>

          <AnimatePresence mode="wait">
            <motion.p
              key={failed ? "failed" : snapshot.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className={failed ? "text-sm text-error" : "text-sm text-muted"}
            >
              {failed ? "Unable to complete test" : snapshot.label}
            </motion.p>
          </AnimatePresence>

          <div
            aria-hidden="true"
            className="h-1 w-full max-w-72 overflow-hidden rounded-full bg-white/[0.06]"
          >
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={false}
              animate={{ width: `${Math.max(snapshot.progress, failed ? 100 : 0)}%` }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            />
          </div>

          {failed ? (
            <button
              type="button"
              onClick={retry}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm text-white transition hover:border-accent/60 hover:bg-accent/15 focus:outline-none focus:ring-2 focus:ring-accent/70"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Retry
            </button>
          ) : null}
        </div>

        <AnimatePresence>
          {isComplete && results ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.25 }}
              className="w-full max-w-2xl"
            >
              <MetricGrid results={results} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <ToggleButton
            icon={<SlidersHorizontal aria-hidden="true" className="h-4 w-4" />}
            label="Advanced"
            expanded={advancedOpen}
            onClick={() => setAdvancedOpen((value) => !value)}
          />
          <ToggleButton
            icon={<Cpu aria-hidden="true" className="h-4 w-4" />}
            label="Hardware Test"
            expanded={hardwareOpen}
            onClick={() => setHardwareOpen((value) => !value)}
          />
          <button
            type="button"
            onClick={retry}
            aria-label="Restart test"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-muted transition hover:border-accent/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-accent/70"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="grid w-full max-w-4xl gap-3">
          <AnimatePresence initial={false}>
            {advancedOpen ? (
              <motion.div
                key="advanced"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <AdvancedPanel results={results} />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {hardwareOpen ? (
              <motion.div
                key="hardware"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <HardwarePanel />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <span className="sr-only">
          AI Diagnosis, ISP Comparison, History, User Accounts, Share Result, Export PDF,
          and Server Selection are prepared as future modules.
        </span>
      </section>
    </main>
  );
}

function ToggleButton({
  icon,
  label,
  expanded,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onClick}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 text-sm text-muted transition hover:border-accent/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-accent/70"
    >
      {icon}
      {label}
    </button>
  );
}

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-20 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-sm text-muted">
      <Activity aria-hidden="true" className="mr-2 h-4 w-4 animate-pulse" />
      {label}
    </div>
  );
}
