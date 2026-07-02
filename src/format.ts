export function formatDuration(seconds?: number): string | undefined {
  if (seconds === undefined || Number.isNaN(seconds)) return undefined;
  const totalSeconds = Math.round(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}h${String(m).padStart(2, "0")}m`;
  }
  return `${m}m${String(s).padStart(2, "0")}s`;
}

export function formatDistanceKm(meters?: number): number | undefined {
  if (meters === undefined) return undefined;
  return round(meters / 1000, 2);
}

export function formatPacePerKm(movingTimeSec?: number, distanceM?: number): string | undefined {
  if (!movingTimeSec || !distanceM) return undefined;
  const km = distanceM / 1000;
  if (km <= 0) return undefined;
  const secPerKm = movingTimeSec / km;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

export function round(value: number | undefined, decimals = 1): number | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
