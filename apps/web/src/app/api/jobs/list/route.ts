import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireCurrentAccount } from "@/lib/current-account";

export async function GET() {
  try {
    const { account } = await requireCurrentAccount();
    const jobs = await prisma.applyJob.findMany({
      where: { accountId: account.id },
      orderBy: { startedAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ jobs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load jobs." },
      { status: 400 },
    );
  }
}
