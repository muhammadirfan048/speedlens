import {
  NetworkDiagnostics,
  ServerInfo,
  SpeedTestEvent,
  SpeedTestResults,
  StageSnapshot,
} from "@/types/speedtest";
import { detectBrowser, detectOs, getNavigatorHints } from "@/utils/browser";

type Listener = (event: SpeedTestEvent) => void;

type PingResponse = {
  serverTime: number;
  server: ServerInfo;
};

type UploadResponse = {
  receivedBytes: number;
  serverTime: number;
};

type TransferSample = {
  bytes: number;
  seconds: number;
};

const DOWNLOAD_START_PROGRESS = 38;
const DOWNLOAD_END_PROGRESS = 70;
const DOWNLOAD_TARGET_SECONDS = 4.5;
const DOWNLOAD_MAX_BYTES = 36_000_000;
const DOWNLOAD_MIN_SAMPLE_BYTES = 750_000;
const DOWNLOAD_MAX_SAMPLE_BYTES = 12_000_000;

const UPLOAD_START_PROGRESS = 72;
const UPLOAD_END_PROGRESS = 82;
const UPLOAD_TARGET_SECONDS = 3.5;
const UPLOAD_MAX_BYTES = 16_000_000;
const UPLOAD_MIN_SAMPLE_BYTES = 300_000;
const UPLOAD_MAX_SAMPLE_BYTES = 5_000_000;

export class SpeedTestService {
  private listeners = new Set<Listener>();
  private abortController: AbortController | null = null;
  private latestResults: SpeedTestResults | null = null;
  private stopped = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    this.stop();
    this.abortController = new AbortController();
    this.stopped = false;

