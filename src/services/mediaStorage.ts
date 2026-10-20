import { auth, getStorageService } from './firebase';
import type { StorageReference } from 'firebase/storage';

/** Storage folder for a product: only the (Firestore auto-generated) product ID, never free text. */
function productFolder(productId: string): string {
  const safe = (productId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) {
    throw new Error('缺少商品 ID，无法上传媒体文件。');
  }
  return `products/${safe}`;
}

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 150 * 1024 * 1024;
/** An upload that has not moved for this long is treated as a dropped connection. */
const STALL_TIMEOUT_MS = 45_000;
/** Renew the upload grant while uploading, well before its 15 minutes run out. */
const GRANT_RENEW_MS = 5 * 60_000;
let grantUntil = 0;

/**
 * storage.rules accepts media writes only while the custom claim `uploadUntil` is in the future.
 * The grantUploadAccess Cloud Function checks the staff record live and sets it; the ID token is
 * then refreshed so the new claim travels with the upload. A suspended or deleted admin is refused
 * here, which is exactly when uploading must stop.
 */
async function ensureUploadGrant(force = false): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error('登录已过期，请重新登录后再上传。'), { code: 'lym/session-ended' });
  if (!force && grantUntil - Date.now() > GRANT_RENEW_MS) return;
  const { adminFunctions } = await import('./admin/adminFunctions');
  try {
    const { uploadUntil } = await adminFunctions.grantUploadAccess();
    await user.getIdToken(true);
    grantUntil = uploadUntil;
  } catch (err) {
    grantUntil = 0;
    const code = String((err as { code?: string })?.code || '');
    if (code === 'permission-denied' || code === 'unauthenticated' || code.startsWith('auth/user-')) {
      throw Object.assign(new Error('账号已停用或没有上传权限，不能上传。请用在职超级管理员账号重新登录。'), { code: 'lym/session-ended' });
    }
    throw err;
  }
}

export class UploadCancelledError extends Error {
  constructor() {
    super('已取消上传');
    this.name = 'UploadCancelledError';
  }
}

/** The file itself is not acceptable (type, size, unreadable): retrying the same file cannot help. */
export class UploadRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadRejectedError';
  }
}

/** A message a person can act on, for any upload failure. */
export function describeUploadError(err: unknown): string {
  if (err instanceof UploadCancelledError) return err.message;
  const code = String((err as { code?: string })?.code || '');
  switch (code) {
    case 'storage/unauthorized':
      return '没有上传权限：只有超级管理员可以上传。请确认账号身份，退出后重新登录再试。';
    case 'storage/unauthenticated':
      return '登录已过期，请重新登录后再上传。';
    case 'storage/canceled':
      return '已取消上传';
    case 'storage/quota-exceeded':
      return '云存储空间已满，请联系管理员在 Firebase 控制台扩容。';
    case 'storage/retry-limit-exceeded':
      return '网络不稳定，多次重试后仍未上传成功，请检查网络后重试。';
    case 'storage/invalid-checksum':
      return '文件在传输中损坏，请重试。';
    case 'storage/server-file-wrong-size':
      return '服务器收到的文件不完整，请重试。';
  }
  const message = (err as Error)?.message || '';
  return message || '上传失败，请检查网络后重试。';
}

/**
 * Uploads with real byte progress. Gives up only when nothing has moved for 45 s (so a large video
 * on a slow line is never cut off just for being slow), and can be cancelled with `signal`.
 */
