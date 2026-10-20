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
    expect(firebaseJson.firestore?.database).toBe(dbId);
    expect(firebaseJson.firestore?.rules).toBe('firestore.rules');
    expect(firebaseJson.storage?.rules).toBe('storage.rules');
  });

  it('storage.rules cross-service lookups (if any) target the same database', () => {
    // storage.rules currently decides from custom claims only; any lookup added later must use dbId.
    const storageRules = read('storage.rules');
    const ids = Array.from(storageRules.matchAll(/\/databases\/([^/]+)\/documents/g)).map(m => m[1]);
    for (const id of ids) {
      expect(id).toBe(dbId);
    }
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
