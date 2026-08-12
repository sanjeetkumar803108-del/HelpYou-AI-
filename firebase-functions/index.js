/**
 * HELP YOU AI - 1-HOUR AUTO-DELETE PRIVACY FEATURE
 * 
 * This is a Firebase Cloud Function (Node.js) that runs automatically on a schedule
 * to securely delete user-uploaded chat images from Firebase Storage once they are older than 1 hour.
 * 
 * Deployment Requirements:
 * 1. Install Firebase CLI: npm install -g firebase-tools
 * 2. Initialize functions: firebase init functions (choose JavaScript/TypeScript)
 * 3. Save this code into your functions/index.js file.
 * 4. Ensure "firebase-admin" and "firebase-functions" are listed in functions/package.json.
 * 5. Deploy functions: firebase deploy --only functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp();

/**
 * Scheduled Cloud Function (Runs every hour)
 * Scans the entire 'chat_images' directory in the default Firebase Storage bucket,
 * identifies all images uploaded more than 1 hour ago, and deletes them securely.
 */
exports.secureDeleteExpiredImages = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    console.log("Privacy cleanup routine started...");
    
    const bucket = admin.storage().bucket();
    const now = Date.now();
    const oneHourMs = 60 * 60 * 1000; // 1 hour in milliseconds
    
    let processedCount = 0;
    let deletedCount = 0;
    let errorCount = 0;

    try {
      // List all files starting with prefix 'chat_images/' (chat uploads directory)
      const [files] = await bucket.getFiles({ prefix: 'chat_images/' });
      
      console.log(`Found ${files.length} items in 'chat_images/' prefix.`);

      for (const file of files) {
        processedCount++;
        try {
          // Fetch the file metadata to get the creation timestamp
          const [metadata] = await file.getMetadata();
          const creationTime = new Date(metadata.timeCreated).getTime();
          const ageMs = now - creationTime;

          if (ageMs > oneHourMs) {
            console.log(`[EXPIRED] File: ${file.name} | Created: ${metadata.timeCreated} | Age: ${Math.round(ageMs / 60000)} minutes. Purging...`);
            await file.delete();
            deletedCount++;
          }
        } catch (fileErr) {
          console.error(`Failed to process or delete file: ${file.name}`, fileErr);
          errorCount++;
        }
      }

      console.log(`Privacy cleanup finished successfully:`);
      console.log(`- Total Files Scanned: ${processedCount}`);
      console.log(`- Expired Files Purged: ${deletedCount}`);
      console.log(`- Errors Encountered: ${errorCount}`);
    } catch (err) {
      console.error("FATAL: Failed to list bucket files for privacy cleanup:", err);
    }

    return null;
  });
