import { google } from "googleapis";

import { getEnv } from "@/lib/env";

// Fitness write alone does not allow oauth2.userinfo.get(); email/profile are required to upsert the account.
const SCOPES = [
  "openid",
  "email",
  "profile",
  // Read is required for aggregate/dataset reads; write alone cannot read step_count.delta.
  "https://www.googleapis.com/auth/fitness.activity.read",
  "https://www.googleapis.com/auth/fitness.activity.write",
];

export function buildOAuthClient() {
  const env = getEnv();
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URL,
  );
}

export function getOAuthConsentUrl() {
  const oauthClient = buildOAuthClient();
  return oauthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}
