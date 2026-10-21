/**
 * Cross-file configuration consistency.
 *
 * A few values cannot be imported everywhere (security rules and firebase.json are not TypeScript),
 * so they are duplicated on purpose. These tests fail the build as soon as one copy drifts.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import appletConfig from '../firebase-applet-config.json';
import { STAFF_AUTH_EMAIL_DOMAIN, FIRESTORE_DATABASE_ID, FUNCTIONS_REGION } from '../src/config/appConfig';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Named Firestore database ID is identical everywhere', () => {
  const dbId = appletConfig.firestoreDatabaseId;

  it('firebase-applet-config.json defines a named database', () => {
    expect(dbId).toBeTruthy();
    expect(dbId).not.toBe('(default)');
    expect(FIRESTORE_DATABASE_ID).toBe(dbId);
  });

  it('firebase.json deploys rules to the same database', () => {
    const firebaseJson = JSON.parse(read('firebase.json'));
    // Two databases: the site's named database, and (default) holding only upload grants.
    const dbs = firebaseJson.firestore as { database: string; rules: string }[];
    expect(Array.isArray(dbs)).toBe(true);
    expect(dbs.find(d => d.database === dbId)?.rules).toBe('firestore.rules');
    expect(dbs.find(d => d.database === '(default)')?.rules).toBe('firestore.default.rules');
    expect(read('firestore.default.rules')).toMatch(/allow read, write: if false;/);
    expect(firebaseJson.storage?.rules).toBe('storage.rules');
  });

  it('storage.rules look up only the upload grants in the (default) database', () => {
    // Cross-service rules can read the (default) database only; the functions write the grants there.
    const storageRules = read('storage.rules');
    const paths = Array.from(storageRules.matchAll(/\/databases\/([^/]+)\/documents\/([a-z_]+)\//g)).map(m => `${m[1]}/${m[2]}`);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p).toBe('(default)/upload_grants');
    expect(read('functions/src/index.ts')).toContain("collection('upload_grants')");
  });

  it('Cloud Functions and the admin bootstrap script use the same database', () => {
    expect(read('functions/src/index.ts')).toContain(`'${dbId}'`);
    expect(read('scripts/init-super-admin.mjs')).toContain('firestoreDatabaseId');
  });
});

describe('Configuration points at the live project, not just at itself', () => {
  // Consistency alone passes when every copy is changed to the same wrong value. These compare
  // against the separately kept record of the production project.
  const production = JSON.parse(read('tests/firebase.production.json'));

  it('database ID is the production database', () => {
    expect(appletConfig.firestoreDatabaseId).toBe(production.firestoreDatabaseId);
  });

  it('project ID is the production project in every file', () => {
    expect(appletConfig.projectId).toBe(production.projectId);
    expect(JSON.parse(read('.firebaserc')).projects?.default).toBe(production.projectId);
    expect(appletConfig.authDomain).toBe(`${production.projectId}.firebaseapp.com`);
    expect(appletConfig.storageBucket.startsWith(production.projectId)).toBe(true);
  });
});

describe('Staff auth email domain is identical in frontend and Cloud Functions', () => {
  it('functions/src/index.ts uses STAFF_AUTH_EMAIL_DOMAIN', () => {
    expect(read('functions/src/index.ts')).toContain(`STAFF_AUTH_EMAIL_DOMAIN = '${STAFF_AUTH_EMAIL_DOMAIN}'`);
  });
});

describe('Cloud Functions region is identical in frontend and backend', () => {
  it('functions/src/index.ts deploys to FUNCTIONS_REGION', () => {
    expect(read('functions/src/index.ts')).toContain(`FUNCTIONS_REGION = '${FUNCTIONS_REGION}'`);
  });
});

describe('Functions build configuration', () => {
  it('functions/ can be built and deployed', () => {
    expect(fs.existsSync(path.join(root, 'functions/tsconfig.json'))).toBe(true);
    const pkg = JSON.parse(read('functions/package.json'));
    expect(pkg.main).toBe('lib/index.js');
    expect(pkg.scripts?.build).toBeTruthy();
  });

  it('functions use a Node.js runtime that Google still accepts (Node 20 is decommissioned 2026-10-30)', () => {
    const pkg = JSON.parse(read('functions/package.json'));
    expect(Number(pkg.engines?.node)).toBeGreaterThanOrEqual(22);
  });
});

describe('Product category ids follow one pattern everywhere', () => {
  it('firestore.rules and src/config/categories.ts agree, and the built-ins match it', () => {
    const rulesPattern = read('firestore.rules').match(/data\.type\.matches\('([^']+)'\)/)?.[1];
    const codePattern = read('src/config/categories.ts').match(/CATEGORY_ID_PATTERN = \/(.+)\/;/)?.[1];
    expect(rulesPattern).toBeTruthy();
    expect(codePattern).toBe(rulesPattern);
    const re = new RegExp(rulesPattern!);
    for (const id of ['material', 'equipment', 'c-1a2b3c']) expect(re.test(id)).toBe(true);
    for (const id of ['', 'Material', 'a b', '-x']) expect(re.test(id)).toBe(false);
  });
});

describe('Buyer sign-up goes through the captcha functions', () => {
  it('functions export getSignupCaptcha and registerBuyer, and the website calls them', () => {
    const fn = read('functions/src/index.ts');
    expect(fn).toContain('export const getSignupCaptcha');
    expect(fn).toContain('export const registerBuyer');
    // The picture must not carry its answer as text.
    expect(fn).not.toMatch(/<text[\s>]/);
    const api = read('src/services/api.ts');
    expect(api).toContain("'getSignupCaptcha'");
    expect(api).toContain("'registerBuyer'");
    expect(api).not.toContain('createUserWithEmailAndPassword');
  });
});

describe('HTTP security response headers are configured across Firebase Hosting, Vite, and Cloud Run server.js', () => {
  it('src/config/securityHeaders.ts, server.js, and firebase.json define the same security headers', async () => {
    const { SECURITY_HEADERS } = await import('../src/config/securityHeaders');
    const serverMod = await import('../server.js');
    expect(serverMod.SECURITY_HEADERS).toEqual(SECURITY_HEADERS);

    const firebaseJson = JSON.parse(read('firebase.json'));
    const globalRule = firebaseJson.hosting?.headers?.find((h: { source: string }) => h.source === '**');
    expect(globalRule).toBeTruthy();
    const firebaseHeaders = Object.fromEntries(
      (globalRule.headers as { key: string; value: string }[]).map(h => [h.key, h.value])
    );
    expect(firebaseHeaders).toEqual(SECURITY_HEADERS);

    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts?.start).toBe('node server.js');
    expect(read('vite.config.ts')).toContain('headers: SECURITY_HEADERS');
  });

  it('server.js attaches all security headers and proper Cache-Control on HTTP responses', async () => {
    const os = await import('node:os');
    const { createAppServer, SECURITY_HEADERS } = await import('../server.js');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lym-srv-'));
    fs.mkdirSync(path.join(tmpDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<!doctype html><title>LYM</title>');
    fs.writeFileSync(path.join(tmpDir, 'assets/app-123.js'), 'console.log(1);');

    const srv = createAppServer(tmpDir);
    await new Promise<void>(resolve => srv.listen(0, '127.0.0.1', resolve));
    const addr = srv.address() as { port: number };
    const base = `http://127.0.0.1:${addr.port}`;

    try {
      const htmlRes = await fetch(`${base}/`);
      expect(htmlRes.status).toBe(200);
      expect(htmlRes.headers.get('cache-control')).toBe('no-cache');
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        expect(htmlRes.headers.get(key.toLowerCase())).toBe(value);
      }

      const assetRes = await fetch(`${base}/assets/app-123.js`);
      expect(assetRes.status).toBe(200);
      expect(assetRes.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect(assetRes.headers.get('x-content-type-options')).toBe('nosniff');
      expect(assetRes.headers.get('strict-transport-security')).toContain('max-age=31536000');
    } finally {
      await new Promise<void>(resolve => srv.close(() => resolve()));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('package-lock.json installs on every platform', () => {
  // Tools that regenerate the lock on one machine (e.g. Linux only) can drop the optional native
  // packages of other platforms; npm 11 then refuses `npm ci` ("Missing: … from lock file").
  it('keeps the optional native builds for Windows, macOS and Linux', () => {
    const lock = JSON.parse(read('package-lock.json'));
    const pkgs = Object.keys(lock.packages || {});
    for (const name of [
      '@rolldown/binding-win32-x64-msvc',
      '@rolldown/binding-darwin-arm64',
      '@rolldown/binding-linux-x64-gnu',
      '@tailwindcss/oxide-win32-x64-msvc',
      '@tailwindcss/oxide-darwin-arm64',
      '@tailwindcss/oxide-linux-x64-gnu'
    ]) {
      expect(pkgs.some(p => p.endsWith(`node_modules/${name}`)), `${name} missing from package-lock.json — regenerate it with npm 11: npm install --package-lock-only`).toBe(true);
    }
  });
});

