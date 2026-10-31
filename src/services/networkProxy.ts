/**
 * Same-Origin Cloud Gateway & Network Proxy Client
 *
 * Why this exists:
 *   In mainland China (without a VPN), mobile and desktop browsers can reach the custom domain
 *   (`lymeik.com` / `www.lymeik.com` on Firebase Hosting CDN) directly, but direct browser connections
 *   to `*.googleapis.com` (`firestore.googleapis.com`, `identitytoolkit.googleapis.com`,
 *   `securetoken.googleapis.com`, `firebasestorage.googleapis.com`) and `*.cloudfunctions.net`
 *   time out or are blocked.
 *
 *   By routing these requests through same-origin `/__api/*` (backed by the `apiGateway` Cloud Function
 *   via Firebase Hosting rewrites and `server.js` in Cloud Run), all authentication, Firestore reads/writes,
 *   callable functions, and product media work transparently on domestic mobile networks without a VPN.
 */

export interface BootstrapSnapshot {
  ok: boolean;
  products?: Record<string, any>[];
  categories?: Record<string, any>[] | null;
  contact?: Record<string, any> | null;
  ts?: string;
}

const FIREBASE_STORAGE_ORIGIN = 'https://firebasestorage.googleapis.com';
const PROXY_STORAGE_PREFIX = '/__api/storage';

let gatewayStatus: 'unknown' | 'available' | 'unavailable' = 'unknown';
let proxyInstalled = false;
let bootstrapPromise: Promise<BootstrapSnapshot | null> | null = null;

/** Rewrite a target Google/Firebase URL to a same-origin `/__api/...` URL if applicable. */
export function rewriteGoogleApiUrl(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  if (host === 'identitytoolkit.googleapis.com') {
    return `${origin}/__api/auth${parsed.pathname}${parsed.search}`;
  }

  if (host === 'securetoken.googleapis.com') {
    return `${origin}/__api/token${parsed.pathname}${parsed.search}`;
  }

  if (host === 'firestore.googleapis.com') {
    // Force non-streaming buffered polling (CI=1) on WebChannel Listen/Write channels so Firebase Hosting
    // and Cloud Run reverse proxies return responses immediately instead of buffering a hanging stream.
    if (parsed.pathname.endsWith('/Listen/channel') || parsed.pathname.endsWith('/Write/channel')) {
      if (parsed.searchParams.get('CI') === '0' || !parsed.searchParams.has('CI')) {
        parsed.searchParams.set('CI', '1');
      }
    }
    return `${origin}/__api/firestore${parsed.pathname}${parsed.search}`;
  }

  if (host === 'firebasestorage.googleapis.com') {
    return `${origin}/__api/storage${parsed.pathname}${parsed.search}`;
  }

  if (host.endsWith('.cloudfunctions.net')) {
    return `${origin}/__api/functions${parsed.pathname}${parsed.search}`;
  }

  return null;
}

/**
 * Converts a `https://firebasestorage.googleapis.com/...` URL into a same-origin `/__api/storage/...`
 * URL so `<img>` and `<video>` elements load in domestic China mobile browsers without a VPN.
 */
export function toAccessibleMediaUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (typeof window === 'undefined' || gatewayStatus === 'unavailable') {
    return url;
  }
  if (url.startsWith(`${FIREBASE_STORAGE_ORIGIN}/`)) {
    return `${PROXY_STORAGE_PREFIX}${url.slice(FIREBASE_STORAGE_ORIGIN.length)}`;
  }
  return url;
}

/**
 * Restores a proxied `/__api/storage/...` URL back to its canonical `https://firebasestorage.googleapis.com/...`
 * form before persisting to Firestore or passing to server-side Storage cleanup.
 */
export function toCanonicalStorageUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith(`${PROXY_STORAGE_PREFIX}/`)) {
    return `${FIREBASE_STORAGE_ORIGIN}${url.slice(PROXY_STORAGE_PREFIX.length)}`;
  }
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (parsed.pathname.startsWith(`${PROXY_STORAGE_PREFIX}/`)) {
      return `${FIREBASE_STORAGE_ORIGIN}${parsed.pathname.slice(PROXY_STORAGE_PREFIX.length)}${parsed.search}`;
    }
  } catch {
    // ignore
  }
  return url;
}

/**
 * Safely installs a custom `fetch` implementation onto a target window/global object even when
 * `fetch` is defined on `window` or `Window.prototype` as a getter-only property (e.g. inside
 * sandboxed preview iframes). Never throws if the property is non-configurable.
 */
export function safelyInstallWindowFetch(
  target: Record<string, any>,
  patchedFetch: typeof fetch
): boolean {
  try {
    Object.defineProperty(target, 'fetch', {
      value: patchedFetch,
      configurable: true,
      writable: true,
      enumerable: true
    });
    if (target.fetch === patchedFetch) {
      return true;
    }
  } catch {
    // Fallback to direct assignment below
  }

  try {
    target.fetch = patchedFetch;
    return target.fetch === patchedFetch;
  } catch {
    return false;
  }
}

