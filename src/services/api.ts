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
  where
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

export interface OutboxInquiryItem {
  record: InquiryRecord;
  payload: Record<string, any>;
  queuedAt: string;
  retryCount: number;
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

  private saveOutboxQueue(queue: OutboxInquiryItem[]): void {
    try {
      localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.warn('Failed to save inquiry outbox queue:', e);
    }
  }

  private enqueueInquiryOutbox(record: InquiryRecord, payload: Record<string, any>): number {
    const queue = this.getOutboxQueue().filter(item => item.record.id !== record.id);
    queue.unshift({
      record: { ...record, syncStatus: 'queued_local' },
      payload,
      queuedAt: new Date().toISOString(),
      retryCount: 0
    });
    const trimmed = queue.slice(0, 100);
    this.saveOutboxQueue(trimmed);
    return trimmed.length;
  }

  /**
   * Flush locally queued inquiries to Firestore `inquiries` collection when network connectivity recovers.
   */
  async flushInquiryOutbox(): Promise<{ flushedCount: number; remainingCount: number }> {
    const queue = this.getOutboxQueue();
    if (queue.length === 0 || this.isFlushingOutbox) {
      return { flushedCount: 0, remainingCount: queue.length };
    }

    this.isFlushingOutbox = true;
    let flushedCount = 0;
    const remaining: OutboxInquiryItem[] = [];

    try {
      for (const item of queue) {
        try {
          const inqRef = doc(db, 'inquiries', item.record.id);
          await withTimeout(setDoc(inqRef, sanitizeInquiryForFirestore(item.payload)), 8000);
          flushedCount++;
          // Update local buyer history status to synced
          this.markLocalInquirySynced(item.record.id, item.record.buyerUid);
        } catch {
          remaining.push({
            ...item,
            retryCount: (item.retryCount || 0) + 1
          });
        }
      }
      this.saveOutboxQueue(remaining);
    } finally {
      this.isFlushingOutbox = false;
    }

    return { flushedCount, remainingCount: remaining.length };
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
    if (auth.currentUser?.uid) {
      return auth.currentUser.uid;
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
      if (firebaseUser?.uid) {
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

    const uid = auth.currentUser?.uid;
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
      console.warn('Cloud favorite sync warning, retained in local storage:', error);
      return nextState;
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
    const buyerUid = auth.currentUser?.uid || undefined;
    const buyerEmail = auth.currentUser?.email || (buyerUid ? currentBuyer?.email : undefined);

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
      await withTimeout(setDoc(inqRef, payload), 8000);

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
      const pendingCount = this.enqueueInquiryOutbox(cleanRecord, payload);
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
    return this.currentUser;
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
    const uid = auth.currentUser?.uid || buyerId || this.getCurrentBuyerId();
    const localList = this.getUserInquiries(uid);

    if (!auth.currentUser?.uid || uid.startsWith('guest_')) {
      return localList;
    }

    try {
      const q = query(collection(db, 'inquiries'), where('buyerUid', '==', auth.currentUser.uid));
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
            buyerUid: d.buyerUid ? String(d.buyerUid) : auth.currentUser?.uid,
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
