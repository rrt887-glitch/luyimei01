import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi } from '../../../services/adminApi';
import { UploadCancelledError, UploadRejectedError, describeUploadError, uploadProductImage, uploadProductVideo } from '../../../services/mediaStorage';

export interface PhotoUpload {
  id: string;
  name: string;
  /** Local preview shown while the photo uploads. */
  preview: string;
  percent: number;
  status: 'waiting' | 'uploading' | 'error';
  error?: string;
  /** False when the file itself was refused (wrong type, too big): only removing helps. */
  retryable?: boolean;
}

export interface VideoUpload {
  name: string;
  percent: number;
  transferred: number;
  total: number;
  status: 'uploading' | 'error';
  error?: string;
  retryable?: boolean;
}

const PHOTO_CONCURRENCY = 2;
let seq = 0;

/**
 * Photo and video uploads for the product form: every file shows its own progress and its own
 * error, can be cancelled, and a failed file can be retried without choosing it again.
 */
export function useMediaUploads(productId: string, onPhotoUploaded: (url: string) => void, onVideoUploaded: (url: string) => void) {
  const [photos, setPhotos] = useState<PhotoUpload[]>([]);
  const [video, setVideo] = useState<VideoUpload | null>(null);
  const files = useRef(new Map<string, File>());
  const aborts = useRef(new Map<string, AbortController>());
  const active = useRef(0);
  const queue = useRef<string[]>([]);
  const videoFile = useRef<File | null>(null);
  const videoAbort = useRef<AbortController | null>(null);
  const callbacks = useRef({ onPhotoUploaded, onVideoUploaded, productId });
  callbacks.current = { onPhotoUploaded, onVideoUploaded, productId };

  const patchPhoto = (id: string, patch: Partial<PhotoUpload>) => setPhotos(list => list.map(p => (p.id === id ? { ...p, ...patch } : p)));

  const pump = useCallback(() => {
    while (active.current < PHOTO_CONCURRENCY && queue.current.length) {
      const id = queue.current.shift()!;
      const file = files.current.get(id);
      if (!file) continue;
      active.current++;
      const ctrl = new AbortController();
      aborts.current.set(id, ctrl);
      patchPhoto(id, { status: 'uploading', percent: 0, error: undefined });
      uploadProductImage(callbacks.current.productId, file, p => patchPhoto(id, { percent: p.percent }), ctrl.signal)
        .then(url => {
          callbacks.current.onPhotoUploaded(url);
          void adminApi.addAuditLog('上传商品图片', file.name, `商品 ID: ${callbacks.current.productId}｜${(file.size / 1024).toFixed(0)} KB`);
          files.current.delete(id);
          setPhotos(list => {
            const done = list.find(p => p.id === id);
            if (done) URL.revokeObjectURL(done.preview);
            return list.filter(p => p.id !== id);
          });
        })
        .catch(err => {
          if (err instanceof UploadCancelledError) return;
          patchPhoto(id, { status: 'error', error: describeUploadError(err), retryable: !(err instanceof UploadRejectedError) });
        })
        .finally(() => {
          aborts.current.delete(id);
          active.current--;
          pump();
        });
    }
  }, []);

  const addPhotos = useCallback(
    (list: FileList | File[]) => {
      const added: PhotoUpload[] = Array.from(list).map(file => {
        const id = `p${++seq}`;
        files.current.set(id, file);
        queue.current.push(id);
        return { id, name: file.name, preview: URL.createObjectURL(file), percent: 0, status: 'waiting' };
      });
      setPhotos(prev => [...prev, ...added]);
      pump();
    },
    [pump]
  );

  const retryPhoto = useCallback(
    (id: string) => {
      if (!files.current.has(id)) return;
      patchPhoto(id, { status: 'waiting', percent: 0, error: undefined });
      queue.current.push(id);
      pump();
    },
    [pump]
  );

  /** Cancels an upload in progress, or removes a waiting / failed one. */
  const removePhoto = useCallback((id: string) => {
    aborts.current.get(id)?.abort();
    queue.current = queue.current.filter(q => q !== id);
    files.current.delete(id);
    setPhotos(list => {
      const gone = list.find(p => p.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return list.filter(p => p.id !== id);
    });
  }, []);

  const startVideo = useCallback((file: File) => {
    videoAbort.current?.abort();
    const ctrl = new AbortController();
    videoAbort.current = ctrl;
    videoFile.current = file;
    setVideo({ name: file.name, percent: 0, transferred: 0, total: file.size, status: 'uploading' });
    uploadProductVideo(
      callbacks.current.productId,
      file,
      p => setVideo(v => (v && v.status === 'uploading' ? { ...v, percent: p.percent, transferred: p.transferred, total: p.total } : v)),
      ctrl.signal
    )
      .then(url => {
        callbacks.current.onVideoUploaded(url);
        void adminApi.addAuditLog('上传商品视频', file.name, `商品 ID: ${callbacks.current.productId}｜${(file.size / 1048576).toFixed(1)} MB`);
        videoFile.current = null;
        setVideo(null);
      })
      .catch(err => {
        if (err instanceof UploadCancelledError) return;
        setVideo(v => (v ? { ...v, status: 'error', error: describeUploadError(err), retryable: !(err instanceof UploadRejectedError) } : v));
      });
  }, []);

  const retryVideo = useCallback(() => {
    if (videoFile.current) startVideo(videoFile.current);
  }, [startVideo]);

  const cancelVideo = useCallback(() => {
    videoAbort.current?.abort();
    videoAbort.current = null;
    videoFile.current = null;
    setVideo(null);
  }, []);

  /** Stops everything (form closed). */
  const reset = useCallback(() => {
    aborts.current.forEach(a => a.abort());
    aborts.current.clear();
    queue.current = [];
    files.current.clear();
    videoAbort.current?.abort();
    videoAbort.current = null;
    videoFile.current = null;
    setPhotos(list => {
      list.forEach(p => URL.revokeObjectURL(p.preview));
      return [];
    });
    setVideo(null);
  }, []);

  useEffect(() => reset, [reset]);

  const busy = photos.some(p => p.status !== 'error') || video?.status === 'uploading';
  const failed = photos.filter(p => p.status === 'error').length + (video?.status === 'error' ? 1 : 0);

  return { photos, video, addPhotos, retryPhoto, removePhoto, startVideo, retryVideo, cancelVideo, reset, busy, failed };
}

export type MediaUploads = ReturnType<typeof useMediaUploads>;

export const formatMb = (bytes: number) => `${(bytes / 1048576).toFixed(bytes >= 10 * 1048576 ? 0 : 1)} MB`;
