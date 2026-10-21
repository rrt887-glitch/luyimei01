import {
  InquiryFormData,
  InquiryRecord,
  SubmitInquiryResult,
  UserAccount
} from '../types';
import { db, auth, getFunctionsService, functionUrl } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  writeBatch
} from 'firebase/firestore';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { withTimeout } from './admin/adminShared';
import { hasAdminSession, purgeAdminStorage } from './adminSession';
import { validatePasswordStrength } from '../utils/crypto';
import { isReservedStaffEmail, TIMEOUTS } from '../config/appConfig';
import {
  sanitizeInquiryForFirestore,
  sanitizeBuyerForFirestore,
  sanitizeFavoriteForFirestore
} from '../utils/firestoreSanitizer';

export interface BuyerProfile {
  id: string;
  uid: string;
  email: string;
  name: string;
  company: string;
  phone: string;
  country: string;
  role: string;
  registeredAt: string;
  updatedAt?: string;
}

/**
 * The signed-in Firebase user, but only if it is a BUYER. Staff sign in to the console with the
 * same Firebase Auth in the same browser; their account must never be treated as a buyer (it
 * would own inquiries submitted from the website and show them in the buyer centre).
 */
function buyerAuthUser(): { uid: string; email: string | null } | null {
  const user = auth.currentUser;
  if (!user) return null;
  if (isReservedStaffEmail(user.email) || hasAdminSession()) return null;
  return user;
}

/**
 * Creates an inquiry together with its delivery receipt (firestore.rules: the receipt can only be
 * created in the same batch). The receipt later proves, to anyone holding the id, that it arrived.
 */
function createInquiryWithReceipt(id: string, payload: Record<string, any>) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'inquiries', id), payload);
  batch.set(doc(db, 'inquiry_receipts', id), { createdAt: String(payload.createdAt || new Date().toISOString()).slice(0, 64) });
  return batch.commit();
}

export interface OutboxInquiryItem {
  record: InquiryRecord;
  payload: Record<string, any>;
  queuedAt: string;
  retryCount: number;
  /**
   * The first attempt timed out without an answer, so the server may already have saved it. A
   * visitor can only CREATE an inquiry, so a later "permission-denied" for this id means exactly
   * that: it exists, and the item is done.
   */
  maybeDelivered?: boolean;
}

/** Sign-up failure with a reason code (see functions/src/index.ts `signupError`). */
export class SignupError extends Error {
  readonly reason: string;
  constructor(reason: string, message?: string) {
    super(message || reason);
    this.name = 'SignupError';
    this.reason = reason;
  }
}

