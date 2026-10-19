import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import firebaseConfig from '../../firebase-applet-config.json';
import { FIRESTORE_DATABASE_ID, FUNCTIONS_REGION } from '../config/appConfig';

/**
 * Single Firebase app instance for the whole frontend.
 * (No secondary apps: staff accounts are provisioned server-side by Cloud Functions.)
 */
const app = initializeApp(firebaseConfig);

// Firebase App Check (reCAPTCHA v3). Remember to also turn on *enforcement* for Firestore,
// Storage and Cloud Functions in the Firebase console, otherwise tokens are only monitored.
const recaptchaSiteKey = (
  import.meta.env.VITE_RECAPTCHA_SITE_KEY ||
  (firebaseConfig as Record<string, any>).recaptchaSiteKey ||
  ''
).trim();

if (typeof window !== 'undefined' && recaptchaSiteKey) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true
    });
  } catch (err) {
    console.warn('Firebase App Check initialization warning:', err);
  }
}

// CRITICAL: the app uses a *named* Firestore database, never `(default)`.
export const db = getFirestore(app, FIRESTORE_DATABASE_ID);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);
