import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

 const firebaseConfig = {
   apiKey: "AIzaSyD-zmg_xtQTYJ17gtC_nJ6PbdRoMZLdHeM",
   authDomain: "helpyou-ai.firebaseapp.com",
   projectId: "helpyou-ai",
   storageBucket: "helpyou-ai.firebasestorage.app",
   messagingSenderId: "545444148705",
   appId: "1:545444148705:web:ec7e942fccd66d39c5cea0",
  measurementId: "G-TFX8FHZ9XP"
 };

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
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
