import { Product } from '../types';
import { initialProducts, BUNDLED_IMAGES } from '../data/products';
import { db, auth } from './firebase';
import { collection, doc, setDoc, onSnapshot, getDocs, writeBatch } from 'firebase/firestore';
import { sanitizeProductForFirestore } from '../utils/firestoreSanitizer';

/**
 * Single Read-Only Local Cache Key:
 * Firestore `products` collection is the Single Source of Truth.
 * Local storage is used strictly as a lightweight read-only cache for instant cold start or offline viewing.
 */
const READONLY_CACHE_KEY = 'lym_products_readonly_cache_v3';
const FIRESTORE_PRODUCTS_COLLECTION = 'products';
const FIRESTORE_WRITE_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms = FIRESTORE_WRITE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`云端数据库写入响应超时（${Math.round(ms / 1000)}秒），请检查网络连接后重试。`));
    }, ms);
    promise.then(
      val => {
        clearTimeout(timer);
        resolve(val);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function isLegacyPlaceholderMediaUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return (
    url.includes('commondatastorage.googleapis.com/gtv-videos-bucket/sample') ||
    url.includes('images.unsplash.com') ||
    url.includes('picsum.photos')
  );
}

/** Old hashed URL of a bundled photo → the photo's current URL (other URLs unchanged). */
function currentBundledUrl(url: string): string {
  const m = /\/assets\/([a-z_]+?)_\d{10,}[^/]*\.(?:jpe?g|webp)$/.exec(url || '');
  return (m && BUNDLED_IMAGES[m[1]]) || url;
}

function cleanProductMediaPlaceholders(product: Product, fallbackProduct?: Product): Product {
  const cleanImages = Array.isArray(product.images)
    ? product.images.filter(img => img && !isLegacyPlaceholderMediaUrl(img)).map(currentBundledUrl)
    : [];

  const finalImages = cleanImages.length > 0 ? cleanImages : fallbackProduct?.images || [];
  const cleanVideoUrl =
    product.videoUrl && !isLegacyPlaceholderMediaUrl(product.videoUrl) ? product.videoUrl : undefined;
  const cleanThumb =
    product.videoThumbnail && !isLegacyPlaceholderMediaUrl(product.videoThumbnail)
      ? currentBundledUrl(product.videoThumbnail)
      : finalImages[0] || fallbackProduct?.videoThumbnail;

  const result: Product = {
    ...product,
    images: finalImages,
    videoThumbnail: cleanThumb
  };

  if (cleanVideoUrl) {
    result.videoUrl = cleanVideoUrl;
  } else {
    delete result.videoUrl;
  }

  return result;
}

function saveReadOnlyCache(products: Product[]): void {
  try {
    const activeOnly = products.filter(p => !p.isDeleted);
    localStorage.setItem(READONLY_CACHE_KEY, JSON.stringify(activeOnly));
  } catch {
    // Ignore quota errors on read-only cache
  }
}

export function loadReadOnlyCachedProducts(): Product[] {
  try {
    const raw = localStorage.getItem(READONLY_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // An empty list is a real state (every product taken down), not "no cache": falling back to
      // the built-in catalogue here would bring removed products back until the cloud answers.
      if (Array.isArray(parsed)) {
        return parsed.map(p => {
          const codeDef = initialProducts.find(cp => cp.id === p.id);
          return cleanProductMediaPlaceholders(p, codeDef);
        });
      }
    }
  } catch {
    // Ignore parse error
  }
  return [...initialProducts];
}

/**
 * Authoritative Cloud-First Merge:
 * - Firestore `cloudProducts` is the Single Source of Truth.
 * - Any product with `isDeleted: true` in Firestore acts as a tombstone suppressing default code items.
 * - Any active product in `cloudProducts` overrides `codeProducts`.
 */
export function mergeCloudWithCodeDefaults(
  codeProducts: Product[],
  cloudProducts: Product[]
): Product[] {
  const cloudDeletedIds = new Set<string>();
  const cloudActiveMap = new Map<string, Product>();

  for (const p of cloudProducts) {
    if (!p || !p.id) continue;
    if (p.isDeleted) {
      cloudDeletedIds.add(p.id);
    } else {
      cloudActiveMap.set(p.id, p);
    }
  }

  const finalProducts: Product[] = [];

  // 1. Custom admin-created products from cloud first
  for (const [id, cloudP] of cloudActiveMap.entries()) {
    const isCodeDefault = codeProducts.some(cp => cp.id === id);
    if (!isCodeDefault && !cloudDeletedIds.has(id)) {
      finalProducts.push(cleanProductMediaPlaceholders(cloudP));
    }
  }

  // 2. Default catalog products with cloud overrides or tombstones
  for (const codeP of codeProducts) {
    if (cloudDeletedIds.has(codeP.id)) {
      continue;
    }

    const cloudOverride = cloudActiveMap.get(codeP.id);
    if (cloudOverride) {
      finalProducts.push(
        cleanProductMediaPlaceholders(
          {
            ...codeP,
            ...cloudOverride
          },
          codeP
        )
      );
    } else {
      finalProducts.push({
        ...codeP,
        condition: codeP.condition || (codeP.type === 'equipment' ? 'certified' : 'new'),
        status: codeP.status || 'published',
        featured: codeP.featured !== undefined ? codeP.featured : true
      });
    }
  }

  return finalProducts;
}

export async function fetchFirestoreProducts(): Promise<{
  success: boolean;
  products: Product[];
}> {
  try {
    const snapshot = await withTimeout(getDocs(collection(db, FIRESTORE_PRODUCTS_COLLECTION)), 8000);
    const cloudList: Product[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as Product;
      if (data && data.id) {
        cloudList.push(data);
      }
    });
    return { success: true, products: cloudList };
  } catch (err) {
    console.warn('Firestore products fetch warning:', err);
    return { success: false, products: [] };
  }
}

