import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  projectId: "gen-lang-client-0416312455",
  appId: "1:702005695603:web:e1f151e1196c3fdba8c606",
  apiKey: "AIzaSyCWv7U_z8RWYB1pG5oveK9lP1bKCcmu4Ks",
  authDomain: "gen-lang-client-0416312455.firebaseapp.com",
  storageBucket: "gen-lang-client-0416312455.firebasestorage.app",
  messagingSenderId: "702005695603",
  measurementId: ""
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-studyai-e2e8c241-607b-42ab-aad1-419c4613c9dd");
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});
