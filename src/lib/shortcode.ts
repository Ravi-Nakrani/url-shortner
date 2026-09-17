const BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const DEFAULT_LENGTH = 7;

/**
 * Generates a random base62 short code. Collision-freedom is enforced at the
 * database layer (unique index on `shortCode`), not here — callers should
 * catch the unique-index violation on insert and retry with a fresh code.
 */
export function generateShortCode(length: number = DEFAULT_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * BASE62_ALPHABET.length);
    code += BASE62_ALPHABET[randomIndex];
  }
  return code;
}
