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

type SpeedTestProvider = {
  kind: "fast" | "cloudflare" | "local";
  name: string;
  downloadUrl: string;
  uploadUrl: string;
  metadataUrl: string | null;
  targetDiscoveryUrl: string | null;
};

type SpeedTestProviderMetadata = {
  clientIp?: string;
  ip?: string;
  colo?: string;
  coloCity?: string;
  coloRegion?: string;
  city?: string;
  region?: string;
  country?: string;
  asOrganization?: string;
};

type TransferSample = {
  bytes: number;
  seconds: number;
};

type FastTarget = {
  name?: string;
  url: string;
  location?: {
    city?: string;
    country?: string;
  };
};

type FastTargetsResponse = {
  client?: {
    ip?: string;
    asn?: string;
    location?: {
      city?: string;
      country?: string;
    };
  };
  targets?: FastTarget[];
};

const FAST_TARGETS_URL = "/api/speed-test/fast-targets";
const DEFAULT_REMOTE_DOWNLOAD_URL = "https://speed.cloudflare.com/__down";
const DEFAULT_REMOTE_UPLOAD_URL = "https://speed.cloudflare.com/__up";
const DEFAULT_REMOTE_METADATA_URL = "https://speed.cloudflare.com/meta";

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

const DISCOVERY_REQUEST_TIMEOUT_MS = 8_000;
const LATENCY_REQUEST_TIMEOUT_MS = 6_000;
const TRANSFER_REQUEST_TIMEOUT_MS = 24_000;

export class SpeedTestService {
  private listeners = new Set<Listener>();
  private abortController: AbortController | null = null;
  private latestResults: SpeedTestResults | null = null;
  private measurementId = createMeasurementId();
  private providerMetadata: SpeedTestProviderMetadata | null = null;
  private provider = getSpeedTestProvider();
  private fastTargets: FastTarget[] = [];
  private stopped = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    this.stop();
    this.abortController = new AbortController();
    this.measurementId = createMeasurementId();
    this.providerMetadata = null;
    this.fastTargets = [];
    this.provider = getSpeedTestProvider();
    this.stopped = false;

