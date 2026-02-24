import { db } from "./firebase.js";
import { requireRole, setupLogout } from "./guard.js";
import { $, escapeHtml, icon } from "./utils.js";
import { collection, getDocs, query, orderBy, limit, doc, setDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

setupLogout("btnLogout");

async function loadPrep(){
  const snap=await getDocs(query(collection(db,"prep_requests"),orderBy("createdAt","desc"),limit(400)));
  const rows=[];
  snap.forEach(d=>{
    const p=d.data();
    if((p.status||"NEW")==="DONE") return;
    rows.push({id:d.id,orderCode:p.orderCode||"",status:p.status||"NEW",createdAt:p.createdAt||""});
  });

  if(!rows.length){ $("prepTable").innerHTML="<p class='muted'>لا يوجد طلبات تجهيز.</p>"; return; }

  $("prepTable").innerHTML=`<table class="table"><thead><tr>
    <th>الطلب</th><th>الحالة</th><th>وقت</th><th>إجراء</th>
  </tr></thead><tbody>${
    rows.map(r=>`<tr>
      <td><a class="link" href="order.html?code=${encodeURIComponent(r.orderCode)}">${escapeHtml(r.orderCode)}</a></td>
      <td><span class="badge ${r.status==="NEW"?"yellow":"badge"}">${escapeHtml(r.status)}</span></td>
      <td>${escapeHtml(r.createdAt)}</td>
      <td><button class="btnSecondary" data-done="${escapeHtml(r.id)}" style="width:auto;padding:8px 10px">${icon("check")} تم التجهيز</button></td>
    </tr>`).join("")
  }</tbody></table>`;

  document.querySelectorAll("button[data-done]").forEach(b=>b.onclick=async()=>{
    await setDoc(doc(db,"prep_requests",b.dataset.done),{status:"DONE",doneAt:new Date().toISOString()},{merge:true});
    loadPrep();
  });
}
$("btnRefresh").onclick=loadPrep;

(async()=>{
  const ctx=await requireRole(["warehouse","admin"]);
  if(ctx.role==="admin") document.getElementById("goAdmin").style.display="inline-block";
  await loadPrep();
})();