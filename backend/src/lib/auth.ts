import crypto from "crypto";

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "erp_salt_2024").digest("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export function generateToken(userId: number, email: string): string {
  const payload = `${userId}:${email}:${Date.now()}`;
  return Buffer.from(payload).toString("base64");
}

export function parseToken(token: string): { userId: number; email: string } | null {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [userId, email] = decoded.split(":");
    return { userId: parseInt(userId), email };
  } catch {
    return null;
  }
}
