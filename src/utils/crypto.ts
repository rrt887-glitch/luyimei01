/**
 * Password complexity & input validation helpers.
 * All credential hashing, verification, and session token signing are strictly handled
 * server-side by Firebase Authentication (JWT ID Tokens).
 * Client-side HMAC secrets, salts, and password hashes have been permanently retired.
 */

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Validates that a password is non-empty after trimming whitespace
 * and meets the minimum length requirement (at least 8 characters).
 */
export function validatePasswordStrength(password?: string): {
  valid: boolean;
  trimmed: string;
  message?: string;
} {
  const trimmed = (password || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      trimmed: '',
      message: '密码不能为空或纯空格，请输入有效的登录密码。'
    };
  }
  if (trimmed.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      trimmed,
      message: `密码长度不足，请输入不少于 ${MIN_PASSWORD_LENGTH} 位字符的密码。`
    };
  }
  return {
    valid: true,
    trimmed
  };
}

/**
 * Generates a cryptographically strong random password (default 14 chars) that always contains
 * upper-case, lower-case, digits and a symbol. Uses `crypto.getRandomValues` (never Math.random).
 * Ambiguous characters (0/O, 1/l/I) are excluded so passwords can be read out loud safely.
 */
export function generateStrongPassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%&*!?';
  const all = upper + lower + digits + symbols;

  const randomIndex = (max: number): number => {
    // Rejection sampling to avoid modulo bias.
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    let value: number;
    do {
      crypto.getRandomValues(buf);
      value = buf[0];
    } while (value >= limit);
    return value % max;
  };

  const size = Math.max(MIN_PASSWORD_LENGTH, length);
  const chars = [
    upper[randomIndex(upper.length)],
    lower[randomIndex(lower.length)],
    digits[randomIndex(digits.length)],
    symbols[randomIndex(symbols.length)]
  ];
  while (chars.length < size) {
    chars.push(all[randomIndex(all.length)]);
  }
  // Fisher-Yates shuffle so the guaranteed classes are not always at the start.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
