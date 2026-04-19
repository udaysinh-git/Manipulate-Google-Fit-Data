import { NextResponse } from "next/server";

import { validateFitDateRange } from "@/lib/fit-date-range";
import { requireCurrentAccount } from "@/lib/current-account";
import { readDailySteps } from "@/lib/googleFit/client";
import { buildPreview, rulesInputSchema } from "@/lib/transform/rules";

export async function POST(req: Request) {
  try {
    const input = rulesInputSchema.parse(await req.json());
    const rangeError = validateFitDateRange(input.startDate, input.endDate);
    if (rangeError) {
      return NextResponse.json({ error: rangeError }, { status: 400 });
    }

    const { refreshToken } = await requireCurrentAccount();
    const existing = await readDailySteps(refreshToken, input.startDate, input.endDate);
    const preview = buildPreview(existing, input);

    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed." },
      { status: 400 },
    );
  }
}
