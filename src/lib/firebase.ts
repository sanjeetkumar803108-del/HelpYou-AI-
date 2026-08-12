import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
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

// Connection test as per firebase-integration skill
async function testConnection() {
  try {
    // Attempting to fetch a non-existent doc from server to verify connectivity
    await getDocFromServer(doc(db, '_connection_test', 'status'));
    console.log("Firestore connection verified.");
  } catch (error: any) {
    if (error?.message?.includes('unavailable') || error?.code === 'unavailable') {
      console.error("CRITICAL: Firestore is unavailable. This usually means the region is misconfigured or the project is still provisioning.", error);
    } else {
      // Ignore other errors like permission denied if they mean we actually reached the server
      console.log("Firestore reachability test completed.");
    }
  }
}
testConnection();
