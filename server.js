/**
 * Production HTTP server for AI Studio / Cloud Run deployments (`npm start` -> `node server.js`).
 *
 * Why this file exists:
 *   When a project has no `server.js` and no `"start"` script in `package.json`, AI Studio packages
 *   `dist/` with a built-in static shim that only sets `Content-Type`, `Last-Modified`, and
 *   `Cache-Control`, omitting all HTTP security headers (`Strict-Transport-Security`,
 *   `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `CSP`).
 *   Providing `server.js` + `"start": "node server.js"` makes Cloud Run serve `dist/` through this
 *   server so every HTTP response carries the full set of security headers.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const firebaseAppletConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8')
);
const FIREBASE_PROJECT_ID = firebaseAppletConfig.projectId || 'gen-lang-client-0359861747';
const FIRESTORE_DB_ID =
  firebaseAppletConfig.firestoreDatabaseId || 'ai-studio-e08ae01c-ee86-49b6-9f67-2c784ec195ad';
const FIREBASE_API_KEY = firebaseAppletConfig.apiKey || '';
const FUNCTIONS_REGION = 'us-central1';

export const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy':
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://*.google.com https://localhost.corp.google.com:26001",
  'Content-Security-Policy-Report-Only':
    "default-src 'self'; script-src 'self' https://www.google.com https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src 'self' data:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net https://*.run.app https://firebasestorage.googleapis.com https://www.google.com wss://*.firebaseio.com; frame-src https://www.google.com https://*.firebaseapp.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm'
};

const COMPRESSIBLE_EXTS = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.txt', '.csv', '.json', '.map', '.xml', '.svg']);

function applySecurityHeaders(res) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }
}

function decodeFirestoreRestValue(val) {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const values = val.arrayValue?.values;
    return Array.isArray(values) ? values.map(decodeFirestoreRestValue) : [];
  }
  if ('mapValue' in val) {
    return decodeFirestoreRestFields(val.mapValue?.fields);
  }
  return undefined;
}

function decodeFirestoreRestFields(fields) {
  if (!fields || typeof fields !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeFirestoreRestValue(v);
  }
  return out;
}

function decodeFirestoreRestDoc(docJson) {
  if (!docJson || !docJson.fields) return null;
  const data = decodeFirestoreRestFields(docJson.fields);
  const nameParts = String(docJson.name || '').split('/');
  const docId = nameParts[nameParts.length - 1];
  if (docId && !data.id) data.id = docId;
  return data;
}

const FORWARDED_REQ_HEADERS = new Set([
  'content-type',
  'authorization',
  'accept',
  'accept-language',
  'range',
  'x-forwarded-for',
  'x-http-session-id',
  'x-firebase-locale',
  'x-firebase-gmpid',
  'x-firebase-client',
  'x-firebase-appcheck'
]);

function shouldForwardReqHeader(name) {
  const lower = name.toLowerCase();
  if (FORWARDED_REQ_HEADERS.has(lower)) return true;
  return lower.startsWith('x-goog-') || lower.startsWith('x-firebase-') || lower.startsWith('x-client-');
}

function shouldForwardResHeader(name) {
  const lower = name.toLowerCase();
  if (
    lower === 'content-type' ||
    lower === 'cache-control' ||
    lower === 'etag' ||
    lower === 'last-modified' ||
    lower === 'x-http-session-id' ||
    lower === 'x-guploader-uploadid' ||
    lower === 'content-range' ||
    lower === 'accept-ranges' ||
    lower === 'location'
  ) {
    return true;
  }
  return lower.startsWith('x-goog-') || lower.startsWith('x-firebase-');
}

function readRequestBodyBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function handleApiGatewayRequest(req, res) {
  res.setHeader('x-lym-gateway', '1');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const subPath = parsedUrl.pathname.replace(/^\/__api(?=\/|$)/, '') || '/';

  if (subPath === '/bootstrap' && (req.method === 'GET' || req.method === 'HEAD')) {
    try {
      const baseDocsUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        FIREBASE_PROJECT_ID
      )}/databases/${encodeURIComponent(FIRESTORE_DB_ID)}/documents`;
      const keyParam = FIREBASE_API_KEY ? `key=${encodeURIComponent(FIREBASE_API_KEY)}` : '';

      const [prodRes, catRes, contactRes] = await Promise.all([
        fetch(`${baseDocsUrl}:runQuery${keyParam ? `?${keyParam}` : ''}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId: 'products' }]
            }
          })
        }),
        fetch(`${baseDocsUrl}/site_config/categories${keyParam ? `?${keyParam}` : ''}`),
        fetch(`${baseDocsUrl}/site_config/contact${keyParam ? `?${keyParam}` : ''}`)
      ]);

      if (!prodRes.ok) {
        throw new Error(`Firestore REST products status ${prodRes.status}`);
      }

      const prodRows = await prodRes.json();
      const products = Array.isArray(prodRows)
        ? prodRows
            .map(row => (row && row.document ? decodeFirestoreRestDoc(row.document) : null))
            .filter(Boolean)
        : [];

      let categories = null;
      if (catRes.ok) {
        const catDoc = decodeFirestoreRestDoc(await catRes.json());
        categories = Array.isArray(catDoc?.items) ? catDoc.items : null;
      }

      let contact = null;
      if (contactRes.ok) {
        contact = decodeFirestoreRestDoc(await contactRes.json());
      }

      const body = JSON.stringify({
        ok: true,
        products,
        categories,
        contact,
        ts: new Date().toISOString()
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=5, s-maxage=10, stale-while-revalidate=30');
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ ok: false, error: 'bootstrap_failed' }));
      return;
    }
  }

  let upstreamOrigin = '';
  let upstreamPath = '';

  if (subPath.startsWith('/auth/')) {
    upstreamOrigin = 'https://identitytoolkit.googleapis.com';
    upstreamPath = subPath.slice('/auth'.length);
  } else if (subPath.startsWith('/token/')) {
    upstreamOrigin = 'https://securetoken.googleapis.com';
    upstreamPath = subPath.slice('/token'.length);
  } else if (subPath.startsWith('/firestore/')) {
    upstreamOrigin = 'https://firestore.googleapis.com';
    upstreamPath = subPath.slice('/firestore'.length);
    if (upstreamPath.endsWith('/Listen/channel') || upstreamPath.endsWith('/Write/channel')) {
      if (parsedUrl.searchParams.get('CI') === '0' || !parsedUrl.searchParams.has('CI')) {
        parsedUrl.searchParams.set('CI', '1');
      }
    }
  } else if (subPath.startsWith('/storage/')) {
    upstreamOrigin = 'https://firebasestorage.googleapis.com';
    upstreamPath = subPath.slice('/storage'.length);
    const storageObjMatch = upstreamPath.match(/^(\/v0\/b\/[^/]+\/o\/)(.+)$/);
    if (storageObjMatch && storageObjMatch[2].includes('/')) {
      try {
        upstreamPath = `${storageObjMatch[1]}${encodeURIComponent(decodeURIComponent(storageObjMatch[2]))}`;
      } catch {
        upstreamPath = `${storageObjMatch[1]}${storageObjMatch[2].split('/').map(encodeURIComponent).join('%2F')}`;
      }
    }
  } else if (subPath.startsWith('/functions/')) {
    upstreamOrigin = `https://${FUNCTIONS_REGION}-${FIREBASE_PROJECT_ID}.cloudfunctions.net`;
    upstreamPath = subPath.slice('/functions'.length);
  } else {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'not_found' }));
    return;
  }

  const targetUrl = `${upstreamOrigin}${upstreamPath}${parsedUrl.search}`;
  const forwardHeaders = {};
  for (const [key, val] of Object.entries(req.headers || {})) {
    if (!val || !shouldForwardReqHeader(key)) continue;
    forwardHeaders[key] = Array.isArray(val) ? val.join(', ') : String(val);
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let bodyBuf;
  if (hasBody) {
    bodyBuf = await readRequestBodyBuffer(req);
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: hasBody && bodyBuf && bodyBuf.length > 0 ? bodyBuf : undefined
    });

    res.statusCode = upstreamRes.status;
    upstreamRes.headers.forEach((value, key) => {
      if (!shouldForwardResHeader(key)) return;
      if (
        (key.toLowerCase() === 'location' || key.toLowerCase() === 'x-goog-upload-url') &&
        value.startsWith('https://firebasestorage.googleapis.com/')
      ) {
        res.setHeader(key, `/__api/storage/${value.slice('https://firebasestorage.googleapis.com/'.length)}`);
      } else {
        res.setHeader(key, value);
      }
    });

    if (!res.getHeader('Cache-Control') && !subPath.startsWith('/storage/')) {
      res.setHeader('Cache-Control', 'no-store');
    }

    const buf = Buffer.from(await upstreamRes.arrayBuffer());
    res.end(buf);
  } catch {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'bad_gateway' }));
  }
}

async function getFileStats(filePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    return stats.isFile() ? stats : null;
  } catch {
    return null;
  }
}

export function createAppServer(rootDir = path.join(__dirname, 'dist')) {
  const resolvedRoot = path.resolve(rootDir);

  return http.createServer(async (req, res) => {
    applySecurityHeaders(res);

    let decodedPath;
    try {
      const requestUrl = new URL(req.url || '/', 'http://localhost');
      decodedPath = decodeURIComponent(requestUrl.pathname);
    } catch {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    if (decodedPath === '/__api' || decodedPath.startsWith('/__api/')) {
      await handleApiGatewayRequest(req, res);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.end('Method Not Allowed');
      return;
    }

    if (decodedPath.includes('\0')) {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    const absolutePath = path.resolve(resolvedRoot, '.' + (decodedPath.startsWith('/') ? decodedPath : '/' + decodedPath));
    if (absolutePath !== resolvedRoot && !absolutePath.startsWith(resolvedRoot + path.sep)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    const serveFile = (filePath, stats, statusCode = 200) => {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);

      const mtime = stats.mtime.toUTCString();
      res.setHeader('Last-Modified', mtime);

      if (decodedPath.startsWith('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (ext === '.html' || ext === '.htm' || ext === '.json') {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }

      if (statusCode === 200 && req.headers['if-modified-since'] === mtime) {
        res.statusCode = 304;
        res.end();
        return;
      }

      res.statusCode = statusCode;
      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const acceptEncoding = String(req.headers['accept-encoding'] || '');
      const shouldGzip = COMPRESSIBLE_EXTS.has(ext) && /\bgzip\b/i.test(acceptEncoding);
      if (shouldGzip) {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
      }

      const stream = fs.createReadStream(filePath);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end('Internal Server Error');
        } else {
          res.destroy();
        }
      });

      if (shouldGzip) {
        stream.pipe(zlib.createGzip({ level: 6 })).pipe(res);
      } else {
        res.setHeader('Content-Length', stats.size);
        stream.pipe(res);
      }
    };

    try {
      // 1. Exact file match
      let stats = await getFileStats(absolutePath);
      if (stats) return serveFile(absolutePath, stats);

      // 2. Directory index
      const dirIndexPath = path.join(absolutePath, 'index.html');
      stats = await getFileStats(dirIndexPath);
      if (stats) return serveFile(dirIndexPath, stats);

      // 3. Missing static asset with file extension -> 404
      if (path.extname(absolutePath)) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end('Not Found');
        return;
      }

      // 4. SPA fallback -> dist/index.html
      const spaIndexPath = path.join(resolvedRoot, 'index.html');
      stats = await getFileStats(spaIndexPath);
      if (stats) return serveFile(spaIndexPath, stats, 200);

      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not Found');
    } catch {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Internal Server Error');
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    console.log('dist/index.html not found; running npm run build before starting server...');
    execFileSync('npm', ['run', 'build'], { cwd: __dirname, stdio: 'inherit' });
  }
  const port = Number(process.env.PORT) || 3000;
  const server = createAppServer(distDir);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}
