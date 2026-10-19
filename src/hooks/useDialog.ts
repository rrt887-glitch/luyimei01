import { useEffect, useRef } from 'react';

/**
 * Shared behaviour for every overlay (dialog, drawer, lightbox, menu):
 *  - Esc closes the TOPMOST open overlay only. A modal opened from a drawer closes first, then the
 *    drawer on the next Esc press.
 *  - Page scroll is locked while at least one locking overlay is open, and restored after the last.
 *
 * Inputs that use Esc themselves (an inline editor, an IME composition) call `preventDefault()`
 * and are left alone.
 */
type Entry = { close: { current: () => void }; lock: boolean };

const stack: Entry[] = [];
let savedOverflow: string | null = null;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' && e.key !== 'Esc') return;
  if (e.defaultPrevented || e.isComposing) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  top.close.current();
}

function syncScrollLock() {
  const shouldLock = stack.some(entry => entry.lock);
  if (shouldLock && savedOverflow === null) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  } else if (!shouldLock && savedOverflow !== null) {
    document.body.style.overflow = savedOverflow;
    savedOverflow = null;
  }
}

export function useDialog(open: boolean, onClose: () => void, options: { lockScroll?: boolean } = {}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const lock = options.lockScroll !== false;

  useEffect(() => {
    if (!open) return;
    const entry: Entry = { close: closeRef, lock };
    if (stack.length === 0) document.addEventListener('keydown', onKeyDown);
    stack.push(entry);
    syncScrollLock();
    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      if (stack.length === 0) document.removeEventListener('keydown', onKeyDown);
      syncScrollLock();
    };
  }, [open, lock]);
}
