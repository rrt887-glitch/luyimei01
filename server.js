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

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.end('Method Not Allowed');
      return;
    }

    let decodedPath;
    try {
      const requestUrl = new URL(req.url || '/', 'http://localhost');
      decodedPath = decodeURIComponent(requestUrl.pathname);
    } catch {
      res.statusCode = 400;
      res.end('Bad Request');
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
