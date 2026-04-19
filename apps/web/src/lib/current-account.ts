import { decryptText } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth-session";

export async function requireCurrentAccount() {
  const session = await getSession();
  if (!session) {
    throw new Error("Not authenticated.");
  }

  const account = await prisma.googleAccount.findUnique({
    where: { id: session.accountId },
  });

  if (!account) {
    throw new Error("Connected account not found.");
  }

  return {
    account,
    refreshToken: decryptText(account.encryptedRefreshToken),
  };
}
