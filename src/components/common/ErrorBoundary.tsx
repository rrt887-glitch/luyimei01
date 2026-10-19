import React from 'react';
import { boundaryText } from '../../i18n/boundaryText';

const RELOAD_FLAG = 'lym_chunk_reload_at';

/** Old cached pages ask for script chunks that a newer deploy has replaced. */
function isChunkLoadError(error: unknown): boolean {
  const msg = String((error as Error)?.message || error || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically imported module/i.test(
    msg
  );
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence against a blank white page.
 * - After a new deploy, a visitor with an old page open may request chunks that no longer exist:
 *   we reload once automatically (guarded so it can never loop).
 * - Any other render error shows a short message with a reload button and the direct contacts.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Unhandled UI error:', error);
    if (isChunkLoadError(error)) {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
        if (Date.now() - last > 30000) {
          sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
          window.location.reload();
        }
      } catch {
        // Storage unavailable: show the manual reload screen instead.
      }
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const updated = isChunkLoadError(this.state.error);
    const t = boundaryText();
    return (
      <div role="alert" className="min-h-screen flex items-center justify-center bg-concrete px-6">
        <div className="max-w-md w-full rounded-2xl bg-white p-8 text-center shadow-sm border border-line">
          <h1 className="text-xl font-bold text-night">{updated ? t.updatedTitle : t.errorTitle}</h1>
          <p className="mt-3 text-[15px] text-slate-600 leading-relaxed">
            {updated ? t.updatedBody : t.errorBody}
          </p>
          <button type="button" onClick={() => window.location.reload()} className="btn btn-primary mt-6">
            {t.reload}
          </button>
        </div>
      </div>
    );
  }
}
