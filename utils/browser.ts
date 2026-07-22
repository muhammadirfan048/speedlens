type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
    type?: string;
  };
  userAgentData?: {
    platform?: string;
  };
  getBattery?: () => Promise<{
    charging: boolean;
    level: number;
  }>;
  bluetooth?: unknown;
  gpu?: unknown;
};

export function getNavigatorHints(): NavigatorWithHints | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  return navigator as NavigatorWithHints;
}

export function detectBrowser(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return "Microsoft Edge";
  if (/Chrome\//.test(userAgent) && !/Chromium\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return "Safari";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  return "Unknown";
}

export function detectOs(userAgent: string, platform?: string): string {
  const source = `${platform ?? ""} ${userAgent}`;

  if (/Windows/i.test(source)) return "Windows";
  if (/Mac OS|Macintosh|macOS/i.test(source)) return "macOS";
  if (/Android/i.test(source)) return "Android";
  if (/iPhone|iPad|iOS/i.test(source)) return "iOS";
  if (/Linux/i.test(source)) return "Linux";
  return "Unknown";
}

export function hasStorage(type: "localStorage" | "indexedDB"): boolean {
  try {
    if (type === "localStorage") {
      const key = "__speedlens_test__";
      window.localStorage.setItem(key, key);
      window.localStorage.removeItem(key);
      return true;
    }

    return "indexedDB" in window;
  } catch {
    return false;
  }
}