    try {
      const results = await this.runTest();
      this.complete(results);
    } catch (error) {
      if (this.stopped) {
        return;
      }

      if (this.canUseCloudflareFallback()) {
        try {
          this.switchToCloudflareFallback();
          const results = await this.runTest("Connecting to backup server...");
          this.complete(results);
          return;
        } catch (fallbackError) {
          if (this.stopped) {
            return;
          }

          this.fail(fallbackError);
          return;
        }
      }

      this.fail(error);
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

  private async runTest(connectingLabel = "Connecting..."): Promise<SpeedTestResults> {
    this.emitSnapshot("connecting", connectingLabel, 4, 0);
    await this.wait(280);

    let serverInfo = await this.findServer();

    this.emitSnapshot("latency", "Analyzing latency...", 20, 0);
    const latencySamples = await this.measureLatency(5);
    const pingMs = average(latencySamples);
    const jitterMs = calculateJitter(latencySamples);
    serverInfo = this.getCurrentServerInfo(serverInfo);

    this.emitSnapshot("download", "Testing download...", DOWNLOAD_START_PROGRESS, 0);
    const downloadMbps = await this.measureDownload((value, progress) => {
      this.emitSnapshot("download", "Testing download...", progress, value);
    });

    this.emitSnapshot("upload", "Testing upload...", UPLOAD_START_PROGRESS, downloadMbps);
    const uploadMbps = await this.measureUpload(downloadMbps);
    serverInfo = this.getCurrentServerInfo(serverInfo);

    this.emitSnapshot("jitter", "Measuring jitter...", 84, downloadMbps);
    await this.wait(320);

    this.emitSnapshot("packetLoss", "Finalizing diagnostics...", 92, downloadMbps);
    const packetLossPercent = null;
    await this.wait(260);

    const diagnostics = this.collectDiagnostics({
      pingMs,
      jitterMs,
      packetLossPercent,
    });

    return {
      downloadMbps,
      uploadMbps,
      pingMs,
      jitterMs,
      packetLossPercent,
      server: serverInfo,
      diagnostics,
      completedAt: new Date().toISOString(),
    };
  }

  private canUseCloudflareFallback(): boolean {
    return this.provider.kind === "fast";
  }

  private switchToCloudflareFallback(): void {
    this.emitSnapshot("server", "Switching to backup server...", 12, 0);
    this.provider = getCloudflareProvider();
    this.measurementId = createMeasurementId();
    this.providerMetadata = null;
    this.fastTargets = [];
  }

  private complete(results: SpeedTestResults): void {
    this.latestResults = results;
    this.emitSnapshot("complete", "Completed", 100, results.downloadMbps);
    this.emit({ type: "complete", payload: results });
  }

  private fail(error: unknown): void {
    this.emitSnapshot("error", "Unable to complete test", 0, 0);
    this.emit({
      type: "error",
      payload: error instanceof Error ? error : new Error("Speed test failed"),
    });
  }

  private async findServer(): Promise<ServerInfo> {
    this.emitSnapshot("server", "Finding nearest server...", 12, 0);

    if (this.provider.kind === "fast") {
      const targets = await this.fetchFastTargets();
      await this.wait(120);
      return fastTargetsToServerInfo(this.provider, targets);
    }

    if (this.provider.kind === "cloudflare") {
      const metadata = await this.fetchProviderMetadata();
      await this.wait(120);
      return metadataToServerInfo(this.provider, metadata);
    }

    const start = performance.now();
    const body = await this.withRequestSignal(DISCOVERY_REQUEST_TIMEOUT_MS, async (signal) => {
      const response = await fetch(`/api/speed-test/ping?t=${Date.now()}`, {
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        throw new Error("Server discovery failed");
      }

      return (await response.json()) as PingResponse;
    });
    const elapsed = performance.now() - start;
    await this.wait(Math.max(120, 260 - elapsed));
    return body.server;
  }

  private async fetchFastTargets(): Promise<FastTarget[]> {
    const targetDiscoveryUrl = this.provider.targetDiscoveryUrl;

    if (!targetDiscoveryUrl) {
      throw new Error("Fast.com target discovery is not configured");
    }

    const body = await this.withRequestSignal(DISCOVERY_REQUEST_TIMEOUT_MS, async (signal) => {
      const response = await fetch(withQuery(targetDiscoveryUrl, { t: Date.now() }), {
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        throw new Error("Fast.com target discovery failed");
      }

      return (await response.json()) as FastTargetsResponse;
    });
    const targets = Array.isArray(body.targets)
      ? body.targets.filter((target) => typeof target.url === "string" && target.url.startsWith("https://"))
      : [];

    if (targets.length === 0) {
      throw new Error("Fast.com did not return usable targets");
    }

    this.fastTargets = targets;
    this.providerMetadata = normalizeProviderMetadata({
      clientIp: body.client?.ip,
      ip: body.client?.ip,
      city: body.client?.location?.city,
      country: body.client?.location?.country,
      asOrganization: body.client?.asn ? `ASN ${body.client.asn}` : undefined,
    });

    return targets;
  }

  private async fetchProviderMetadata(): Promise<SpeedTestProviderMetadata | null> {
    const metadataUrl = this.provider.metadataUrl;

    if (!metadataUrl) {
      return null;
    }

    try {
      const response = await this.withRequestSignal(DISCOVERY_REQUEST_TIMEOUT_MS, (signal) =>
        fetch(withQuery(metadataUrl, { t: Date.now() }), {
          cache: "no-store",
          signal,
        }),
      );

      if (!response.ok) {
        return null;
      }

      const metadata = normalizeProviderMetadata(await response.json());
      this.providerMetadata = metadata;
      return metadata;
    } catch (error) {
      if (this.stopped) {
        throw error;
      }

      return null;
    }
  }

  private async measureLatency(samples: number): Promise<number[]> {
    const values: number[] = [];

    for (let index = 0; index < samples; index += 1) {
      const elapsedMs = await this.withRequestSignal(LATENCY_REQUEST_TIMEOUT_MS, async (signal) => {
        const startedAt = performance.now();
        const response = await fetch(this.createLatencyUrl(index), {
          cache: "no-store",
          headers: this.createDownloadHeaders(1),
          signal,
        });

        if (!response.ok) {
          throw new Error("Latency test failed");
        }

        this.captureProviderMetadata(response.headers);
        await readResponseBytes(response);
        return performance.now() - startedAt;
      });

      values.push(elapsedMs);
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
    return this.withRequestSignal(TRANSFER_REQUEST_TIMEOUT_MS, async (signal) => {
      const startedAt = performance.now();
      const response = await fetch(this.createDownloadUrl(bytes, index), {
        cache: "no-store",
        headers: this.createDownloadHeaders(bytes),
        signal,
      });

      if (!response.ok) {
        throw new Error("Download test failed");
      }

      this.captureProviderMetadata(response.headers);
      const receivedBytes = await readResponseBytes(response);
      const seconds = Math.max((performance.now() - startedAt) / 1000, 0.001);

      return {
        bytes: receivedBytes,
        seconds,
      };
    });
  }

  private async measureUploadSample(bytes: number): Promise<TransferSample> {
    return this.withRequestSignal(TRANSFER_REQUEST_TIMEOUT_MS, async (signal) => {
      const body = createUploadPayload(bytes);
      const startedAt = performance.now();
      const response = await fetch(this.createUploadUrl(bytes), {
        method: "POST",
        body,
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        throw new Error("Upload test failed");
      }

      this.captureProviderMetadata(response.headers);
      const confirmedBytes = this.provider.kind === "local"
        ? Math.min(((await response.json()) as UploadResponse).receivedBytes, bytes)
        : bytes;

      if (this.provider.kind !== "local") {
        await readResponseBytes(response);
      }

      const seconds = Math.max((performance.now() - startedAt) / 1000, 0.001);

      return {
        bytes: confirmedBytes,
        seconds,
      };
    });
  }

  private collectDiagnostics(metrics: {
    pingMs: number;
    jitterMs: number;
    packetLossPercent: number | null;
  }): NetworkDiagnostics {
    const hints = getNavigatorHints();
    const userAgent = hints?.userAgent ?? "Unavailable";
    const connection = hints?.connection;
    const connectionType = normalizeConnectionType(connection?.type);
    const clientIp = this.providerMetadata?.clientIp ?? this.providerMetadata?.ip ?? null;

    return {
      ipv4: clientIp && isIpv4(clientIp) ? clientIp : null,
      ipv6: clientIp && isIpv6(clientIp) ? clientIp : null,
      dnsLookupMs: null,
      unloadedLatencyMs: round(metrics.pingMs, 1),
      loadedLatencyMs: null,
      jitterMs: round(metrics.jitterMs, 1),
      packetLossPercent: metrics.packetLossPercent,
      connectionType,
      clientLocation: joinParts([this.providerMetadata?.city, this.providerMetadata?.region, this.providerMetadata?.country]),
      networkProvider: this.providerMetadata?.asOrganization ?? null,
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

  private captureProviderMetadata(headers: Headers): void {
    if (this.provider.kind !== "cloudflare") {
      return;
    }

    const metadata = metadataFromHeaders(headers);

    if (!metadata) {
      return;
    }

    this.providerMetadata = {
      ...this.providerMetadata,
      ...metadata,
    };
  }

  private getCurrentServerInfo(fallback: ServerInfo): ServerInfo {
    if (this.provider.kind !== "cloudflare" || !this.providerMetadata) {
      return fallback;
    }

    return metadataToServerInfo(this.provider, this.providerMetadata);
  }

  private createLatencyUrl(sample: number): string {
    if (this.provider.kind === "local") {
      return withQuery("/api/speed-test/ping", {
        sample,
        t: Date.now(),
      });
    }

    return this.createDownloadUrl(1, sample);
  }

  private createDownloadUrl(bytes: number, sample: number): string {
    if (this.provider.kind === "local") {
      return withQuery("/api/speed-test/payload", {
        bytes,
        sample,
        t: Date.now(),
      });
    }

    if (this.provider.kind === "fast") {
      return this.getFastTarget(sample).url;
    }

    return withQuery(this.provider.downloadUrl, {
      bytes,
      measId: this.measurementId,
      sample,
      t: Date.now(),
    });
  }

  private createUploadUrl(bytes: number): string {
    if (this.provider.kind === "local") {
      return withQuery("/api/speed-test/upload", {
        t: Date.now(),
      });
    }

    if (this.provider.kind === "fast") {
      return this.getFastTarget(0).url;
    }

    return withQuery(this.provider.uploadUrl, {
      bytes,
      measId: this.measurementId,
      t: Date.now(),
    });
  }

  private createDownloadHeaders(bytes: number): HeadersInit | undefined {
    if (this.provider.kind !== "fast") {
      return undefined;
    }

    return {
      Range: `bytes=0-${Math.max(bytes - 1, 0)}`,
    };
  }

  private getFastTarget(index: number): FastTarget {
    const target = this.fastTargets[index % this.fastTargets.length];

    if (!target) {
      throw new Error("Fast.com target is unavailable");
    }

    return target;
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

  private async withRequestSignal<T>(
    timeoutMs: number,
    request: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const requestController = new AbortController();
    const timeout = window.setTimeout(() => {
      requestController.abort(new DOMException("Speed test request timed out", "TimeoutError"));
    }, timeoutMs);
    const parentSignal = this.abortController?.signal;
    const abortFromParent = () => requestController.abort(parentSignal?.reason);

    if (parentSignal?.aborted) {
      requestController.abort(parentSignal.reason);
    } else {
      parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    }

    try {
      return await request(requestController.signal);
    } finally {
      window.clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
    }
  }
}

function normalizeConnectionType(type?: string): "wifi" | "cellular" | "ethernet" | "unknown" {
  if (type === "wifi" || type === "cellular" || type === "ethernet") {
    return type;
  }

  return "unknown";
}

function getSpeedTestProvider(): SpeedTestProvider {
  const providerMode = cleanEnv(process.env.NEXT_PUBLIC_SPEED_TEST_PROVIDER)?.toLowerCase();

  if (providerMode === "local") {
    return {
      kind: "local",
      name: "SpeedLens Local",
      downloadUrl: "/api/speed-test/payload",
      uploadUrl: "/api/speed-test/upload",
      metadataUrl: null,
      targetDiscoveryUrl: null,
    };
  }

  if (providerMode === "cloudflare") {
    return getCloudflareProvider({ useConfiguredName: true });
  }

  return {
    kind: "fast",
    name: cleanEnv(process.env.NEXT_PUBLIC_SPEED_TEST_PROVIDER_NAME) ?? "Fast.com / Netflix",
    downloadUrl: "",
    uploadUrl: "",
    metadataUrl: null,
    targetDiscoveryUrl: cleanEnv(process.env.NEXT_PUBLIC_FAST_TARGETS_URL) ?? FAST_TARGETS_URL,
  };
}

function getCloudflareProvider(options: { useConfiguredName?: boolean } = {}): SpeedTestProvider {
  return {
    kind: "cloudflare",
    name:
      (options.useConfiguredName ? cleanEnv(process.env.NEXT_PUBLIC_SPEED_TEST_PROVIDER_NAME) : undefined) ??
      "Cloudflare Speed Test",
    downloadUrl: cleanEnv(process.env.NEXT_PUBLIC_SPEED_TEST_DOWNLOAD_URL) ?? DEFAULT_REMOTE_DOWNLOAD_URL,
    uploadUrl: cleanEnv(process.env.NEXT_PUBLIC_SPEED_TEST_UPLOAD_URL) ?? DEFAULT_REMOTE_UPLOAD_URL,
    metadataUrl: cleanEnv(process.env.NEXT_PUBLIC_SPEED_TEST_METADATA_URL) ?? DEFAULT_REMOTE_METADATA_URL,
    targetDiscoveryUrl: null,
  };
}

function cleanEnv(value: string | undefined): string | undefined {
  return value && value.trim() !== "" ? value : undefined;
}

function metadataToServerInfo(
  provider: SpeedTestProvider,
  metadata: SpeedTestProviderMetadata | null,
): ServerInfo {
  if (!metadata) {
    return {
      name: provider.name,
      location: "Nearest remote edge",
      region: "Auto",
    };
  }

  const location = joinParts([metadata.city, metadata.region, metadata.country]) ?? "Nearest remote edge";
  const region = joinParts([metadata.colo, metadata.coloCity, metadata.coloRegion]) ?? "Auto";

  return {
    name: provider.name,
    location,
    region,
  };
}

function fastTargetsToServerInfo(provider: SpeedTestProvider, targets: FastTarget[]): ServerInfo {
  const locations = targets
    .map((target) => joinParts([target.location?.city, target.location?.country]))
    .filter((location): location is string => location !== null);
  const uniqueLocations = Array.from(new Set(locations));

  return {
    name: provider.name,
    location: uniqueLocations.slice(0, 3).join(" | ") || "Netflix Open Connect",
    region: "Fast.com",
  };
}

function metadataFromHeaders(headers: Headers): SpeedTestProviderMetadata | null {
  return normalizeProviderMetadata({
    clientIp: readHeader(headers, "cf-meta-ip", "client-ip", "ip"),
    colo: readHeader(headers, "cf-meta-colo", "colo"),
    city: readHeader(headers, "cf-meta-city", "city"),
    region: readHeader(headers, "cf-meta-region", "region"),
    country: readHeader(headers, "cf-meta-country", "country"),
    asOrganization: readHeader(headers, "cf-meta-as-organization", "as-organization"),
  });
}

function readHeader(headers: Headers, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = headers.get(name);

    if (value && value.trim() !== "") {
      return value;
    }
  }

  return undefined;
}

function normalizeProviderMetadata(raw: unknown): SpeedTestProviderMetadata | null {
  const record = asRecord(raw);

  if (!record) {
    return null;
  }

  const colo = readRecordValue(record, "colo");
  const coloRecord = asRecord(colo);
  const metadata: SpeedTestProviderMetadata = {
    clientIp: readRecordString(record, "clientIp") ?? readRecordString(record, "ip"),
    ip: readRecordString(record, "ip"),
    colo: typeof colo === "string" ? cleanEnv(colo) : readRecordString(coloRecord, "iata"),
    coloCity: readRecordString(coloRecord, "city"),
    coloRegion: readRecordString(coloRecord, "region"),
    city: readRecordString(record, "city"),
    region: readRecordString(record, "region"),
    country: readRecordString(record, "country"),
    asOrganization: readRecordString(record, "asOrganization"),
  };

  return Object.values(metadata).some(Boolean) ? metadata : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readRecordValue(record: Record<string, unknown> | null, key: string): unknown {
  return record ? record[key] : undefined;
}

function readRecordString(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = readRecordValue(record, key);

  if (typeof value === "string") {
    return cleanEnv(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function withQuery(input: string, params: Record<string, string | number>): string {
  const baseUrl = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const url = new URL(input, baseUrl);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

function createMeasurementId(): number {
  return Date.now() + Math.floor(Math.random() * 1_000_000);
}

function joinParts(parts: Array<string | undefined>): string | null {
  const value = parts.filter((part): part is string => Boolean(cleanEnv(part))).join(", ");
  return value === "" ? null : value;
}

function isIpv4(value: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

function isIpv6(value: string): boolean {
  return value.includes(":");
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
