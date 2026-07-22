"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SpeedTestService } from "@/services/SpeedTestService";
import { SpeedTestResults, StageSnapshot } from "@/types/speedtest";

const initialSnapshot: StageSnapshot = {
  stage: "idle",
  label: "Connecting...",
  progress: 0,
  downloadMbps: 0,
};

export function useSpeedTest() {
  const service = useMemo(() => new SpeedTestService(), []);
  const [snapshot, setSnapshot] = useState<StageSnapshot>(initialSnapshot);
  const [results, setResults] = useState<SpeedTestResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    setError(null);
    setResults(null);
    void service.start();
  }, [service]);

  useEffect(() => {
    const unsubscribe = service.subscribe((event) => {
      if (event.type === "snapshot") {
        setSnapshot(event.payload);
        return;
      }

      if (event.type === "complete") {
        setResults(event.payload);
        return;
      }

      setError(event.payload.message);
    });

    run();

    return () => {
      unsubscribe();
      service.stop();
    };
  }, [run, service]);

  return {
    snapshot,
    results,
    error,
    retry: run,
  };
}
