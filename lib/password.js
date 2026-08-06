import { randomBytes } from "node:crypto";

// Easy to read aloud / type — no ambiguous 0/O/1/l.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Generate a temporary password the admin can copy and hand to an attendant. */
export function generateTemporaryPassword(length = 12) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
