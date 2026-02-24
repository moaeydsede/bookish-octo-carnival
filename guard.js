import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

export function setupLogout(btnId="btnLogout") {
  const btn = document.getElementById(btnId);
  if (btn) btn.onclick = () => signOut(auth);
}

export function requireRole(allowedRoles) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (u) => {
      if (!u) { location.href = "index.html"; return; }
      const usnap = await getDoc(doc(db, "users", u.uid));
      const role = usnap.exists() ? usnap.data().role : null;
      const isActive = usnap.exists() ? (usnap.data().isActive !== false) : false;
      if (!role || !isActive || !allowedRoles.includes(role)) { location.href = "index.html"; return; }
      resolve({ user: u, role, profile: usnap.data() });
    });
  });
}
