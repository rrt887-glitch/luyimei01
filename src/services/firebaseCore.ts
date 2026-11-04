/**
 * Everything the website and console use from the Firebase SDK, in one module that is loaded
 * on demand (see ./fb.ts). Importing it starts Firebase (./firebase.ts).
 */
export { db, auth, getFunctionsService, functionUrl } from './firebase';
export {
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
export { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
