import { randomInt } from "node:crypto";

const BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const DEFAULT_LENGTH = 7;

/**
 * Generates a random base62 short code. Collision-freedom is enforced at the
 * database layer (unique index on `shortCode`), not here — callers should
 * catch the unique-index violation on insert and retry with a fresh code.
 *
 * Uses `crypto.randomInt` (a CSPRNG) rather than `Math.random()` so short
 * codes aren't predictable from an attacker observing a handful of previously
 * issued ones — `Math.random()`'s underlying PRNG is not cryptographically
 * secure and its state can, in principle, be reconstructed from its output.
 */
export function generateShortCode(length: number = DEFAULT_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += BASE62_ALPHABET[randomInt(BASE62_ALPHABET.length)];
  }
  return code;
}
