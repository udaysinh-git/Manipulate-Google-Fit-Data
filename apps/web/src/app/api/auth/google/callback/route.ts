import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

import { createSessionCookie } from "@/lib/auth-session";
import { encryptText } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { buildOAuthClient } from "@/lib/googleFit/oauth";

function oauthRedirectCode(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 403) {
      return "userinfo_forbidden";
    }
  }
  if (error instanceof Error) {
    const m = error.message;
    if (m.includes("invalid_grant")) {
      return "invalid_grant";
    }
  }
  return "oauth_failed";
}

export async function GET(req: NextRequest) {
  const env = getEnv();
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/?error=missing_code", env.APP_BASE_URL));
  }

  try {
    const oauthClient = buildOAuthClient();
    const { tokens } = await oauthClient.getToken(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL("/?error=missing_refresh_token", env.APP_BASE_URL));
    }

    oauthClient.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauthClient });
    const profile = await oauth2.userinfo.get();
    const googleUserId = profile.data.id;
    const email = profile.data.email;

    if (!googleUserId || !email) {
      return NextResponse.redirect(new URL("/?error=profile_fetch_failed", env.APP_BASE_URL));
    }

    const account = await prisma.googleAccount.upsert({
      where: { googleUserId },
      update: {
        email,
        encryptedRefreshToken: encryptText(tokens.refresh_token),
      },
      create: {
        googleUserId,
        email,
        encryptedRefreshToken: encryptText(tokens.refresh_token),
      },
    });

    await createSessionCookie({ accountId: account.id, email: account.email });
    return NextResponse.redirect(new URL("/", env.APP_BASE_URL));
  } catch (error) {
    console.error("[google oauth callback]", error);
    const codeParam = oauthRedirectCode(error);
    return NextResponse.redirect(new URL(`/?error=${codeParam}`, env.APP_BASE_URL));
  }
}
