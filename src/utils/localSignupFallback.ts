/**
 * Local SVG Vector Captcha & Direct Firebase Registration Fallback
 *
 * Used automatically when Cloud Functions (`getSignupCaptcha` / `registerBuyer`) are not yet
 * deployed or unreachable from the visitor's network. Draws a 5-character vector path SVG
 * (no text elements, identical stroke glyphs and bezier noise curves to functions/src/index.ts),
 * enforces single-use 5-minute challenges in memory, and creates the buyer account + `buyers/{uid}`
 * + `customers/CUST-{uid}` documents directly via Firebase Auth and Firestore security rules.
 */
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { adminApi, withTimeout } from '../services/adminApi';
import { isReservedStaffEmail } from '../config/appConfig';
import {
  sanitizeBuyerForFirestore,
  sanitizeCustomerForFirestore
} from './firestoreSanitizer';

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_LENGTH = 5;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Stroke font on a 10×14 grid. Look-alike characters (0/O, 1/I/L, 2/Z, 5/S, 8/B, U/V…) are left out. */
const CAPTCHA_GLYPHS: Record<string, number[][]> = {
  '2': [[0, 3, 2, 0, 8, 0, 10, 3, 10, 5, 0, 14, 10, 14]],
  '3': [[0, 1, 3, 0, 8, 0, 10, 2, 10, 5, 7, 7, 3, 7], [7, 7, 10, 9, 10, 12, 8, 14, 2, 14, 0, 13]],
  '4': [[8, 14, 8, 0, 0, 10, 10, 10]],
  '6': [[9, 1, 6, 0, 3, 0, 1, 3, 0, 7, 0, 11, 2, 14, 8, 14, 10, 11, 10, 9, 8, 7, 2, 7, 0, 9]],
  '7': [[0, 0, 10, 0, 4, 14]],
  '9': [[10, 5, 8, 7, 2, 7, 0, 5, 0, 3, 2, 0, 8, 0, 10, 3, 10, 9, 8, 13, 5, 14, 2, 13]],
  A: [[0, 14, 5, 0, 10, 14], [2, 9, 8, 9]],
  C: [[10, 2, 7, 0, 3, 0, 0, 3, 0, 11, 3, 14, 7, 14, 10, 12]],
  E: [[10, 0, 0, 0, 0, 14, 10, 14], [0, 7, 7, 7]],
  F: [[10, 0, 0, 0, 0, 14], [0, 7, 7, 7]],
  H: [[0, 0, 0, 14], [10, 0, 10, 14], [0, 7, 10, 7]],
  K: [[0, 0, 0, 14], [10, 0, 0, 8], [3, 6, 10, 14]],
  M: [[0, 14, 0, 0, 5, 8, 10, 0, 10, 14]],
  N: [[0, 14, 0, 0, 10, 14, 10, 0]],
  P: [[0, 14, 0, 0, 7, 0, 10, 2, 10, 5, 7, 7, 0, 7]],
  R: [[0, 14, 0, 0, 7, 0, 10, 2, 10, 5, 7, 7, 0, 7], [5, 7, 10, 14]],
  T: [[0, 0, 10, 0], [5, 0, 5, 14]],
  W: [[0, 0, 2, 14, 5, 5, 8, 14, 10, 0]],
  X: [[0, 0, 10, 14], [10, 0, 0, 14]],
  Y: [[0, 0, 5, 7, 10, 0], [5, 7, 5, 14]]
};
const CAPTCHA_CHARS = Object.keys(CAPTCHA_GLYPHS);

interface LocalCaptchaChallenge {
  answer: string;
  expiresAt: number;
}

const localCaptchaStore = new Map<string, LocalCaptchaChallenge>();

function cryptoRandomFraction(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] / 0x100000000;
  }
  return Math.random();
}

function randomIndex(maxExclusive: number): number {
  return Math.min(maxExclusive - 1, Math.floor(cryptoRandomFraction() * maxExclusive));
}

function rand(min: number, max: number): number {
  return min + cryptoRandomFraction() * (max - min);
}

const fmt = (n: number) => n.toFixed(1);

