import { HardwareDiagnostics } from "@/types/speedtest";
import { getNavigatorHints, hasStorage } from "@/utils/browser";

export async function getHardwareDiagnostics(): Promise<HardwareDiagnostics> {
  const hints = getNavigatorHints();
  const gpuRenderer = detectGpuRenderer();
  const refreshRateHz = await estimateRefreshRate();
  const battery = await getBatterySummary();
  const mediaAvailability = detectMediaAvailability();

  return {
    cpuThreads: hints?.hardwareConcurrency ?? null,
    ramGb: hints?.deviceMemory ?? null,
    gpuRenderer,
    refreshRateHz,
    battery,
    touchSupport:
      typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0),
    cameraAvailability: mediaAvailability.camera,
    microphoneAvailability: mediaAvailability.microphone,
    bluetoothAvailability: hints?.bluetooth ? "Supported" : "Unavailable",
    webGpuSupport: Boolean(hints?.gpu),
    webGlSupport: gpuRenderer !== null,
    localStorage: hasStorage("localStorage"),
    indexedDb: hasStorage("indexedDB"),
    cookiesEnabled: hints?.cookieEnabled ?? false,
    hardwareAcceleration: gpuRenderer ? "Likely enabled" : "Unavailable",
  };
}

function detectGpuRenderer(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  const gl =
    canvas.getContext("webgl") ??
    canvas.getContext("experimental-webgl");

  if (!gl || !("getParameter" in gl)) {
    return null;
  }

  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  if (!debugInfo) {
    return "WebGL renderer hidden";
  }

  return String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
}

function estimateRefreshRate(): Promise<number | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const samples: number[] = [];
    let previous = performance.now();

    const tick = (time: number) => {
      samples.push(time - previous);
      previous = time;

      if (samples.length < 12) {
        window.requestAnimationFrame(tick);
        return;
      }

      const averageFrameMs =
        samples.slice(2).reduce((total, value) => total + value, 0) /
        Math.max(samples.length - 2, 1);
      resolve(Math.round(1000 / averageFrameMs));
    };

    window.requestAnimationFrame(tick);
  });
}

async function getBatterySummary(): Promise<string | null> {
  const hints = getNavigatorHints();

  if (!hints?.getBattery) {
    return null;
  }

  try {
    const battery = await hints.getBattery();
    return `${Math.round(battery.level * 100)}%, ${battery.charging ? "charging" : "not charging"}`;
  } catch {
    return null;
  }
}

function detectMediaAvailability(): {
  camera: string;
  microphone: string;
} {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return {
      camera: "Unavailable",
      microphone: "Unavailable",
    };
  }

  return {
    camera: "Browser API available",
    microphone: "Browser API available",
  };
}