/** True when the function's host answers at all (any status), i.e. the visitor's network can reach it. */
async function canReachFunction(name: string): Promise<boolean> {
  const url = functionUrl(name);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function callSignupFunction<Req, Res = unknown>(name: string, payload: Req, timeout: number = TIMEOUTS.adminCallable): Promise<Res> {
  let callable;
  try {
    const [{ httpsCallable }, functions] = await Promise.all([import('firebase/functions'), getFunctionsService()]);
    callable = httpsCallable<Req, Res>(functions, name, { timeout });
  } catch (err) {
    throw new SignupError('network', (err as Error)?.message);
  }
  try {
    return (await callable(payload)).data;
  } catch (err: any) {
    const code = String(err?.code || '').replace(/^functions\//, '');
    const details = (err?.details || {}) as { reason?: string };
    if (details.reason) throw new SignupError(details.reason, err?.message);
    if (code === 'not-found') throw new SignupError('service_unavailable', err?.message);
    if (code === 'internal') {
      // The browser hides why the request failed (a 404 or 403 from Google arrives without CORS
      // headers and looks exactly like a dropped connection). Probe the address: if Google answers
      // at all, the network is fine and the function is missing or not open to visitors.
      throw new SignupError((await canReachFunction(name)) ? 'service_unavailable' : 'network', err?.message);
    }
    if (code === 'deadline-exceeded' || code === 'unavailable') {
      throw new SignupError('network', err?.message);
    }
    throw new SignupError('unknown', err?.message);
  }
}

const OUTBOX_STORAGE_KEY = 'lym_inquiry_outbox_v1';
/** At most this many unsent inquiries are kept in one browser; beyond that new ones are refused, none dropped. */
const OUTBOX_MAX_ITEMS = 100;

/** A favorite was changed on this device but the server has not confirmed it yet. */
export class FavoritePendingError extends Error {
  constructor() {
    super('favorite not confirmed yet');
    this.name = 'FavoritePendingError';
  }
}

/** The inquiry neither reached the server nor could be kept in this browser to send later. */
export class InquiryNotSavedError extends Error {
  constructor(public readonly reason: 'outbox_full' | 'storage_unavailable') {
    super(reason === 'outbox_full' ? '本机待发送的询价已达上限，本条未保存。' : '浏览器无法保存本条询价，本条未发送。');
    this.name = 'InquiryNotSavedError';
  }
}
const PERSISTENT_GUEST_ID_KEY = 'lym_guest_buyer_id';

/** Maps the internal CRM stage to the status shown in the buyer's "My inquiries" list. */
function buyerFacingStatus(stage: unknown, status: unknown): InquiryRecord['status'] {
  switch (stage) {
    case 'following':
      return 'reviewing';
    case 'quoted':
    case 'negotiating':
    case 'won':
    case 'lost':
      return 'contacted';
    case 'new':
      return 'pending';
    default:
      return status === 'reviewing' || status === 'contacted' ? status : 'pending';
  }
}

class ApiService {
  private currentUser: UserAccount | null = null;
  private favoriteListeners: Set<(ids: Set<string>) => void> = new Set();
  private lastKnownFavs: Set<string> = new Set();
  private isFlushingOutbox = false;

  constructor() {
    this.purgeLegacySensitiveStorage();
    this.migrateGuestIdFromSessionStorage();
    this.loadLocalFavorites();
    this.initOutboxAutoRetry();
  }

  /**
   * Purge any legacy buyer profiles that stored password hashes or salts in localStorage.
   */
  private purgeLegacySensitiveStorage(): void {
    try {
      const raw = localStorage.getItem('lym_buyer_profiles');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const sanitized = parsed
            .filter(p => p && typeof p === 'object' && p.uid)
            .map(p => ({
              id: p.id,
              uid: p.uid,
              email: p.email,
              name: p.name,
              company: p.company,
              phone: p.phone,
              country: p.country,
              role: p.role,
              registeredAt: p.registeredAt
            }));
          localStorage.setItem('lym_buyer_profiles', JSON.stringify(sanitized));
        }
      }
    } catch {
      localStorage.removeItem('lym_buyer_profiles');
    }
  }

  /**
   * Migrate guest ID from sessionStorage to persistent localStorage so closing the tab
   * never loses unauthenticated visitor favorites.
   */
  private migrateGuestIdFromSessionStorage(): void {
    try {
      const existingLocal = localStorage.getItem(PERSISTENT_GUEST_ID_KEY);
      const legacySession = sessionStorage.getItem(PERSISTENT_GUEST_ID_KEY);
      if (!existingLocal && legacySession) {
        localStorage.setItem(PERSISTENT_GUEST_ID_KEY, legacySession);
      }
    } catch {
      // ignore storage errors
    }
  }

  private initOutboxAutoRetry(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      void this.flushInquiryOutbox();
    });

    // Attempt an initial flush shortly after startup if there are pending items
    setTimeout(() => {
      if (this.getOutboxQueue().length > 0) {
        void this.flushInquiryOutbox();
      }
    }, 3000);

    // Periodic retry every 30 seconds when outbox has items
    setInterval(() => {
      if (this.getOutboxQueue().length > 0) {
        void this.flushInquiryOutbox();
      }
    }, 30000);
  }

  getOutboxQueue(): OutboxInquiryItem[] {
    try {
      const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  }

  /** Returns false when the browser refused to store the queue (private mode, storage full…). */
  private saveOutboxQueue(queue: OutboxInquiryItem[]): boolean {
    try {
      localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(queue));
      return JSON.parse(localStorage.getItem(OUTBOX_STORAGE_KEY) || '[]').length === queue.length;
    } catch (e) {
      console.warn('Failed to save inquiry outbox queue:', e);
      return false;
    }
  }

  /**
   * Keeps an inquiry that could not reach the server, to send later. Returns the number waiting,
   * or throws InquiryNotSavedError when it could not be kept: the queue is full (older inquiries
   * are never dropped to make room) or the browser would not store it. Then the visitor is told
   * the inquiry was NOT sent, instead of a "queued" message that is not true.
   */
  private enqueueInquiryOutbox(record: InquiryRecord, payload: Record<string, any>, maybeDelivered = false): number {
    const queue = this.getOutboxQueue().filter(item => item.record.id !== record.id);
    if (queue.length >= OUTBOX_MAX_ITEMS) throw new InquiryNotSavedError('outbox_full');
    queue.unshift({
      record: { ...record, syncStatus: 'queued_local' },
      payload,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
      maybeDelivered
    });
    if (!this.saveOutboxQueue(queue)) throw new InquiryNotSavedError('storage_unavailable');
    return queue.length;
  }

  /**
   * Sends locally queued inquiries once the network is back. The queue is re-read after the
   * uploads and only the items that were sent are removed, so an inquiry queued meanwhile
   * (in this tab or another one) is never overwritten.
   */
  async flushInquiryOutbox(): Promise<{ flushedCount: number; remainingCount: number }> {
    const queue = this.getOutboxQueue();
    if (queue.length === 0 || this.isFlushingOutbox) {
      return { flushedCount: 0, remainingCount: queue.length };
    }

    this.isFlushingOutbox = true;
    const done = new Set<string>();
    const failed = new Set<string>();

    try {
      const signedInUid = auth.currentUser?.uid || '';
      for (const item of queue) {
        const owner = String(item.payload?.buyerUid || '');
        // Queued by a buyer who is not the one signed in now (they logged out, someone else logged
        // in): the server would refuse it for the wrong account, which proves nothing about whether
        // it arrived. Leave it untouched until that buyer is signed in again.
        if (owner && owner !== signedInUid) continue;
        const inqRef = doc(db, 'inquiries', item.record.id);
        try {
          await withTimeout(createInquiryWithReceipt(item.record.id, sanitizeInquiryForFirestore(item.payload)), 8000);
          done.add(item.record.id);
          this.markLocalInquirySynced(item.record.id, item.record.buyerUid);
        } catch (err) {
          if ((err as { code?: string })?.code === 'permission-denied' && (await this.alreadyDelivered(inqRef, owner))) {
            done.add(item.record.id);
            this.markLocalInquirySynced(item.record.id, item.record.buyerUid);
          } else {
            failed.add(item.record.id);
          }
        }
      }
      const latest = this.getOutboxQueue()
        .filter(item => !done.has(item.record.id))
        .map(item => (failed.has(item.record.id) ? { ...item, retryCount: (item.retryCount || 0) + 1 } : item));
      this.saveOutboxQueue(latest);
      return { flushedCount: done.size, remainingCount: latest.length };
    } finally {
      this.isFlushingOutbox = false;
    }
  }

  /**
   * After the server refused to (re)create a queued inquiry: is it because the inquiry is already
   * there? Its delivery receipt answers that for anyone, anonymous visitors included. A buyer can
   * also read their own inquiry (covers inquiries sent before receipts existed). When neither can
   * be confirmed the item stays queued: it is never dropped on a guess.
   */
  private async alreadyDelivered(ref: ReturnType<typeof doc>, owner: string): Promise<boolean> {
    try {
      if ((await withTimeout(getDoc(doc(db, 'inquiry_receipts', ref.id)), 6000)).exists()) return true;
    } catch {
      // Unreachable: decide below / keep the item.
    }
    if (!owner) return false;
    try {
      return (await withTimeout(getDoc(ref), 6000)).exists();
    } catch {
      return false;
    }
  }

  private getBuyerProfiles(): BuyerProfile[] {
    try {
      const raw = localStorage.getItem('lym_buyer_profiles');
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse buyer profiles:', e);
    }
    return [];
  }

  private saveBuyerProfiles(profiles: BuyerProfile[]): void {
    try {
      localStorage.setItem('lym_buyer_profiles', JSON.stringify(profiles));
    } catch (e) {
      console.warn('Failed to save buyer profiles:', e);
    }
  }

  /**
   * Persistent buyer/visitor identifier.
   * Uses `auth.currentUser.uid` when logged in, or persistent `localStorage` guest ID
   * so closing the browser tab never loses favorites.
   */
  getCurrentBuyerId(): string {
    const buyer = buyerAuthUser();
    if (buyer) {
      return buyer.uid;
    }
    const user = this.getCurrentUser();
    if (user && user.id) {
      return user.id;
    }
    try {
      let guestId = localStorage.getItem(PERSISTENT_GUEST_ID_KEY);
      if (!guestId) {
        guestId = 'guest_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
        localStorage.setItem(PERSISTENT_GUEST_ID_KEY, guestId);
      }
      return guestId;
    } catch {
      return 'guest_default';
    }
  }

  private getLocalFavStorageKey(): string {
    return `lym_favs_${this.getCurrentBuyerId()}`;
  }

  private loadLocalFavorites(): Set<string> {
    try {
      const raw = localStorage.getItem(this.getLocalFavStorageKey());
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          this.lastKnownFavs = new Set(arr.filter(x => typeof x === 'string'));
          return this.lastKnownFavs;
        }
      }
    } catch {
      // ignore
    }
    this.lastKnownFavs = new Set();
    return this.lastKnownFavs;
  }

  private saveLocalFavorites(ids: Set<string>): void {
    try {
      localStorage.setItem(this.getLocalFavStorageKey(), JSON.stringify(Array.from(ids)));
    } catch {
      // ignore
    }
  }

  /**
   * Real-time subscription to cloud favorites collection.
   * Strictly isolated by `request.auth.uid` via Firestore `where('userId', '==', uid)` query.
   * Unauthenticated visitors use persistent localStorage favorites and never query the cloud collection.
   */
  subscribeToFavorites(
    onUpdate: (savedIds: Set<string>) => void,
    onError?: (error: Error) => void
  ): () => void {
    this.favoriteListeners.add(onUpdate);
    onUpdate(new Set(this.loadLocalFavorites()));

    let firestoreUnsub: (() => void) | null = null;

    const attachCloudListener = (uid: string) => {
      if (firestoreUnsub) {
        firestoreUnsub();
        firestoreUnsub = null;
      }

      const favQuery = query(
        collection(db, 'favorites'),
        where('userId', '==', uid)
      );

      firestoreUnsub = onSnapshot(
        favQuery,
        snapshot => {
          const ids = new Set<string>();
          snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data && data.userId === uid && typeof data.productId === 'string') {
              ids.add(data.productId);
            }
          });
          this.lastKnownFavs = ids;
          this.saveLocalFavorites(ids);
          onUpdate(new Set(ids));
        },
        error => {
          console.warn('Favorites live sync warning:', error);
          onUpdate(new Set(this.loadLocalFavorites()));
          if (onError && error instanceof Error && !error.message.includes('Missing or insufficient permissions')) {
            onError(error);
          }
        }
      );
    };

    const authUnsub = onAuthStateChanged(auth, firebaseUser => {
      if (firebaseUser?.uid && buyerAuthUser()) {
        attachCloudListener(firebaseUser.uid);
      } else {
        if (firestoreUnsub) {
          firestoreUnsub();
          firestoreUnsub = null;
        }
        onUpdate(new Set(this.loadLocalFavorites()));
      }
    });

    return () => {
      this.favoriteListeners.delete(onUpdate);
      authUnsub();
      if (firestoreUnsub) {
        firestoreUnsub();
      }
    };
  }

  /**
   * Toggle favorite state.
   * When signed in with Firebase Auth, persists to `/favorites/fav_${uid}_${productId}` with `userId == auth.currentUser.uid`.
   */
  async toggleFavorite(productId: string, currentlySaved: boolean): Promise<boolean> {
    const nextState = !currentlySaved;
    if (currentlySaved) {
      this.lastKnownFavs.delete(productId);
    } else {
      this.lastKnownFavs.add(productId);
    }
    this.saveLocalFavorites(this.lastKnownFavs);
    this.notifyFavoritesChange();

    const uid = buyerAuthUser()?.uid;
    if (!uid) {
      return nextState;
    }

    const cleanProductId = productId.replace(/[^a-zA-Z0-9_-]/g, '');
    const favDocId = `fav_${uid}_${cleanProductId}`;
    const favRef = doc(db, 'favorites', favDocId);

    try {
      if (currentlySaved) {
        await withTimeout(deleteDoc(favRef), 5000);
      } else {
        const favData = sanitizeFavoriteForFirestore({
          id: favDocId,
          productId: cleanProductId,
          userId: uid,
          createdAt: new Date().toISOString()
        });
        await withTimeout(setDoc(favRef, favData), 5000);
      }
      return nextState;
    } catch (error) {
      if (!(error as { code?: string })?.code) {
        // Our timeout, not a server answer: the write is still queued in the Firestore SDK and the
        // live listener already shows it, so keep it and say it will sync, not that it is saved.
        console.warn('Favorite not confirmed yet, will sync when online:', error);
        throw new FavoritePendingError();
      }
      // The server refused it: undo the local change so screen, storage and cloud agree.
      if (currentlySaved) this.lastKnownFavs.add(productId);
      else this.lastKnownFavs.delete(productId);
      this.saveLocalFavorites(this.lastKnownFavs);
      this.notifyFavoritesChange();
      throw error;
    }
  }

  private notifyFavoritesChange(): void {
    const copy = new Set(this.lastKnownFavs);
    this.favoriteListeners.forEach(listener => listener(copy));
  }

  private lastInquirySubmitAt = 0;

  /**
   * Submit project inquiry with an 8-second circuit-breaker timeout, anti-spam rate limit,
   * collision-free Firestore auto-ID, and a persistent local outbox retry queue (`lym_inquiry_outbox_v1`).
   */
  async submitInquiry(data: InquiryFormData): Promise<SubmitInquiryResult> {
    const nowMs = Date.now();
    if (nowMs - this.lastInquirySubmitAt < 3000) {
      throw new Error('您的提交过于频繁，请稍候 3 秒再试。');
    }
    this.lastInquirySubmitAt = nowMs;

    const cleanId = `INQ-${doc(collection(db, 'inquiries')).id}`;
    const currentBuyer = this.getCurrentUser();
    // Strictly bind buyerUid ONLY to verified Firebase Auth session UID (prevents spoofing another buyer's UID)
    // (Never a staff account signed in to the console in this browser.)
    const buyerUid = buyerAuthUser()?.uid || undefined;
    const buyerEmail = buyerUid ? buyerAuthUser()?.email || currentBuyer?.email : undefined;

    const cleanRecord: InquiryRecord = {
      id: cleanId,
      name: data.name.trim().slice(0, 100),
      phone: data.phone.trim().slice(0, 50),
      needType: data.needType.slice(0, 50),
      location: (data.location || '').trim().slice(0, 100),
      message: data.message.trim().slice(0, 1000),
      createdAt: new Date().toISOString(),
      status: 'pending',
      buyerUid,
      buyerEmail,
      syncStatus: 'synced'
    };

    const payload = sanitizeInquiryForFirestore({
      id: cleanRecord.id,
      name: cleanRecord.name,
      customerName: cleanRecord.name,
      company: data.company?.trim().slice(0, 200) || '',
      phone: cleanRecord.phone,
      needType: cleanRecord.needType,
      location: cleanRecord.location,
      message: cleanRecord.message,
      buyerUid,
      buyerEmail,
      createdAt: cleanRecord.createdAt,
      status: 'pending',
      stage: 'new'
    });

    const inqRef = doc(db, 'inquiries', cleanId);

    try {
      await withTimeout(createInquiryWithReceipt(cleanId, payload), 8000);

      // Record to current buyer's inquiry history as synced
      this.recordUserInquiry({ ...cleanRecord, syncStatus: 'synced' }, buyerUid);

      // Best-effort flush any previously queued offline inquiries
      if (this.getOutboxQueue().length > 0) {
        void this.flushInquiryOutbox();
      }

      return {
        ...cleanRecord,
        syncStatus: 'synced',
        syncedToCloud: true,
        queuedOffline: false,
        pendingOutboxCount: this.getOutboxQueue().length
      };
    } catch (error) {
      console.warn('Cloud inquiry submission timed out or offline; persisting to local outbox queue:', error);
      // No error code = our timeout fired: the write may have reached the server after all.
      const pendingCount = this.enqueueInquiryOutbox(cleanRecord, payload, !(error as { code?: string })?.code);
      this.recordUserInquiry({ ...cleanRecord, syncStatus: 'queued_local' }, buyerUid);

      return {
        ...cleanRecord,
        syncStatus: 'queued_local',
        syncedToCloud: false,
        queuedOffline: true,
        pendingOutboxCount: pendingCount
      };
    }
  }

  getCurrentUser(): UserAccount | null {
    if (!this.currentUser) {
      try {
        const stored = localStorage.getItem('lym_buyer_session');
        if (stored) {
          this.currentUser = JSON.parse(stored);
        }
      } catch (e) {
        console.warn('Failed to parse user session:', e);
      }
    }
    // The saved buyer profile is only valid while that buyer is the one signed in. Once someone
    // else (e.g. staff, in the console) has signed in in this browser, it belongs to nobody.
    const signedIn = auth.currentUser;
    if (this.currentUser && signedIn && (signedIn.uid !== this.currentUser.id || !buyerAuthUser())) {
      this.clearBuyerSession();
    }
    return this.currentUser;
  }

  /** Forgets the saved buyer profile in this browser without signing anybody out of Firebase. */
  clearBuyerSession(): void {
    this.currentUser = null;
    try {
      localStorage.removeItem('lym_buyer_session');
    } catch {
      // Private mode: nothing was stored.
    }
  }

  logout(): void {
    this.currentUser = null;
    try {
      localStorage.removeItem('lym_buyer_session');
    } catch (e) {
      console.warn('Failed to remove user session:', e);
    }
    if (!hasAdminSession()) {
      void signOut(auth).catch(() => {});
    }
    this.loadLocalFavorites();
    this.notifyFavoritesChange();
  }

  /**
   * Authenticate buyer session strictly via Firebase Auth with mandatory non-empty >= 8 char password,
   * and synchronize buyer profile from cloud `/buyers/{uid}` so buyers logging in on a new device
   * immediately recover their full profile and company metadata.
   */
  async login(email: string, password?: string): Promise<UserAccount> {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('请输入有效的买家电子邮箱地址。');
    }

    const pwdCheck = validatePasswordStrength(password);
    if (!pwdCheck.valid) {
      throw new Error(pwdCheck.message || '请输入不少于 8 位字符的登录密码。');
    }

    // One browser = one Firebase Auth user: a buyer login replaces any staff console session.
    if (hasAdminSession()) {
      purgeAdminStorage();
    }

    let uid: string;
    let idToken: string;
    try {
      const cred = await withTimeout(
        signInWithEmailAndPassword(auth, cleanEmail, pwdCheck.trimmed),
        8000
      );
      uid = cred.user.uid;
      idToken = await cred.user.getIdToken();
    } catch {
      throw new Error('买家邮箱或登录密码不正确，请核对后重试。');
    }

    // 1. Fetch authoritative buyer profile from cloud Firestore `/buyers/{uid}`
    let cloudProfile: BuyerProfile | null = null;
    try {
      const buyerDoc = await withTimeout(getDoc(doc(db, 'buyers', uid)), 6000);
      if (buyerDoc.exists()) {
        const d = buyerDoc.data();
        cloudProfile = {
          id: uid,
          uid,
          email: String(d.email || cleanEmail),
          name: String(d.name || cleanEmail.split('@')[0]),
          company: String(d.company || '签约采购客户'),
          phone: String(d.phone || ''),
          country: String(d.country || 'International'),
          role: String(d.role || '认证采购会员'),
          registeredAt: String(d.registeredAt || new Date().toLocaleString())
        };
      }
    } catch (err) {
      console.warn('Cloud buyer profile fetch fallback to local:', err);
    }

    const profiles = this.getBuyerProfiles();
    let matched =
      cloudProfile ||
      profiles.find(p => p.uid === uid || p.email.toLowerCase() === cleanEmail);

    if (!matched) {
      matched = {
        id: uid,
        uid,
        email: cleanEmail,
        name: cleanEmail.split('@')[0],
        company: '签约采购客户',
        phone: '',
        country: 'International',
        role: '认证采购会员',
        registeredAt: new Date().toLocaleString()
      };
    } else {
      matched = {
        ...matched,
        id: uid,
        uid
      };
    }

    // Ensure cloud `/buyers/{uid}` is populated if it was missing
    if (!cloudProfile) {
      try {
        await withTimeout(
          setDoc(doc(db, 'buyers', uid), sanitizeBuyerForFirestore(matched), { merge: true }),
          5000
        );
      } catch {
        // non-blocking
      }
    }

    // Cache locally
    const updatedProfiles = profiles.filter(p => p.uid !== uid && p.email.toLowerCase() !== cleanEmail);
    updatedProfiles.push(matched);
    this.saveBuyerProfiles(updatedProfiles);

    const user: UserAccount = {
      id: uid,
      email: matched.email,
      name: matched.name,
      company: matched.company,
      phone: matched.phone,
      country: matched.country,
      role: matched.role,
      registeredAt: matched.registeredAt,
      token: idToken
    };

    this.currentUser = user;
    try {
      localStorage.setItem('lym_buyer_session', JSON.stringify(user));
    } catch (e) {
      console.warn('Failed to save buyer session:', e);
    }

    // Also pull buyer's historical inquiries from cloud
    void this.fetchUserInquiries(uid);

    this.loadLocalFavorites();
    this.notifyFavoritesChange();

    return user;
  }

  /**
   * Step 1 of sign-up: a fresh picture captcha (Cloud Function `getSignupCaptcha`).
   * `src` can be used directly as an <img> source; each captcha can be submitted once.
   */
  async getSignupCaptcha(): Promise<{ id: string; src: string }> {
    // Short timeout: a picture that has not arrived in 15 s is not coming (first call after a deploy
    // can take a few seconds while the function starts).
    const res = await callSignupFunction<Record<string, never>, { id: string; svg: string }>('getSignupCaptcha', {}, 15000);
    return { id: res.id, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(res.svg)}` };
  }

  /**
   * Step 2 of sign-up: the server checks the picture captcha, then creates the Auth account, the
   * buyers/{uid} profile and the CRM customer record (Cloud Function `registerBuyer`). Browsers
   * cannot create accounts on their own (blocked by `beforeAccountCreated`), so the captcha cannot
   * be skipped. The new buyer is then signed in like a normal login.
   */
  async register(data: {
    name: string;
    email: string;
    password: string;
    country: string;
    dialCode: string;
    whatsapp: string;
    captchaId: string;
    captchaAnswer: string;
  }): Promise<UserAccount> {
    const cleanEmail = (data.email || '').trim().toLowerCase();
    if (isReservedStaffEmail(cleanEmail)) {
      throw new SignupError('reserved_email');
    }
    if (hasAdminSession()) {
      purgeAdminStorage();
    }
    await callSignupFunction('registerBuyer', {
      name: data.name.trim(),
      email: cleanEmail,
      password: data.password,
      country: data.country.trim(),
      dialCode: data.dialCode,
      whatsapp: data.whatsapp,
      captchaId: data.captchaId,
      captchaAnswer: data.captchaAnswer.trim()
    });
    return this.login(cleanEmail, data.password);
  }

  private markLocalInquirySynced(inquiryId: string, buyerId?: string): void {
    try {
      const id = buyerId || this.getCurrentBuyerId();
      const existing = this.getUserInquiries(id);
      const updated = existing.map(item =>
        item.id === inquiryId ? { ...item, syncStatus: 'synced' as const } : item
      );
      localStorage.setItem(`lym_buyer_inquiries_${id}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  // Isolated user inquiry history per buyer namespace
  private recordUserInquiry(inquiry: InquiryRecord, buyerId?: string): void {
    try {
      const id = buyerId || this.getCurrentBuyerId();
      const existing = this.getUserInquiries(id).filter(x => x.id !== inquiry.id);
      const updated = [inquiry, ...existing];
      localStorage.setItem(`lym_buyer_inquiries_${id}`, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save user inquiry locally:', e);
    }
  }

  getUserInquiries(buyerId?: string): InquiryRecord[] {
    try {
      const id = buyerId || this.getCurrentBuyerId();
      const stored = localStorage.getItem(`lym_buyer_inquiries_${id}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to parse user inquiries:', e);
    }
    return [];
  }

  /**
   * Fetch and synchronize buyer's inquiry history from Firestore `inquiries` collection (`where('buyerUid', '==', uid)`),
   * merging with any locally queued outbox inquiries so cross-device login always displays complete history.
   */
  async fetchUserInquiries(buyerId?: string): Promise<InquiryRecord[]> {
    const buyer = buyerAuthUser();
    const uid = buyer?.uid || buyerId || this.getCurrentBuyerId();
    const localList = this.getUserInquiries(uid);

    if (!buyer || uid.startsWith('guest_')) {
      return localList;
    }

    try {
      const q = query(collection(db, 'inquiries'), where('buyerUid', '==', buyer.uid));
      const snap = await withTimeout(getDocs(q), 6000);
      const cloudRecords: InquiryRecord[] = [];

      snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d) {
          cloudRecords.push({
            id: docSnap.id,
            name: String(d.name || d.customerName || ''),
            phone: String(d.phone || ''),
            needType: String(d.needType || '工程采购询盘'),
            location: String(d.location || ''),
            message: String(d.message || ''),
            createdAt: String(d.createdAt || new Date().toISOString()),
            // Staff progress the CRM `stage`; derive the buyer-facing status from it so buyers
            // see real progress instead of "pending" forever.
            status: buyerFacingStatus(d.stage, d.status),
            buyerUid: d.buyerUid ? String(d.buyerUid) : buyer.uid,
            buyerEmail: d.buyerEmail ? String(d.buyerEmail) : undefined,
            syncStatus: 'synced'
          });
        }
      });

      const mergedMap = new Map<string, InquiryRecord>();
      cloudRecords.forEach(r => mergedMap.set(r.id, r));
      localList.forEach(localItem => {
        if (!mergedMap.has(localItem.id)) {
          mergedMap.set(localItem.id, localItem);
        }
      });

      const merged = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      localStorage.setItem(`lym_buyer_inquiries_${uid}`, JSON.stringify(merged));
      return merged;
    } catch (err) {
      console.warn('Cloud user inquiries fetch fallback to local cache:', err);
      return localList;
    }
  }
}

export const api = new ApiService();
