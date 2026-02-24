import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
export function setupLogout(btnId="btnLogout"){const b=document.getElementById(btnId);if(b)b.onclick=()=>signOut(auth);}
export function requireRole(roles){return new Promise((resolve)=>{onAuthStateChanged(auth,async(u)=>{if(!u){location.href="index.html";return;}
const us=await getDoc(doc(db,"users",u.uid));const role=us.exists()?us.data().role:null;const active=us.exists()?(us.data().isActive!==false):false;
if(!role||!active||!roles.includes(role)){location.href="index.html";return;}resolve({user:u,role,profile:us.data()});});});}
