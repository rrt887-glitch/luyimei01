import { auth, storage } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, UploadTask } from 'firebase/storage';

/** Storage folder for a product: only the (Firestore auto-generated) product ID, never free text. */
function productFolder(productId: string): string {
  const safe = (productId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) {
    throw new Error('缺少商品 ID，无法上传媒体文件。');
  }
  return `products/${safe}`;
}

/**
 * Best-effort deletion of media files uploaded during an editing session that ended up unused
 * (form cancelled, or image removed before saving). Only Firebase Storage URLs are touched.
 */
export async function deleteUploadedMedia(urls: string[]): Promise<number> {
  let deleted = 0;
  for (const url of urls) {
    if (!url || !url.includes('firebasestorage.googleapis.com')) continue;
    try {
      await deleteObject(ref(storage, url));
      deleted++;
    } catch (err) {
      console.warn('Unused media cleanup warning:', err);
    }
  }
  return deleted;
}

const IMAGE_UPLOAD_TIMEOUT_MS = 30000;

function withCancelableUploadTimeout<T>(
  promise: Promise<T>,
  uploadTask: UploadTask,
  ms: number,
  errorMsg: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        uploadTask.cancel();
      } catch {
        // Ignore cancel errors
      }
      reject(new Error(errorMsg));
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

/**
 * Compress an image File into a lightweight WebP/JPEG Blob and preview dataUrl.
 */
export async function compressImageForStorage(
  file: File,
  maxWidth = 1080,
  quality = 0.82
): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法初始化图像压缩画布'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let dataUrl = canvas.toDataURL('image/webp', quality);
        let mimeType = 'image/webp';
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          mimeType = 'image/jpeg';
        }

        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error('生成压缩图像二进制数据失败'));
              return;
            }
            resolve({ blob, dataUrl });
          },
          mimeType,
          quality
        );
      };
      img.onerror = () => reject(new Error('读取图片文件失败，请确认图片格式有效'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('文件读取异常'));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a product image to Firebase Storage (`products/{productId}/images/{timestamp}_{filename}`)
 * and return the HTTPS download URL.
 *
 * Strictly forbids falling back to base64 dataUrl embedding inside Firestore documents,
 * and automatically cancels the uploadTask if timeout occurs.
 */
export async function uploadProductImageToStorage(
  productId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (!auth.currentUser) {
    throw new Error('未检测到超级管理员登录凭证，无法上传商品图片。');
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error('单张图片体积不能超过 10MB，请选择更小的图片文件。');
  }

  onProgress?.(10);
  const { blob } = await compressImageForStorage(file, 1080, 0.82);
  onProgress?.(35);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${productFolder(productId)}/images/${Date.now()}_${safeName}.webp`;
  const storageRef = ref(storage, storagePath);

  const uploadTask = uploadBytesResumable(storageRef, blob, {
    contentType: blob.type || 'image/webp'
  });

  const downloadUrl = await withCancelableUploadTimeout(
    new Promise<string>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        snapshot => {
          if (snapshot.totalBytes > 0) {
            const pct = Math.round(35 + (snapshot.bytesTransferred / snapshot.totalBytes) * 60);
            onProgress?.(Math.min(95, pct));
          }
        },
        err => reject(err),
        async () => {
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          } catch (urlErr) {
            reject(urlErr);
          }
        }
      );
    }),
    uploadTask,
    IMAGE_UPLOAD_TIMEOUT_MS,
    '商品图片上传至 Firebase Storage 超时（30秒），任务已取消，请检查网络或配置图片 CDN 直链。'
  );

  onProgress?.(100);
  return downloadUrl;
}

/**
 * Upload a product video file to Firebase Storage (`products/{productId}/videos/{timestamp}_{filename}`)
 * and return `{ videoUrl, thumbnailUrl }`.
 *
 * Dynamically scales timeout based on video file size (up to 10 minutes for 150MB) and
 * cancels the active `uploadTask` immediately on timeout.
 */
export async function uploadProductVideoToStorage(
  productId: string,
  file: File,
  thumbnailBlobUrl?: string,
  onProgress?: (percent: number) => void
): Promise<{ videoUrl: string; thumbnailUrl?: string }> {
  if (!auth.currentUser) {
    throw new Error('未检测到超级管理员登录凭证，无法上传商品视频至云端存储。');
  }

  if (file.size > 150 * 1024 * 1024) {
    throw new Error('视频文件体积超过 150MB 上限，请压缩后再上传或使用外部 CDN 视频直链。');
  }

  onProgress?.(5);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${productFolder(productId)}/videos/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, storagePath);

  const uploadTask = uploadBytesResumable(storageRef, file, {
    contentType: file.type || 'video/mp4'
  });

  // Dynamic timeout: minimum 180s (3 min), scaled at ~256KB/s up to 600s (10 min) for 150MB videos
  const dynamicTimeoutMs = Math.min(
    600000,
    Math.max(180000, Math.ceil(file.size / (256 * 1024)) * 1000)
  );
  const timeoutSec = Math.round(dynamicTimeoutMs / 1000);

  const downloadUrl = await withCancelableUploadTimeout(
    new Promise<string>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        snapshot => {
          if (snapshot.totalBytes > 0) {
            const pct = Math.round(5 + (snapshot.bytesTransferred / snapshot.totalBytes) * 90);
            onProgress?.(Math.min(95, pct));
          }
        },
        err => reject(err),
        async () => {
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          } catch (urlErr) {
            reject(urlErr);
          }
        }
      );
    }),
    uploadTask,
    dynamicTimeoutMs,
    `视频上传至 Firebase Storage 超时（${timeoutSec}秒），上传任务已自动取消，请检查网络或改用 CDN 视频直链（https://...）`
  );

  onProgress?.(100);
  return {
    videoUrl: downloadUrl,
    thumbnailUrl: thumbnailBlobUrl && thumbnailBlobUrl.length <= 450000 ? thumbnailBlobUrl : undefined
  };
}
