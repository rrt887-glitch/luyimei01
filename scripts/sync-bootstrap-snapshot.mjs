#!/usr/bin/env node
/**
 * Syncs the live public catalog (`products`, `site_config/categories`, `site_config/contact`)
 * from Firestore into `public/bootstrap-snapshot.json` so static Hosting deployments also
 * carry an up-to-date same-origin fallback snapshot.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const cfgPath = path.join(rootDir, 'firebase-applet-config.json');
const outPath = path.join(rootDir, 'public', 'bootstrap-snapshot.json');

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

async function main() {
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const projectId = cfg.projectId;
    const dbId = cfg.firestoreDatabaseId || '(default)';
    const apiKey = cfg.apiKey || '';
    const baseDocsUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/databases/${encodeURIComponent(dbId)}/documents`;
    const keyParam = apiKey ? `?key=${encodeURIComponent(apiKey)}` : '';

    const [prodRes, catRes, contactRes] = await Promise.all([
      fetch(`${baseDocsUrl}:runQuery${keyParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'products' }]
          }
        })
      }),
      fetch(`${baseDocsUrl}/site_config/categories${keyParam}`),
      fetch(`${baseDocsUrl}/site_config/contact${keyParam}`)
    ]);

    if (!prodRes.ok) {
      throw new Error(`Firestore REST :runQuery returned ${prodRes.status}`);
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

    const snapshot = {
      ok: true,
      products,
      categories,
      contact,
      ts: new Date().toISOString()
    };

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(snapshot), 'utf8');
    console.log(
      `[sync-bootstrap-snapshot] Synced ${products.length} product records, ${
        categories ? categories.length : 0
      } categories to public/bootstrap-snapshot.json`
    );
  } catch (err) {
    console.warn('[sync-bootstrap-snapshot] Skipped live sync (keeping existing snapshot if present):', err?.message || err);
  }
}

main();
