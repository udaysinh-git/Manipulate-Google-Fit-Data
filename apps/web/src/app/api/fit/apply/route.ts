import { NextResponse } from "next/server";

import { validateFitDateRange } from "@/lib/fit-date-range";
import { prisma } from "@/lib/db";
import { requireCurrentAccount } from "@/lib/current-account";
import { readDailySteps, writeDailySteps } from "@/lib/googleFit/client";
import { buildPreview, rulesInputSchema } from "@/lib/transform/rules";

export async function POST(req: Request) {
  try {
    const input = rulesInputSchema.parse(await req.json());
    const rangeError = validateFitDateRange(input.startDate, input.endDate);
    if (rangeError) {
      return NextResponse.json({ error: rangeError }, { status: 400 });
    }
    const { account, refreshToken } = await requireCurrentAccount();
    const existing = await readDailySteps(refreshToken, input.startDate, input.endDate);
    const preview = buildPreview(existing, input);

    const job = await prisma.applyJob.create({
      data: {
        accountId: account.id,
        mode: "apply",
        status: "running",
        ruleInputJson: JSON.stringify(input),
      },
    });

    await prisma.snapshotDay.createMany({
      data: preview.days.map((day) => ({
        jobId: job.id,
        date: day.date,
        steps: day.oldSteps,
      })),
    });

    await writeDailySteps(
      refreshToken,
      preview.days.map((d) => ({ date: d.date, steps: d.newSteps })),
    );

    await prisma.dayChange.createMany({
      data: preview.days.map((day) => ({
        jobId: job.id,
        date: day.date,
        oldSteps: day.oldSteps,
        newSteps: day.newSteps,
        delta: day.delta,
      })),
    });

    await prisma.applyJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        summaryJson: JSON.stringify(preview.summary),
        finishedAt: new Date(),
      },
    });

    return NextResponse.json({ jobId: job.id, summary: preview.summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Apply failed." },
      { status: 400 },
    );
  }
}