/**
 * Installs transparent `window.fetch` and `XMLHttpRequest` interceptors so Firebase Auth,
 * Firestore, Storage, and Functions SDK requests route through `/__api/*` on the same origin.
 */
export function installFirebaseNetworkProxy(): void {
  if (proxyInstalled || typeof window === 'undefined') return;
  // Skip in local emulator / test environments if needed
  if (typeof process !== 'undefined' && process.env?.VITEST) return;
  proxyInstalled = true;

  if (typeof window.fetch === 'function') {
    const nativeFetch = window.fetch.bind(window);

    const patchedFetch: typeof window.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      if (gatewayStatus === 'unavailable') {
        return nativeFetch(input, init);
      }

      const originalUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : typeof Request !== 'undefined' && input instanceof Request
              ? input.url
              : '';

      const proxiedUrl = rewriteGoogleApiUrl(originalUrl);
      if (!proxiedUrl) {
        return nativeFetch(input, init);
      }

      try {
        let proxyInput: RequestInfo | URL = proxiedUrl;
        let proxyInit = init;

        if (typeof Request !== 'undefined' && input instanceof Request && !init) {
          const cloned = input.clone();
          const headers = new Headers(cloned.headers);
          const bodyAllowed = cloned.method !== 'GET' && cloned.method !== 'HEAD';
          const body = bodyAllowed ? await cloned.arrayBuffer() : undefined;
          proxyInput = proxiedUrl;
          proxyInit = {
            method: cloned.method,
            headers,
            body,
            credentials: 'same-origin',
            mode: 'same-origin',
            signal: cloned.signal
          };
        }

        const res = await nativeFetch(proxyInput, proxyInit);
        const isGatewayResponse = res.headers.get('x-lym-gateway') === '1';
        const contentType = (res.headers.get('content-type') || '').toLowerCase();

        // If Firebase Hosting returned the SPA index.html fallback or a non-gateway 404 (meaning
        // `apiGateway` has not been deployed yet), mark gateway unavailable and retry directly.
        if (!isGatewayResponse && (contentType.includes('text/html') || res.status === 404)) {
          gatewayStatus = 'unavailable';
          return nativeFetch(input, init);
        }

        if (isGatewayResponse) {
          gatewayStatus = 'available';
        }
        return res;
      } catch (err) {
        // If same-origin fetch failed before gateway was confirmed, fall back to native fetch
        if (gatewayStatus === 'unknown') {
          return nativeFetch(input, init);
        }
        throw err;
      }
    };

    safelyInstallWindowFetch(window as unknown as Record<string, any>, patchedFetch);
  }

  // Intercept XMLHttpRequest for Firestore WebChannel & Firebase Storage resumable uploads
  try {
    if (typeof XMLHttpRequest !== 'undefined' && XMLHttpRequest.prototype?.open) {
      const nativeXhrOpen = XMLHttpRequest.prototype.open;
      const patchedXhrOpen = function (
        this: XMLHttpRequest,
        method: string,
        url: string | URL,
        async?: boolean,
        username?: string | null,
        password?: string | null
      ) {
        let targetUrl: string | URL = url;
        if (gatewayStatus !== 'unavailable') {
          const raw = typeof url === 'string' ? url : url?.toString?.() || '';
          const proxied = rewriteGoogleApiUrl(raw);
          if (proxied) {
            targetUrl = proxied;
          }
        }
        return nativeXhrOpen.call(
          this,
          method,
          targetUrl,
          async !== undefined ? async : true,
          username ?? undefined,
          password ?? undefined
        );
      };

      try {
        Object.defineProperty(XMLHttpRequest.prototype, 'open', {
          value: patchedXhrOpen,
          configurable: true,
          writable: true
        });
      } catch {
        XMLHttpRequest.prototype.open = patchedXhrOpen;
      }
    }
  } catch {
    // Ignore if host environment locks XMLHttpRequest.prototype
  }
}

/**
 * Fetches the live public catalog & site config snapshot (`products`, `categories`, `contact`)
 * from same-origin `GET /__api/bootstrap`. Deduplicated across callers during startup.
 */
export function fetchBootstrapSnapshot(forceRefresh = false): Promise<BootstrapSnapshot | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (typeof process !== 'undefined' && process.env?.VITEST) return Promise.resolve(null);
  if (gatewayStatus === 'unavailable' && !forceRefresh) return Promise.resolve(null);

  if (!bootstrapPromise || forceRefresh) {
    bootstrapPromise = (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6500);
      try {
        const res = await window.fetch(`/__api/bootstrap?_t=${Date.now()}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: ctrl.signal
        });
        const isGateway = res.headers.get('x-lym-gateway') === '1';
        const contentType = (res.headers.get('content-type') || '').toLowerCase();

        if (!isGateway && contentType.includes('text/html')) {
          gatewayStatus = 'unavailable';
          return null;
        }
        if (isGateway) {
          gatewayStatus = 'available';
        }
        if (!res.ok) return null;

        const data = (await res.json()) as BootstrapSnapshot;
        if (data && data.ok) {
          return data;
        }
        return null;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    })();
  }
  return bootstrapPromise;
}
