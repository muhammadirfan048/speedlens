export type TestStage =
  | "idle"
  | "connecting"
  | "server"
  | "latency"
  | "download"
  | "upload"
  | "jitter"
  | "packetLoss"
  | "complete"
  | "error";

export type ConnectionType = "wifi" | "cellular" | "ethernet" | "unknown";

export type StageSnapshot = {
  stage: TestStage;
  label: string;
  progress: number;
  downloadMbps: number;
};

export type SpeedTestResults = {
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
  packetLossPercent: number;
  server: ServerInfo;
  diagnostics: NetworkDiagnostics;
  completedAt: string;
};

export type ServerInfo = {
  name: string;
  location: string;
  region: string;
};

export type NetworkDiagnostics = {
  ipv4: string | null;
  ipv6: string | null;
  dnsLookupMs: number | null;
  unloadedLatencyMs: number | null;
  loadedLatencyMs: number | null;
  jitterMs: number | null;
  packetLossPercent: number | null;
  connectionType: ConnectionType;
  browser: string;
  os: string;
  screenResolution: string;
  deviceMemoryGb: number | null;
  cpuThreads: number | null;
  networkEffectiveType: string | null;
  saveData: boolean | null;
  timezone: string;
  language: string;
  userAgent: string;
};

export type HardwareDiagnostics = {
  cpuThreads: number | null;
  ramGb: number | null;
  gpuRenderer: string | null;
  refreshRateHz: number | null;
  battery: string | null;
  touchSupport: boolean;
  cameraAvailability: string;
  microphoneAvailability: string;
  bluetoothAvailability: string;
  webGpuSupport: boolean;
  webGlSupport: boolean;
  localStorage: boolean;
  indexedDb: boolean;
  cookiesEnabled: boolean;
  hardwareAcceleration: string;
};

export type SpeedTestEvent =
  | { type: "snapshot"; payload: StageSnapshot }
  | { type: "complete"; payload: SpeedTestResults }
  | { type: "error"; payload: Error };
