import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut as fbSignOut, 
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  type User,
  type Auth
} from 'firebase/auth';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || '';
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '';
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || '';
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '';
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '';
const appId = import.meta.env.VITE_FIREBASE_APP_ID || '';

export const isFirebaseConfigured = Boolean(apiKey && projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

if (isFirebaseConfigured) {
  try {
    if (!getApps().length) {
      app = initializeApp({
        apiKey,
        authDomain,
        projectId,
        storageBucket,
        messagingSenderId,
        appId,
      });
    } else {
      app = getApps()[0];
    }
    auth = getAuth(app);
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn('Failed to set browser local persistence:', err);
    });
  } catch (error) {
    console.warn('Firebase initialization error:', error);
  }
}

export { 
  app, 
  auth, 
  signInWithEmailAndPassword, 
  fbSignOut, 
  onAuthStateChanged,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword
};
export type { User, Auth };

/**
 * Retrieves the Firebase ID token for API requests.
 * Auth ALWAYS uses real Firebase ID tokens even when mocks are enabled for other endpoints.
 */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  if (auth && auth.currentUser) {
    try {
      return await auth.currentUser.getIdToken(forceRefresh);
    } catch (err) {
      console.warn('Could not retrieve Firebase ID token:', err);
    }
  }
  return null;
}
