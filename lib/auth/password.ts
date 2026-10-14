import bcrypt from "bcryptjs";

const ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummyHash: Promise<string> | null = null;

/** Run an equivalent bcrypt comparison when the username does not exist, so timing does not reveal valid usernames. */
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= bcrypt.hash("the-heist-dummy-password", ROUNDS);
  await bcrypt.compare(plain, await dummyHash);
}
