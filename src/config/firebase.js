import admin from 'firebase-admin';
import logger from '../utils/logger.js';

// Initialize Firebase Admin with either ADC or a base64 service account from env
function initFirebase() {
  if (admin.apps.length) return admin.app();

  const useBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (useBase64) {
    const json = Buffer.from(useBase64, 'base64').toString('utf8');
    const creds = JSON.parse(json);
    admin.initializeApp({
      credential: admin.credential.cert(creds),
      projectId: process.env.FIREBASE_PROJECT_ID,
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
  } else {
    // Application Default Credentials:
    // requires GOOGLE_APPLICATION_CREDENTIALS to be set to a service account file path
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
  }

  logger.info('Firebase initialized');
  return admin.app();
}

const app = initFirebase();
export const firestore = admin.firestore();
export const auth = admin.auth();
export const storage = admin.storage();
export default app;
