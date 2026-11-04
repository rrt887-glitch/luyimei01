/**
 * Lazy access to Firebase (Firestore ~140 kB gz + Auth ~27 kB gz).
 *
 * The public website paints from the cached bootstrap snapshot, so it does not need the SDK for
 * its first screen. `fb()` loads it on first use (a form submit, a sign-in, the console); the
 * live listeners started through `lazySub` wait until the page is idle, then load it.
 */
type FirebaseCore = typeof import('./firebaseCore');

let loading: Promise<FirebaseCore> | null = null;
let loaded: FirebaseCore | null = null;

export function fb(): Promise<FirebaseCore> {
  if (!loading) {
    loading = import('./firebaseCore').then(
      m => (loaded = m),
      err => {
        loading = null; // a failed chunk download can be retried
        throw err;
      }
    );
  }
  return loading;
}

/** The SDK if it has already loaded, else null (no Firebase user can exist before it loads). */
export function fbNow(): FirebaseCore | null {
  return loaded;
}

/** The signed-in Firebase user right now, or null. Synchronous. */
export function currentFirebaseUser() {
  return loaded?.auth.currentUser ?? null;
}

let idleGate: Promise<void> | null = null;
/** Resolves once the first screen has had a chance to paint (or at once if the SDK is already here). */
function afterIdle(): Promise<void> {
  if (loaded || typeof window === 'undefined') return Promise.resolve();
  if (!idleGate) {
    idleGate = new Promise(resolve => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      const go = () => (w.requestIdleCallback ? w.requestIdleCallback(() => resolve(), { timeout: 2500 }) : setTimeout(resolve, 800));
      if (document.readyState === 'complete') go();
      else window.addEventListener('load', go, { once: true });
    });
  }
  return idleGate;
}

/**
 * Starts a Firebase subscription once the SDK is available and returns its unsubscribe at once.
 * `deferred` (the default) waits for the page to be idle first; pass false when the user is waiting.
 */
export function lazySub(start: (m: FirebaseCore) => (() => void) | void, deferred = true): () => void {
  let cancelled = false;
  let unsub: (() => void) | void;
  (deferred ? afterIdle() : Promise.resolve())
    .then(() => fb())
    .then(m => {
      if (!cancelled) unsub = start(m);
    })
    .catch(err => console.warn('Firebase failed to load:', err));
  return () => {
    cancelled = true;
    if (typeof unsub === 'function') unsub();
  };
}
