import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

import { getEnv } from "@/lib/env";

const COOKIE_NAME = "fit_editor_session";
const encoder = new TextEncoder();

type SessionPayload = {
  accountId: string;
  email: string;
};

function getSessionSecret() {
  return encoder.encode(getEnv().APP_ENCRYPTION_KEY);
}

export async function createSessionCookie(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(getSessionSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, getSessionSecret());
    return verified.payload as SessionPayload;
  } catch {
    return null;
  }
}
