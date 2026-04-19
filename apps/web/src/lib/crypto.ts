import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getEnv } from "@/lib/env";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ALGO = "aes-256-gcm";

function getKey() {
  return createHash("sha256").update(getEnv().APP_ENCRYPTION_KEY).digest();
}

export function encryptText(plainText: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}.${tag.toString("hex")}.${encrypted.toString("hex")}`;
}

export function decryptText(payload: string) {
  const [ivHex, tagHex, encryptedHex] = payload.split(".");
  if (!ivHex || !tagHex || !encryptedHex) {
    throw new Error("Invalid encrypted payload format.");
  }

  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex").subarray(0, TAG_LENGTH));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
