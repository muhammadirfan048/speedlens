"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { AnimatePresence, motion, useSpring, useTransform } from "framer-motion";
import {
  Activity,
  Cpu,
  Facebook,
  Mail,
  RotateCcw,
  Share2,
  SlidersHorizontal,
  Twitter,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSpeedTest } from "@/hooks/useSpeedTest";
import type { SpeedTestResults } from "@/types/speedtest";
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
  const [shareUrl, setShareUrl] = useState("https://speedlens.app");
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

  useEffect(() => {
    setShareUrl(window.location.href);
  }, []);

  const handleShare = () => {
    const data = {
      title: "SpeedLens",
      text: "Test your internet speed with SpeedLens",
      url: shareUrl,
    };

    if (navigator.share) {
      void navigator.share(data).catch(() => undefined);
      return;
    }

    void navigator.clipboard?.writeText(shareUrl);
  };

  return (
    <main className="min-h-screen overflow-hidden px-5 py-6 text-white sm:px-8">
      <section
        aria-labelledby="speedlens-title"
        className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col items-center justify-center gap-7"
      >
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col items-center text-center"
        >
          <Image
            src="/speedlens.png"
            alt=""
            width={393}
            height={290}
            priority
            className="h-auto w-44 mix-blend-screen sm:w-56"
          />
          <h1 id="speedlens-title" className="sr-only">
            SpeedLens
          </h1>
        </motion.div>

        <div className="flex w-full flex-col items-center gap-5 text-center">
          <p className="text-2xl font-semibold tracking-normal text-white sm:text-4xl">
            Your Internet speed is
          </p>

          <div aria-atomic="true" className="speed-readout">
            <motion.span
              aria-live="polite"
              className="speed-number max-w-full font-semibold tabular-nums text-white"
            >
              {roundedSpeed}
            </motion.span>
            <div className="speed-side">
              <button
                type="button"
                onClick={retry}
                aria-label="Restart test"
                className="speed-refresh inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-accent transition hover:border-accent/60 hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-accent/70"
              >
                <RotateCcw aria-hidden="true" className="h-5 w-5" />
              </button>
              <span className="speed-unit">Mbps</span>
            </div>
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
              className="w-full max-w-4xl"
            >
              <MetricGrid results={results} />
              <ConnectionSummary results={results} />
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

        <SocialFooter shareUrl={shareUrl} onShare={handleShare} />

        <span className="sr-only">
          AI Diagnosis, ISP Comparison, History, User Accounts, Share Result, Export PDF,
          and Server Selection are prepared as future modules.
        </span>
      </section>
    </main>
  );
}

function ConnectionSummary({ results }: { results: SpeedTestResults }) {
  const clientAddress = results.diagnostics.ipv4 ?? results.diagnostics.ipv6;
  const clientText = joinDisplayParts([results.diagnostics.clientLocation, clientAddress]);
  const serverText = results.server.location;

  return (
    <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 text-left text-sm sm:grid-cols-[1fr_1.5fr]">
      <div className="min-w-0">
        <span className="mr-2 font-semibold text-white">Client</span>
        <span className="break-words text-muted">{clientText || "Unavailable"}</span>
      </div>
      <div className="min-w-0">
        <span className="mr-2 font-semibold text-white">Server(s)</span>
        <span className="break-words text-muted">{serverText || "Unavailable"}</span>
      </div>
    </div>
  );
}

function SocialFooter({
  shareUrl,
  onShare,
}: {
  shareUrl: string;
  onShare: () => void;
}) {
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent("Test your internet speed with SpeedLens");
  const encodedMailBody = encodeURIComponent(`Test your internet speed with SpeedLens: ${shareUrl}`);

  return (
    <footer className="flex items-center justify-center gap-3" aria-label="Share SpeedLens">
      <button
        type="button"
        onClick={onShare}
        aria-label="Share SpeedLens"
        className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-muted transition hover:border-accent/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-accent/70"
      >
        <Share2 aria-hidden="true" className="h-5 w-5" />
      </button>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Share on Facebook"
        className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-muted transition hover:border-accent/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-accent/70"
      >
        <Facebook aria-hidden="true" className="h-5 w-5" />
      </a>
      <a
        href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Share on X"
        className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-muted transition hover:border-accent/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-accent/70"
      >
        <Twitter aria-hidden="true" className="h-5 w-5" />
      </a>
      <a
        href={`mailto:?subject=SpeedLens&body=${encodedMailBody}`}
        aria-label="Share by email"
        className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-muted transition hover:border-accent/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-accent/70"
      >
        <Mail aria-hidden="true" className="h-5 w-5" />
      </a>
    </footer>
  );
}

function joinDisplayParts(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join("  ");
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
