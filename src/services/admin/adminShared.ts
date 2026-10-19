import { STAFF_AUTH_EMAIL_DOMAIN, TIMEOUTS } from '../../config/appConfig';

export const ADMIN_OPERATION_TIMEOUT_MS = TIMEOUTS.firestoreOperation;

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = ADMIN_OPERATION_TIMEOUT_MS,
  customErrMsg?: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          customErrMsg ||
            `云端服务器响应超时（${Math.round(ms / 1000)}秒），请检查当前网络环境后重试。`
        )
      );
    }, ms);
    promise.then(
      val => {
        clearTimeout(timer);
        resolve(val);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function normalizePhoneDigits(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('86')) {
    return digits.slice(2);
  }
  return digits;
}

/** Maps a staff mobile number to its Firebase Auth login email (must match functions/src/index.ts). */
export function phoneToStaffAuthEmail(phone: string): string {
  return `staff.${normalizePhoneDigits(phone)}@${STAFF_AUTH_EMAIL_DOMAIN}`;
}
