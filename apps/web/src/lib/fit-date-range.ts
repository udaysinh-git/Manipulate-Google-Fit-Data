/** Inclusive calendar-day count from startDate through endDate (UTC dates). */
export function inclusiveDaySpan(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00.000Z`).valueOf();
  const end = new Date(`${endDate}T00:00:00.000Z`).valueOf();
  return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
}

const DEFAULT_MAX_DAYS = 1095;
const ABSOLUTE_CAP_DAYS = 3650;

/** Max inclusive days for preview/apply; override with FIT_MAX_RANGE_DAYS (1–3650). */
export function getMaxFitRangeDays(): number {
  const raw = process.env.FIT_MAX_RANGE_DAYS?.trim();
  if (!raw) {
    return DEFAULT_MAX_DAYS;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    return DEFAULT_MAX_DAYS;
  }
  return Math.min(n, ABSOLUTE_CAP_DAYS);
}

/** Returns an error message or null if the range is valid. */
export function validateFitDateRange(startDate: string, endDate: string): string | null {
  const days = inclusiveDaySpan(startDate, endDate);
  if (days <= 0) {
    return "End date must be on or after start date.";
  }
  const max = getMaxFitRangeDays();
  if (days > max) {
    return `Date range must be between 1 and ${max} days. Set FIT_MAX_RANGE_DAYS in .env.local to raise the cap (max ${ABSOLUTE_CAP_DAYS}).`;
  }
  return null;
}
