export function formatMbps(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (value >= 100) {
    return Math.round(value).toString();
  }

  if (value >= 10) {
    return value.toFixed(1);
  }

  return value.toFixed(2);
}

export function formatMs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "Unavailable";
  }

  return `${Math.round(value)} ms`;
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "Unavailable";
  }

  return `${value.toFixed(value < 1 ? 1 : 0)}%`;
}

export function formatNullable(value: string | number | boolean | null): string {
  if (value === null || value === undefined || value === "") {
    return "Unavailable";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}
