import { auth, db } from "./firebase.js";
import { $ } from "./utils.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
const msg=$("msg");
function go(role){if(role==="admin")location.href="admin.html";else if(role==="sales")location.href="sales.html";else if(role==="warehouse")location.href="warehouse.html";else{msg.classList.add("err");msg.textContent="Role غير معروف: "+role;}}
$("btnLogin").onclick=async()=>{msg.classList.remove("err");msg.textContent="";try{
const cred=await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);
const us=await getDoc(doc(db,"users",cred.user.uid));
const role=us.exists()?us.data().role:null;const active=us.exists()?(us.data().isActive!==false):false;
if(!role||!active){msg.classList.add("err");msg.textContent="المستخدم غير مفعّل أو بدون role داخل users/{uid}";return;}
go(role);}catch(e){msg.classList.add("err");msg.textContent=e?.message||String(e);}};
$("btnLogout").onclick=()=>signOut(auth);
onAuthStateChanged(auth,async(u)=>{if(!u){$("btnLogout").style.display="none";return;}
$("btnLogout").style.display="inline-block";
try{const us=await getDoc(doc(db,"users",u.uid));if(us.exists()&&us.data().role&&us.data().isActive!==false)go(us.data().role);}catch{}});
