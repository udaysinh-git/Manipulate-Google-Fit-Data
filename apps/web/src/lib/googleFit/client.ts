import type { fitness_v1 } from "googleapis";
import { google } from "googleapis";

import { buildOAuthClient } from "@/lib/googleFit/oauth";

/** Stable id so we reuse one raw stream per account (list + match). */
const WEB_STEP_DATA_STREAM_NAME = "manipulate_google_fit_web_editor_v1";

export type DailySteps = {
  date: string;
  steps: number;
};

function toEpochMillis(dateString: string, endOfDay = false) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) {
    throw new Error(`Invalid date: ${dateString}`);
  }
  if (endOfDay) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date.valueOf();
}

export async function getFitnessApi(refreshToken: string) {
  const oauth = buildOAuthClient();
  oauth.setCredentials({ refresh_token: refreshToken });
  await oauth.getAccessToken();
  return google.fitness({ version: "v1", auth: oauth });
}

/**
 * Google's derived `estimated_steps` stream cannot be written by third-party apps.
 * We register a raw `com.google.step_count.delta` source and write daily points there.
 */
async function getOrCreateWebStepDataSourceId(
  fitness: fitness_v1.Fitness,
): Promise<string> {
  const listResponse = await fitness.users.dataSources.list({
    userId: "me",
    dataTypeName: ["com.google.step_count.delta"],
  });

  const sources = listResponse.data.dataSource ?? [];
  const existing = sources.find((s) => s.dataStreamName === WEB_STEP_DATA_STREAM_NAME);
  if (existing?.dataStreamId) {
    return existing.dataStreamId;
  }

  try {
    const created = await fitness.users.dataSources.create({
      userId: "me",
      requestBody: {
        type: "raw",
        dataStreamName: WEB_STEP_DATA_STREAM_NAME,
        dataType: {
          name: "com.google.step_count.delta",
          field: [{ name: "steps", format: "integer" }],
        },
        application: {
          name: "Google Fit Data Editor",
          version: "1",
        },
        device: {
          type: "unknown",
          manufacturer: "Web",
          model: "Editor",
          uid: "fit-data-editor",
          version: "1",
        },
      },
    });

    const id = created.data.dataStreamId;
    if (!id) {
      throw new Error("Fitness API did not return dataStreamId after creating data source.");
    }
    return id;
  } catch {
    const retry = await fitness.users.dataSources.list({
      userId: "me",
      dataTypeName: ["com.google.step_count.delta"],
    });
    const again = (retry.data.dataSource ?? []).find(
      (s) => s.dataStreamName === WEB_STEP_DATA_STREAM_NAME,
    );
    if (again?.dataStreamId) {
      return again.dataStreamId;
    }
    throw new Error(
      "Could not create or find a writable step data source. Ensure Fitness API is enabled and scopes include activity read/write.",
    );
  }
}

/** Google Fit rejects very long aggregate windows ("aggregate duration too large"). */
const AGGREGATE_CHUNK_DAYS = 30;

function addUtcDays(dateString: string, deltaDays: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function compareIsoDate(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

async function readDailyStepsForRange(
  refreshToken: string,
  startDate: string,
  endDate: string,
): Promise<DailySteps[]> {
  const fitness = await getFitnessApi(refreshToken);
  const aggregateResponse = await fitness.users.dataset.aggregate({
    userId: "me",
    requestBody: {
      startTimeMillis: toEpochMillis(startDate).toString(),
      endTimeMillis: toEpochMillis(endDate, true).toString(),
      bucketByTime: {
        durationMillis: (24 * 60 * 60 * 1000).toString(),
      },
      aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
    },
  });

  const buckets = aggregateResponse.data.bucket ?? [];
  return buckets.map((bucket) => {
    const date = new Date(Number(bucket.startTimeMillis)).toISOString().slice(0, 10);
    const point = bucket.dataset?.[0]?.point ?? [];
    const steps = point.reduce((acc, p) => acc + Number(p.value?.[0]?.intVal ?? 0), 0);
    return { date, steps };
  });
}

export async function readDailySteps(
  refreshToken: string,
  startDate: string,
  endDate: string,
): Promise<DailySteps[]> {
  if (compareIsoDate(startDate, endDate) > 0) {
    return [];
  }

  const byDate = new Map<string, number>();
  let cursor = startDate;

  while (compareIsoDate(cursor, endDate) <= 0) {
    const chunkEnd = addUtcDays(cursor, AGGREGATE_CHUNK_DAYS - 1);
    const thisEnd = compareIsoDate(chunkEnd, endDate) > 0 ? endDate : chunkEnd;
    const chunk = await readDailyStepsForRange(refreshToken, cursor, thisEnd);
    for (const row of chunk) {
      byDate.set(row.date, row.steps);
    }
    cursor = addUtcDays(thisEnd, 1);
  }

  const result: DailySteps[] = [];
  let d = startDate;
  while (compareIsoDate(d, endDate) <= 0) {
    result.push({ date: d, steps: byDate.get(d) ?? 0 });
    d = addUtcDays(d, 1);
  }
  return result;
}

export async function writeDailySteps(refreshToken: string, stepsByDay: DailySteps[]) {
  const fitness = await getFitnessApi(refreshToken);
  const dataSourceId = await getOrCreateWebStepDataSourceId(fitness);

  for (const day of stepsByDay) {
    const startMillis = toEpochMillis(day.date);
    const endMillis = toEpochMillis(day.date, true);
    const datasetId = `${startMillis * 1_000_000}-${endMillis * 1_000_000}`;

    await fitness.users.dataSources.datasets.patch({
      userId: "me",
      dataSourceId,
      datasetId,
      requestBody: {
        minStartTimeNs: `${startMillis * 1_000_000}`,
        maxEndTimeNs: `${endMillis * 1_000_000}`,
        dataSourceId,
        point: [
          {
            dataTypeName: "com.google.step_count.delta",
            startTimeNanos: `${startMillis * 1_000_000}`,
            endTimeNanos: `${endMillis * 1_000_000}`,
            value: [{ intVal: Math.max(0, Math.floor(day.steps)) }],
          },
        ],
      },
    });
  }
}
