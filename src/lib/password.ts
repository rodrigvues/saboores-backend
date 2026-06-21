import bcrypt from "bcrypt";

const COST = 12;

/** bcrypt opera sobre no máximo 72 bytes — acima disso ele truncaria em silêncio. */
export const MAX_PASSWORD_BYTES = 72;

export function isWithinBcryptLimit(password: string): boolean {
  return Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
