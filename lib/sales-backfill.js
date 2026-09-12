/** Earliest allowed backfill sale time: 22 Jul 2026 00:00 local. */
export const BACKFILL_EARLIEST_LOCAL = new Date(2026, 6, 22, 0, 0, 0, 0);

/**
 * Parse a browser `datetime-local` value (YYYY-MM-DDTHH:mm) as local wall time.
 * Returns null if invalid.
 */
export function parseDatetimeLocal(value) {
  const raw = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d ||
    date.getHours() !== h ||
    date.getMinutes() !== mi
  ) {
    return null;
  }
  return date;
}

/** Format a Date for an `<input type="datetime-local" />` value. */
export function toDatetimeLocalValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Validate soldAt for admin backfill. Allows 1 minute clock skew past "now".
 * @returns {{ ok: true, soldAt: Date } | { ok: false, reason: string }}
 */
export function validateBackfillSoldAt(soldAt) {
  if (!(soldAt instanceof Date) || Number.isNaN(soldAt.getTime())) {
    return { ok: false, reason: "Choose a valid sold-at date and time." };
  }
  if (soldAt.getTime() < BACKFILL_EARLIEST_LOCAL.getTime()) {
    return {
      ok: false,
      reason: "Sold at must be on or after 22 July 2026.",
    };
  }
  const skewMs = 60_000;
  if (soldAt.getTime() > Date.now() + skewMs) {
    return { ok: false, reason: "Sold at cannot be in the future." };
  }
  return { ok: true, soldAt };
}