/** Draws `text` as a 160×56 SVG made exclusively of vector paths and circles (no text elements). */
export function renderLocalCaptchaSvg(text: string): string {
  const W = 160;
  const H = 56;
  const inks = ['#0e1b32', '#1f5fd7', '#334a5c', '#7a2e8a', '#0f6b5c'];
  const parts: string[] = [];

  for (let i = 0; i < 40; i++) {
    parts.push(
      `<circle cx="${fmt(rand(0, W))}" cy="${fmt(rand(0, H))}" r="${fmt(rand(0.6, 1.6))}" fill="${inks[randomIndex(inks.length)]}" opacity="${fmt(rand(0.15, 0.4))}"/>`
    );
  }

  const curve = (width: number, opacity: number) =>
    `<path d="M${fmt(rand(-5, 15))} ${fmt(rand(5, H - 5))} C${fmt(rand(30, 70))} ${fmt(rand(-10, H + 10))} ${fmt(rand(90, 130))} ${fmt(rand(-10, H + 10))} ${fmt(rand(145, W + 5))} ${fmt(rand(5, H - 5))}" fill="none" stroke="${inks[randomIndex(inks.length)]}" stroke-width="${fmt(width)}" opacity="${fmt(opacity)}" stroke-linecap="round"/>`;

  for (let i = 0; i < 3; i++) {
    parts.push(curve(rand(1, 1.8), rand(0.35, 0.6)));
  }

  const cell = (W - 20) / text.length;
  [...text].forEach((ch, i) => {
    const scale = rand(1.95, 2.35);
    const angle = (rand(-16, 16) * Math.PI) / 180;
    const skew = rand(-0.2, 0.2);
    const cx = 10 + cell * i + cell / 2 + rand(-2, 2);
    const cy = H / 2 + rand(-3, 3);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const point = (gx: number, gy: number) => {
      let x = gx - 5 + rand(-0.5, 0.5);
      const y = gy - 7 + rand(-0.5, 0.5);
      x += skew * y;
      const sx = x * scale;
      const sy = y * scale;
      return `${fmt(cx + sx * cos - sy * sin)} ${fmt(cy + sx * sin + sy * cos)}`;
    };
    const d = CAPTCHA_GLYPHS[ch]
      .map(stroke => {
        const pts: string[] = [];
        for (let k = 0; k < stroke.length; k += 2) {
          pts.push(point(stroke[k], stroke[k + 1]));
        }
        return `M${pts.join('L')}`;
      })
      .join('');
    parts.push(
      `<path d="${d}" fill="none" stroke="${inks[randomIndex(inks.length)]}" stroke-width="${fmt(rand(2.6, 3.4))}" stroke-linecap="round" stroke-linejoin="round"/>`
    );
  });

  for (let i = 0; i < 2; i++) {
    parts.push(curve(rand(1.2, 2), rand(0.45, 0.7)));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#eef4f8"/>${parts.join('')}</svg>`;
}

function pruneExpiredLocalCaptchas(now: number): void {
  for (const [key, entry] of localCaptchaStore.entries()) {
    if (entry.expiresAt <= now) {
      localCaptchaStore.delete(key);
    }
  }
}

export function createLocalSignupCaptcha(): { id: string; src: string } {
  const now = Date.now();
  pruneExpiredLocalCaptchas(now);

  let text = '';
  for (let i = 0; i < CAPTCHA_LENGTH; i++) {
    text += CAPTCHA_CHARS[randomIndex(CAPTCHA_CHARS.length)];
  }

  let randomSuffix = '';
  for (let i = 0; i < 12; i++) {
    randomSuffix += CAPTCHA_CHARS[randomIndex(CAPTCHA_CHARS.length)];
  }
  const id = `local_${now.toString(36)}_${randomSuffix}`;

  localCaptchaStore.set(id, {
    answer: text,
    expiresAt: now + CAPTCHA_TTL_MS
  });

  const svg = renderLocalCaptchaSvg(text);
  return {
    id,
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  };
}

export function isLocalCaptchaId(captchaId: string): boolean {
  return String(captchaId || '').startsWith('local_');
}

/**
 * Validates and immediately consumes a local captcha challenge (one-time use).
 * Returns `{ ok: true }` or `{ ok: false, reason: 'captcha_expired' | 'captcha_invalid' }`.
 */
export function verifyAndConsumeLocalCaptcha(
  captchaId: string,
  rawAnswer: string
): { ok: true } | { ok: false; reason: 'captcha_expired' | 'captcha_invalid' } {
  const cleanId = String(captchaId || '').trim();
  const cleanAnswer = String(rawAnswer || '').trim().toUpperCase();

  const record = localCaptchaStore.get(cleanId);
  // Always burn the captcha on first check so each challenge can only be submitted once.
  localCaptchaStore.delete(cleanId);

  if (!record || record.expiresAt < Date.now()) {
    return { ok: false, reason: 'captcha_expired' };
  }
  if (!cleanAnswer || cleanAnswer.length !== record.answer.length) {
    return { ok: false, reason: 'captcha_invalid' };
  }

  let mismatch = 0;
  for (let i = 0; i < record.answer.length; i++) {
    mismatch |= record.answer.charCodeAt(i) ^ cleanAnswer.charCodeAt(i);
  }
  if (mismatch !== 0) {
    return { ok: false, reason: 'captcha_invalid' };
  }

  return { ok: true };
}

/**
 * Direct client-side registration fallback when Cloud Function `registerBuyer` is not deployed
 * or unreachable. Enforces the same field validation, creates the Firebase Auth account, and
 * persists both `/buyers/{uid}` and `/customers/CUST-{uid}` under Firestore security rules.
 */
export async function registerBuyerDirectFallback(
  data: {
    name: string;
    email: string;
    password: string;
    country: string;
    dialCode: string;
    whatsapp: string;
  },
  makeError: (reason: string, message?: string) => Error
): Promise<{ uid: string; whatsapp: string; registeredAt: string }> {
  const email = String(data.email || '').trim().toLowerCase();
  const name = String(data.name || '').trim().slice(0, 120);
  const password = String(data.password || '');
  const country = String(data.country || '').trim().slice(0, 100);
  const dialCode = String(data.dialCode || '').replace(/\D/g, '');
  const localNumber = String(data.whatsapp || '').replace(/\D/g, '').replace(/^0+/, '');

  if (!email || email.length > 150 || !EMAIL_PATTERN.test(email)) {
    throw makeError('invalid_email', 'Invalid email address.');
  }
  if (isReservedStaffEmail(email)) {
    throw makeError('reserved_email', 'This email domain cannot be used for buyer accounts.');
  }
  if (name.length < 2) {
    throw makeError('invalid_name', 'Please enter your name.');
  }
  if (password.trim().length < MIN_PASSWORD_LENGTH || password.length > 128) {
    throw makeError('weak_password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!country) {
    throw makeError('invalid_country', 'Please choose your country.');
  }
  if (!/^\d{1,4}$/.test(dialCode) || localNumber.length < 5 || dialCode.length + localNumber.length > 15) {
    throw makeError('invalid_whatsapp', 'Please enter a valid WhatsApp number.');
  }

  const whatsapp = `+${dialCode} ${localNumber}`;

  let uid = '';
  try {
    const cred = await withTimeout(
      createUserWithEmailAndPassword(auth, email, password),
      10000
    );
    uid = cred.user.uid;
    await updateProfile(cred.user, { displayName: name }).catch(() => {});
  } catch (err: any) {
    const code = String(err?.code || '');
    if (code === 'auth/email-already-in-use' || code === 'auth/email-already-exists') {
      throw makeError('email_taken', 'This email is already registered.');
    }
    if (code === 'auth/invalid-email') {
      throw makeError('invalid_email', 'Invalid email address.');
    }
    if (code === 'auth/weak-password' || code === 'auth/invalid-password') {
      throw makeError('weak_password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (code === 'auth/network-request-failed') {
      throw makeError('network', err?.message);
    }
    throw makeError('create_failed', err?.message || 'The account could not be created.');
  }

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  const buyerPayload = sanitizeBuyerForFirestore({
    id: uid,
    uid,
    email,
    name,
    company: '',
    phone: whatsapp,
    country,
    role: '官网注册买家',
    registeredAt: nowIso,
    updatedAt: nowIso
  });

  const customerPayload = sanitizeCustomerForFirestore({
    id: `CUST-${uid}`,
    name,
    company: '',
    email,
    phone: whatsapp,
    country,
    status: 'active',
    source: '官网买家注册',
    inquiryCount: 0,
    totalQuotationUsd: 0,
    registeredAt: today,
    lastActiveAt: today
  });

  await Promise.allSettled([
    withTimeout(setDoc(doc(db, 'buyers', uid), buyerPayload), 6000),
    withTimeout(setDoc(doc(db, 'customers', `CUST-${uid}`), customerPayload), 6000),
    adminApi.registerCustomerFromAccount({
      id: uid,
      name,
      email,
      phone: whatsapp,
      company: '',
      country,
      source: '官网买家注册'
    })
  ]);

  return { uid, whatsapp, registeredAt: nowIso };
}
