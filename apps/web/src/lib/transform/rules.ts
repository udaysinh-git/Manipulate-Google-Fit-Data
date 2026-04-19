import { z } from "zod";

import type { DailySteps } from "@/lib/googleFit/client";

export const rulesInputSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  globalMinSteps: z.number().int().min(0),
  globalMaxSteps: z.number().int().min(0),
  weekdayMinSteps: z.number().int().min(0),
  weekdayMaxSteps: z.number().int().min(0),
  weekendMinSteps: z.number().int().min(0),
  weekendMaxSteps: z.number().int().min(0),
  variancePercent: z.number().min(0).max(100),
  randomSeed: z.number().int().min(1),
  monthlyPattern: z
    .array(z.number().min(0.5).max(1.5))
    .length(4)
    .optional(),
  customDailyOverrides: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.number().int().min(0)),
});

export type RulesInput = z.infer<typeof rulesInputSchema>;

export type PreviewDay = {
  date: string;
  oldSteps: number;
  newSteps: number;
  delta: number;
};

export type PreviewResult = {
  days: PreviewDay[];
  summary: {
    totalOldSteps: number;
    totalNewSteps: number;
    totalDelta: number;
    avgWeekdaySteps: number;
    avgWeekendSteps: number;
    maxIncrease: number;
    maxDecrease: number;
  };
};

function seededRandom(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function isWeekend(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

function weekOfMonth(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDate();
  return Math.min(3, Math.floor((day - 1) / 7));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Pick a random band that respects both the weekday/weekend profile and global min/max.
 * If the profile sits entirely below globalMin (e.g. weekend 3k–4k with global 5k–12k),
 * intersecting would be empty and the old code clamped every weekend day to globalMin → many identical 5000s.
 * Here we map "weekend intent" onto the lower part of the global range so values still vary.
 */
function effectiveStepBand(
  profileMin: number,
  profileMax: number,
  gMin: number,
  gMax: number,
  weekend: boolean,
): { lo: number; hi: number } {
  const lo = Math.max(profileMin, gMin);
  const hi = Math.min(profileMax, gMax);
  if (lo <= hi) {
    return { lo, hi };
  }

  const gSpan = gMax - gMin;
  if (gSpan <= 0) {
    return { lo: gMin, hi: gMin };
  }

  if (weekend) {
    const slice = Math.max(1, Math.round(gSpan * 0.45));
    return { lo: gMin, hi: gMin + slice };
  }

  return { lo: gMin, hi: gMax };
}

export function buildPreview(existingDailySteps: DailySteps[], rules: RulesInput): PreviewResult {
  if (rules.globalMinSteps > rules.globalMaxSteps) {
    throw new Error("Global min steps cannot be greater than global max steps.");
  }

  const random = seededRandom(rules.randomSeed);
  const days: PreviewDay[] = existingDailySteps.map((entry) => {
    const weekend = isWeekend(entry.date);
    const [profileMin, profileMax] = weekend
      ? [rules.weekendMinSteps, rules.weekendMaxSteps]
      : [rules.weekdayMinSteps, rules.weekdayMaxSteps];

    const { lo: bandLo, hi: bandHi } = effectiveStepBand(
      profileMin,
      profileMax,
      rules.globalMinSteps,
      rules.globalMaxSteps,
      weekend,
    );

    // Uniform pick in band, then additive jitter inside the same band.
    const span = Math.max(0, bandHi - bandLo);
    const position = random();
    const base = Math.round(bandLo + position * span);
    const maxShift = span > 0 ? (span / 2) * (rules.variancePercent / 100) : 0;
    const shift = (random() * 2 - 1) * maxShift;
    const varied = Math.round(clamp(base + shift, bandLo, bandHi));

    const patternMultiplier = rules.monthlyPattern?.[weekOfMonth(entry.date)] ?? 1;
    const withPattern = Math.round(varied * patternMultiplier);
    const overridden = rules.customDailyOverrides[entry.date] ?? withPattern;
    const newSteps = clamp(overridden, rules.globalMinSteps, rules.globalMaxSteps);

    return {
      date: entry.date,
      oldSteps: entry.steps,
      newSteps,
      delta: newSteps - entry.steps,
    };
  });

  const weekdaySteps = days.filter((d) => !isWeekend(d.date)).map((d) => d.newSteps);
  const weekendSteps = days.filter((d) => isWeekend(d.date)).map((d) => d.newSteps);
  const totalOldSteps = days.reduce((acc, d) => acc + d.oldSteps, 0);
  const totalNewSteps = days.reduce((acc, d) => acc + d.newSteps, 0);
  const deltas = days.map((d) => d.delta);

  return {
    days,
    summary: {
      totalOldSteps,
      totalNewSteps,
      totalDelta: totalNewSteps - totalOldSteps,
      avgWeekdaySteps: weekdaySteps.length
        ? Math.round(weekdaySteps.reduce((a, b) => a + b, 0) / weekdaySteps.length)
        : 0,
      avgWeekendSteps: weekendSteps.length
        ? Math.round(weekendSteps.reduce((a, b) => a + b, 0) / weekendSteps.length)
        : 0,
      maxIncrease: deltas.length ? Math.max(...deltas) : 0,
      maxDecrease: deltas.length ? Math.min(...deltas) : 0,
    },
  };
}