export async function initPersistentProducts(codeProducts: Product[]): Promise<Product[]> {
  const { success, products: cloudProducts } = await fetchFirestoreProducts();
  if (success) {
    const merged = mergeCloudWithCodeDefaults(codeProducts, cloudProducts);
    saveReadOnlyCache(merged);
    return merged;
  }
  return loadReadOnlyCachedProducts();
}

export function subscribeToFirestoreProducts(
  codeProducts: Product[],
  onUpdate: (mergedProducts: Product[]) => void,
  onError?: (err: Error) => void
): () => void {
  const colRef = collection(db, FIRESTORE_PRODUCTS_COLLECTION);
  return onSnapshot(
    colRef,
    snapshot => {
      const cloudProducts: Product[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as Product;
        if (data && data.id) {
          cloudProducts.push(data);
        }
      });

      const merged = mergeCloudWithCodeDefaults(codeProducts, cloudProducts);
      saveReadOnlyCache(merged);
      onUpdate(merged);
    },
    error => {
      console.warn('Real-time products listener error:', error);
      onError?.(error);
    }
  );
}

export async function persistProductUpdate(product: Product): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('未检测到有效的管理员或员工云端登录凭证，无法保存商品至云端数据库。');
  }

  const productWithMeta: Record<string, any> = {
    ...product,
    isDeleted: false,
    userModified: true,
    updatedAt: new Date().toISOString()
  };

  const payload = sanitizeProductForFirestore(productWithMeta);
  await withTimeout(
    setDoc(doc(db, FIRESTORE_PRODUCTS_COLLECTION, String(product.id)), payload),
    FIRESTORE_WRITE_TIMEOUT_MS
  );
}

/**
 * Writes many products in batches (all-or-nothing per batch of 100). `onProgress` receives the
 * number written so far. Used by the spreadsheet import.
 */
export async function persistProductsBatch(products: Product[], onProgress?: (done: number) => void): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('未检测到有效的管理员云端登录凭证，无法保存商品至云端数据库。');
  }
  const nowIso = new Date().toISOString();
  for (let i = 0; i < products.length; i += 100) {
    const chunk = products.slice(i, i + 100);
    const batch = writeBatch(db);
    for (const product of chunk) {
      const payload = sanitizeProductForFirestore({ ...product, isDeleted: false, userModified: true, updatedAt: nowIso });
      batch.set(doc(db, FIRESTORE_PRODUCTS_COLLECTION, String(product.id)), payload);
    }
    await withTimeout(batch.commit(), 20000);
    onProgress?.(Math.min(products.length, i + chunk.length));
  }
}

export async function persistProductDelete(id: string): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('未检测到有效的管理员云端登录凭证，无法执行云端商品删除。');
  }

  const defaultProd = initialProducts.find(p => p.id === id);
  const nowIso = new Date().toISOString();
  const tombstoneBase: Record<string, any> = defaultProd
    ? {
        ...defaultProd,
        id,
        isDeleted: true,
        inStock: false,
        status: 'archived',
        updatedAt: nowIso
      }
    : {
        id,
        type: 'material',
        nameKey: 'deleted_product',
        catKey: 'p1Cat',
        descKey: 'deleted_product',
        specKey: 'p1Spec',
        model: 'DELETED',
        price: '$0',
        unitKey: 'p1Unit',
        inStock: false,
        status: 'archived',
        isDeleted: true,
        updatedAt: nowIso
      };

  const payload = sanitizeProductForFirestore(tombstoneBase);
  await withTimeout(
    setDoc(doc(db, FIRESTORE_PRODUCTS_COLLECTION, String(id)), payload),
    FIRESTORE_WRITE_TIMEOUT_MS
  );
}
