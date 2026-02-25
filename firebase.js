import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAlfux_hrBvLABEO458Rb3astFjw32tNPw",
  authDomain: "ordered-483ee.firebaseapp.com",
  projectId: "ordered-483ee",
  storageBucket: "ordered-483ee.firebasestorage.app",
  messagingSenderId: "853060793790",
  appId: "1:853060793790:web:16ea030700166ae1e375ef"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
