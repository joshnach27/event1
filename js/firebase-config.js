// Firebase web configuration for project event-a1159.
// IMPORTANT: replace the three REPLACE_WITH_* values with the web app config from
// Firebase Console > Project settings > General > Your apps > SDK setup and configuration.
// (apiKey, messagingSenderId and appId are not secrets for web apps; security is enforced by firestore.rules.)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'REPLACE_WITH_API_KEY',
  authDomain: 'event-a1159.firebaseapp.com',
  projectId: 'event-a1159',
  storageBucket: 'event-a1159.firebasestorage.app',
  messagingSenderId: 'REPLACE_WITH_SENDER_ID',
  appId: 'REPLACE_WITH_APP_ID',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
