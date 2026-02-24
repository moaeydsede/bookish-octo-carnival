import { auth, db } from "./firebase.js";
import { $ } from "./utils.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const msg = $("msg");

function redirectByRole(role) {
  if (role === "admin") location.href = "admin.html";
  else if (role === "sales") location.href = "sales.html";
  else if (role === "warehouse") location.href = "warehouse.html";
  else {
    msg.classList.add("err");
    msg.textContent = "Role غير معروف: " + role;
  }
}

$("btnLogin").onclick = async () => {
  msg.classList.remove("err");
  msg.textContent = "";
  try {
    const email = $("email").value.trim();
    const password = $("password").value;
    const cred = await signInWithEmailAndPassword(auth, email, password);

    const usnap = await getDoc(doc(db, "users", cred.user.uid));
    const role = usnap.exists() ? usnap.data().role : null;
    const isActive = usnap.exists() ? (usnap.data().isActive !== false) : false;

    if (!role || !isActive) {
      msg.classList.add("err");
      msg.textContent = "المستخدم غير مفعّل أو بدون Role داخل users/{uid}";
      return;
    }
    redirectByRole(role);
  } catch (e) {
    msg.classList.add("err");
    msg.textContent = e?.message || String(e);
  }
};

$("btnLogout").onclick = () => signOut(auth);

onAuthStateChanged(auth, async (u) => {
  if (!u) { $("btnLogout").style.display = "none"; return; }
  $("btnLogout").style.display = "inline-block";
  try {
    const usnap = await getDoc(doc(db, "users", u.uid));
    if (usnap.exists() && usnap.data().role && usnap.data().isActive !== false) {
      redirectByRole(usnap.data().role);
    }
  } catch {}
});
