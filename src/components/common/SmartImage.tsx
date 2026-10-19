import React, { useCallback, useState } from 'react';
import { useI18n } from '../../i18n';

const FAILED: Record<string, string> = { zh: '图片加载失败', en: 'Image failed to load', ar: 'تعذّر تحميل الصورة', ru: 'Не удалось загрузить фото' };

/**
 * A photo that shows a soft placeholder while it loads and a clear fallback if it fails,
 * instead of a blank box or the browser's broken-image icon.
 */
export const SmartImage: React.FC<
  React.ImgHTMLAttributes<HTMLImageElement> & { fallback?: React.ReactNode; wrapperClassName?: string }
> = ({ fallback, wrapperClassName = 'absolute inset-0', className = '', onLoad, onError, ...img }) => {
  const { lang } = useI18n();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  // A photo served from cache can finish before the handlers below are attached: check on mount.
  const imgRef = useCallback((el: HTMLImageElement | null) => {
    if (el && el.complete) setState(el.naturalWidth > 0 ? 'ok' : 'error');
  }, []);
  return (
    <span className={`block overflow-hidden ${wrapperClassName} ${state === 'loading' ? 'img-loading' : ''}`}>
      {state === 'error' ? (
        fallback || (
          <span className="flex w-full h-full flex-col items-center justify-center gap-1 bg-concrete text-xs text-slate-500" role="img" aria-label={img.alt || FAILED[lang]}>
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="m3 16 5-5 4 4 3-3 6 6M3 3l18 18" />
            </svg>
            {FAILED[lang]}
          </span>
        )
      ) : (
        <img
          ref={imgRef}
          decoding="async"
          {...img}
          className={`${className} transition-opacity duration-300 ${state === 'ok' ? 'opacity-100' : 'opacity-0'}`}
          onLoad={e => {
            setState('ok');
            onLoad?.(e);
          }}
          onError={e => {
            setState('error');
            onError?.(e);
          }}
        />
      )}
    </span>
  );
};
