import "dotenv/config";
import { createInterface } from "node:readline/promises";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { generateSecret, generateURI } from "otplib";
import QRCode from "qrcode";
import { db, sql } from "@/db/client";
import { adminSessions, adminUsers } from "@/db/schema";
import { env } from "@/lib/env";

/**
 * Create (or reset) an admin account with a fresh TOTP secret.
 *   npm run admin:create -- <username>
 * The password is read from ADMIN_PASSWORD or prompted. Scan the printed QR code with
 * any authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).
 */
async function main() {
  const username = process.argv[2];
  if (!username || !/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    console.log("usage: npm run admin:create -- <username>");
    process.exitCode = 1;
    return;
  }
  let password = process.env.ADMIN_PASSWORD ?? "";
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Password (min 12 chars): ");
    rl.close();
  }
  if (password.length < 12) {
    console.log("Password must be at least 12 characters.");
    process.exitCode = 1;
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const totpSecret = generateSecret();
  const [existing] = await db.select().from(adminUsers).where(eq(adminUsers.username, username));
  if (existing) {
    await db.update(adminUsers).set({ passwordHash, totpSecret, lastTotpStep: 0 }).where(eq(adminUsers.id, existing.id));
    await db.delete(adminSessions).where(eq(adminSessions.userId, existing.id));
    console.log(`Reset ${username} (password + authenticator); existing sessions signed out.`);
  } else {
    await db.insert(adminUsers).values({ username, passwordHash, totpSecret });
    console.log(`Created admin ${username}.`);
  }
  const uri = generateURI({ issuer: env.siteNameEn, label: username, secret: totpSecret });
  console.log("\nScan with your authenticator app:\n");
  console.log(await QRCode.toString(uri, { type: "terminal", small: true }));
  console.log(`Or enter this key manually: ${totpSecret}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