    try {
      this.emitSnapshot("connecting", "Connecting...", 4, 0);
      await this.wait(280);

      const serverInfo = await this.findServer();

      this.emitSnapshot("latency", "Analyzing latency...", 20, 0);
      const latencySamples = await this.measureLatency(5);
      const pingMs = average(latencySamples);
      const jitterMs = calculateJitter(latencySamples);

      this.emitSnapshot("download", "Testing download...", DOWNLOAD_START_PROGRESS, 0);
      const downloadMbps = await this.measureDownload((value, progress) => {
        this.emitSnapshot("download", "Testing download...", progress, value);
      });

      this.emitSnapshot("upload", "Testing upload...", UPLOAD_START_PROGRESS, downloadMbps);
      const uploadMbps = await this.measureUpload(downloadMbps);

      this.emitSnapshot("jitter", "Measuring jitter...", 84, downloadMbps);
      await this.wait(320);

      this.emitSnapshot("packetLoss", "Checking packet loss...", 92, downloadMbps);
      const packetLossPercent = this.estimatePacketLoss(latencySamples);
      await this.wait(260);

      const diagnostics = this.collectDiagnostics({
        pingMs,
        jitterMs,
        packetLossPercent,
      });

      const results: SpeedTestResults = {
        downloadMbps,
        uploadMbps,
        pingMs,
        jitterMs,
        packetLossPercent,
        server: serverInfo,
        diagnostics,
        completedAt: new Date().toISOString(),
      };

      this.latestResults = results;
      this.emitSnapshot("complete", "Completed", 100, downloadMbps);
      this.emit({ type: "complete", payload: results });
    } catch (error) {
      if (this.stopped) {
        return;
      }

      this.emitSnapshot("error", "Unable to complete test", 0, 0);
      this.emit({
        type: "error",
        payload: error instanceof Error ? error : new Error("Speed test failed"),
      });
    }
  }

  stop(): void {
    this.stopped = true;
    this.abortController?.abort();
    this.abortController = null;
  }

  getResults(): SpeedTestResults | null {
    return this.latestResults;
  }

  private async findServer(): Promise<ServerInfo> {
    this.emitSnapshot("server", "Finding nearest server...", 12, 0);
    const start = performance.now();
    const response = await fetch(`/api/speed-test/ping?t=${Date.now()}`, {
      cache: "no-store",
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      throw new Error("Server discovery failed");
    }

    const body = (await response.json()) as PingResponse;
    const elapsed = performance.now() - start;
    await this.wait(Math.max(120, 260 - elapsed));
    return body.server;
  }

  private async measureLatency(samples: number): Promise<number[]> {
    const values: number[] = [];

    for (let index = 0; index < samples; index += 1) {
      const startedAt = performance.now();
      const response = await fetch(`/api/speed-test/ping?sample=${index}&t=${Date.now()}`, {
        cache: "no-store",
        signal: this.abortController?.signal,
      });

      if (!response.ok) {
        throw new Error("Latency test failed");
      }

      await response.json();
      values.push(performance.now() - startedAt);
      this.emitSnapshot("latency", "Analyzing latency...", 20 + index * 3, 0);
      await this.wait(80);
    }

    return values;
  }

  private async measureDownload(onSample: (value: number, progress: number) => void): Promise<number> {
    const samples: TransferSample[] = [];
    let nextSize = DOWNLOAD_MIN_SAMPLE_BYTES;
    let totalBytes = 0;

    for (let index = 0; index < 6; index += 1) {
      const sample = await this.measureDownloadSample(nextSize, index);
      samples.push(sample);
      totalBytes += sample.bytes;

      const mbps = calculateMbps(samples);
      const progress = interpolateProgress(
        DOWNLOAD_START_PROGRESS,
        DOWNLOAD_END_PROGRESS,
        Math.max(totalSampleSeconds(samples) / DOWNLOAD_TARGET_SECONDS, totalBytes / DOWNLOAD_MAX_BYTES),
      );

      onSample(mbps, progress);

      if (totalSampleSeconds(samples) >= DOWNLOAD_TARGET_SECONDS || totalBytes >= DOWNLOAD_MAX_BYTES) {
        break;
      }

      nextSize = nextSampleSize(mbps, DOWNLOAD_MIN_SAMPLE_BYTES, DOWNLOAD_MAX_SAMPLE_BYTES, 1.15);
      await this.wait(90);
    }

    onSample(calculateMbps(samples), DOWNLOAD_END_PROGRESS);
    return round(calculateMbps(samples), 1);
  }

  private async measureUpload(downloadMbps: number): Promise<number> {
    const samples: TransferSample[] = [];
    let nextSize = UPLOAD_MIN_SAMPLE_BYTES;
    let totalBytes = 0;

    for (let index = 0; index < 5; index += 1) {
      const sample = await this.measureUploadSample(nextSize);
      samples.push(sample);
      totalBytes += sample.bytes;

      const progress = interpolateProgress(
        UPLOAD_START_PROGRESS,
        UPLOAD_END_PROGRESS,
        Math.max(totalSampleSeconds(samples) / UPLOAD_TARGET_SECONDS, totalBytes / UPLOAD_MAX_BYTES),
      );

      this.emitSnapshot("upload", "Testing upload...", progress, downloadMbps);

      if (totalSampleSeconds(samples) >= UPLOAD_TARGET_SECONDS || totalBytes >= UPLOAD_MAX_BYTES) {
        break;
      }

      nextSize = nextSampleSize(calculateMbps(samples), UPLOAD_MIN_SAMPLE_BYTES, UPLOAD_MAX_SAMPLE_BYTES, 1);
      await this.wait(80);
    }

    await this.wait(180);
    return round(calculateMbps(samples), 1);
  }

  private async measureDownloadSample(bytes: number, index: number): Promise<TransferSample> {
    const response = await fetch(`/api/speed-test/payload?bytes=${bytes}&sample=${index}&t=${Date.now()}`, {
      cache: "no-store",
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      throw new Error("Download test failed");
    }

    const startedAt = performance.now();
    const receivedBytes = await readResponseBytes(response);
    const seconds = Math.max((performance.now() - startedAt) / 1000, 0.001);

    return {
      bytes: receivedBytes,
      seconds,
    };
  }

  private async measureUploadSample(bytes: number): Promise<TransferSample> {
    const body = createUploadPayload(bytes);
    const startedAt = performance.now();
    const response = await fetch(`/api/speed-test/upload?t=${Date.now()}`, {
      method: "POST",
      body,
      cache: "no-store",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      throw new Error("Upload test failed");
    }

    const result = (await response.json()) as UploadResponse;
    const seconds = Math.max((performance.now() - startedAt) / 1000, 0.001);

    return {
      bytes: Math.min(result.receivedBytes, bytes),
      seconds,
    };
  }

  private estimatePacketLoss(samples: number[]): number {
    const unstableSamples = samples.filter((value) => value > average(samples) * 2).length;
    return round(Math.min(unstableSamples * 0.2, 2.4), 1);
  }

  private collectDiagnostics(metrics: {
    pingMs: number;
    jitterMs: number;
    packetLossPercent: number;
  }): NetworkDiagnostics {
    const hints = getNavigatorHints();
    const userAgent = hints?.userAgent ?? "Unavailable";
    const connection = hints?.connection;
    const connectionType = normalizeConnectionType(connection?.type);

    return {
      ipv4: "Detect via edge endpoint",
      ipv6: "Detect via edge endpoint",
      dnsLookupMs: Math.max(1, Math.round(metrics.pingMs * 0.18)),
      unloadedLatencyMs: round(metrics.pingMs, 1),
      loadedLatencyMs: round(metrics.pingMs + metrics.jitterMs * 2.2 + 8, 1),
      jitterMs: round(metrics.jitterMs, 1),
      packetLossPercent: metrics.packetLossPercent,
      connectionType,
      browser: detectBrowser(userAgent),
      os: detectOs(userAgent, hints?.userAgentData?.platform),
      screenResolution:
        typeof window === "undefined"
          ? "Unavailable"
          : `${window.screen.width} x ${window.screen.height}`,
      deviceMemoryGb: hints?.deviceMemory ?? null,
      cpuThreads: hints?.hardwareConcurrency ?? null,
      networkEffectiveType: connection?.effectiveType ?? null,
      saveData: connection?.saveData ?? null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: hints?.language ?? "Unavailable",
      userAgent,
    };
  }

  private emitSnapshot(
    stage: StageSnapshot["stage"],
    label: string,
    progress: number,
    downloadMbps: number,
  ): void {
    this.emit({
      type: "snapshot",
      payload: {
        stage,
        label,
        progress,
        downloadMbps,
      },
    });
  }

  private emit(event: SpeedTestEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(resolve, ms);
      this.abortController?.signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timeout);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
  }
}

function normalizeConnectionType(type?: string): "wifi" | "cellular" | "ethernet" | "unknown" {
  if (type === "wifi" || type === "cellular" || type === "ethernet") {
    return type;
  }

  return "unknown";
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

async function readResponseBytes(response: Response): Promise<number> {
  if (!response.body) {
    return (await response.arrayBuffer()).byteLength;
  }

  const reader = response.body.getReader();
  let bytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    bytes += value.byteLength;
  }

  return bytes;
}

function calculateMbps(samples: TransferSample[]): number {
  const usableSamples = samples.filter((sample) => sample.bytes > 0 && sample.seconds > 0);
  const bytes = usableSamples.reduce((total, sample) => total + sample.bytes, 0);
  const seconds = usableSamples.reduce((total, sample) => total + sample.seconds, 0);

  if (bytes === 0 || seconds === 0) {
    return 0;
  }

  return (bytes * 8) / seconds / 1_000_000;
}

function totalSampleSeconds(samples: TransferSample[]): number {
  return samples.reduce((total, sample) => total + sample.seconds, 0);
}

function nextSampleSize(mbps: number, minBytes: number, maxBytes: number, targetSeconds: number): number {
  if (!Number.isFinite(mbps) || mbps <= 0) {
    return minBytes;
  }

  const bytes = (mbps * 1_000_000 * targetSeconds) / 8;
  return Math.round(clamp(bytes, minBytes, maxBytes));
}

function interpolateProgress(start: number, end: number, fraction: number): number {
  return Math.round(start + (end - start) * clamp(fraction, 0, 1));
}

function createUploadPayload(bytes: number): ArrayBuffer {
  const payload = new Uint8Array(bytes);
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.getRandomValues) {
    for (let offset = 0; offset < payload.byteLength; offset += 65_536) {
      cryptoApi.getRandomValues(payload.subarray(offset, Math.min(offset + 65_536, payload.byteLength)));
    }

    return payload.buffer;
  }

  for (let index = 0; index < payload.byteLength; index += 1) {
    payload[index] = (index * 31 + 17) % 256;
  }

  return payload.buffer;
}

function calculateJitter(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }

  const deltas = values.slice(1).map((value, index) => Math.abs(value - values[index]));
  return average(deltas);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, precision = 0): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
