import { NextResponse } from "next/server";

import { getOAuthConsentUrl } from "@/lib/googleFit/oauth";

export async function POST() {
  return NextResponse.json({ url: getOAuthConsentUrl() });
}