async function uploadWithProgress(
  path: string,
  data: Blob,
  contentType: string,
  onProgress: (transferred: number, total: number) => void,
  signal?: AbortSignal
): Promise<string> {
  if (signal?.aborted) throw new UploadCancelledError();
  await ensureUploadGrant();
  const [{ ref, uploadBytesResumable, getDownloadURL }, storage] = await Promise.all([import('firebase/storage'), getStorageService()]);
  const storageRef: StorageReference = ref(storage, path);
  const task = uploadBytesResumable(storageRef, data, { contentType, cacheControl: 'public, max-age=31536000' });

  return new Promise<string>((resolve, reject) => {
    let stalled: ReturnType<typeof setTimeout>;
    // A long video can outlast one grant: renew it so later chunks still pass storage.rules.
    // A refused renewal (account suspended) is left to the rules, which then reject the next chunk.
    const keepFresh = setInterval(() => void ensureUploadGrant().catch(() => undefined), 60_000);
    let failure: Error | null = null;
    const armStallTimer = () => {
      clearTimeout(stalled);
      stalled = setTimeout(() => {
        failure = new Error(`上传停了 ${STALL_TIMEOUT_MS / 1000} 秒没有进展（网络可能中断），已停止，请检查网络后重试。`);
        task.cancel();
      }, STALL_TIMEOUT_MS);
    };
    const onAbort = () => {
      failure = new UploadCancelledError();
      task.cancel();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    armStallTimer();

    task.on(
      'state_changed',
      snap => {
        armStallTimer();
        onProgress(snap.bytesTransferred, snap.totalBytes || data.size);
      },
      err => {
        clearTimeout(stalled);
        clearInterval(keepFresh);
        signal?.removeEventListener('abort', onAbort);
        reject(failure || err);
      },
      async () => {
        clearTimeout(stalled);
        clearInterval(keepFresh);
        signal?.removeEventListener('abort', onAbort);
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (urlErr) {
          reject(urlErr);
        }
      }
    );
  });
}

/** Scales a photo down to at most `maxWidth` and re-encodes it as WebP (JPEG where WebP is unsupported). */
export async function compressImage(file: File, maxWidth = 1280, quality = 0.8): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new UploadRejectedError(`「${file.name}」打不开，请确认是 JPG、PNG 或 WebP 图片。`));
      el.src = url;
    });
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器无法处理这张图片，请换一个浏览器再试。');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const encode = (type: string) => new Promise<Blob | null>(r => canvas.toBlob(r, type, quality));
    const blob = (await encode('image/webp')) || (await encode('image/jpeg'));
    if (!blob) throw new Error(`「${file.name}」压缩失败，请换一张图片。`);
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface UploadProgress {
  /** 0–100 */
  percent: number;
  stage: 'preparing' | 'uploading';
  transferred: number;
  total: number;
}

function requireLogin() {
  if (!auth.currentUser) throw new Error('登录已过期，请重新登录后再上传。');
}

/**
 * Compresses and uploads a product photo to `products/{productId}/images/…` and returns its URL.
 * Progress: compressing is the first 10 %, the upload itself the rest.
 */
export async function uploadProductImage(
  productId: string,
  file: File,
  onProgress: (p: UploadProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  requireLogin();
  if (!file.type.startsWith('image/')) throw new UploadRejectedError(`「${file.name}」不是图片文件。`);
  if (file.size > IMAGE_MAX_BYTES) throw new UploadRejectedError(`「${file.name}」超过 10 MB，请换一张小一些的图片。`);
  onProgress({ percent: 2, stage: 'preparing', transferred: 0, total: file.size });
  const blob = await compressImage(file);
  if (signal?.aborted) throw new UploadCancelledError();
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'photo';
  return uploadWithProgress(
    `${productFolder(productId)}/images/${Date.now()}_${base}.${ext}`,
    blob,
    blob.type,
    (done, total) => onProgress({ percent: 10 + Math.round((done / Math.max(1, total)) * 90), stage: 'uploading', transferred: done, total }),
    signal
  );
}

/** Uploads a product video to `products/{productId}/videos/…` and returns its URL. */
export async function uploadProductVideo(
  productId: string,
  file: File,
  onProgress: (p: UploadProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  requireLogin();
  if (!/^video\/(mp4|webm|ogg|quicktime)$/.test(file.type)) throw new UploadRejectedError(`「${file.name}」不是支持的视频格式，请用 MP4（推荐）、WebM 或 MOV。`);
  if (file.size > VIDEO_MAX_BYTES) throw new UploadRejectedError(`视频有 ${(file.size / 1048576).toFixed(0)} MB，超过 150 MB 上限。请压缩后再上传，或填写视频链接。`);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  return uploadWithProgress(
    `${productFolder(productId)}/videos/${Date.now()}_${safeName}`,
    file,
    file.type || 'video/mp4',
    (done, total) => onProgress({ percent: Math.round((done / Math.max(1, total)) * 100), stage: 'uploading', transferred: done, total }),
    signal
  );
}

/**
 * Best-effort deletion of media files uploaded during an editing session that ended up unused
 * (form cancelled, or image removed before saving). Only Firebase Storage URLs are touched.
 */
export async function deleteUploadedMedia(urls: string[]): Promise<number> {
  const targets = urls.filter(url => url && url.includes('firebasestorage.googleapis.com'));
  if (!targets.length) return 0;
  await ensureUploadGrant().catch(() => undefined);
  const [{ ref, deleteObject }, storage] = await Promise.all([import('firebase/storage'), getStorageService()]);
  let deleted = 0;
  for (const url of targets) {
    try {
      await deleteObject(ref(storage, url));
      deleted++;
    } catch (err) {
      console.warn('Unused media cleanup warning:', err);
    }
  }
  return deleted;
}
