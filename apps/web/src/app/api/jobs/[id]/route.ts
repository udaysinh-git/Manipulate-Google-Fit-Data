import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireCurrentAccount } from "@/lib/current-account";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { account } = await requireCurrentAccount();
    const job = await prisma.applyJob.findFirst({
      where: {
        id,
        accountId: account.id,
      },
      include: {
        dayChanges: true,
        snapshotDays: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cannot fetch job." },
      { status: 400 },
    );
  }
}
