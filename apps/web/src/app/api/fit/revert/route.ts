import { z } from "zod";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireCurrentAccount } from "@/lib/current-account";
import { writeDailySteps } from "@/lib/googleFit/client";

const revertInputSchema = z.object({
  jobId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const { jobId } = revertInputSchema.parse(await req.json());
    const { account, refreshToken } = await requireCurrentAccount();

    const targetJob = await prisma.applyJob.findFirst({
      where: {
        id: jobId,
        accountId: account.id,
        mode: "apply",
        status: "completed",
      },
      include: {
        snapshotDays: true,
      },
    });

    if (!targetJob || targetJob.snapshotDays.length === 0) {
      return NextResponse.json({ error: "No snapshot found for this job." }, { status: 404 });
    }

    const revertJob = await prisma.applyJob.create({
      data: {
        accountId: account.id,
        mode: "revert",
        status: "running",
        ruleInputJson: JSON.stringify({ sourceJobId: jobId }),
      },
    });

    await writeDailySteps(
      refreshToken,
      targetJob.snapshotDays.map((day) => ({ date: day.date, steps: day.steps })),
    );

    await prisma.dayChange.createMany({
      data: targetJob.snapshotDays.map((day) => ({
        jobId: revertJob.id,
        date: day.date,
        oldSteps: 0,
        newSteps: day.steps,
        delta: 0,
      })),
    });

    await prisma.applyJob.update({
      where: { id: revertJob.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
        summaryJson: JSON.stringify({
          revertedFrom: jobId,
          daysReverted: targetJob.snapshotDays.length,
        }),
      },
    });

    return NextResponse.json({ jobId: revertJob.id, revertedFrom: jobId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Revert failed." },
      { status: 400 },
    );
  }
}
