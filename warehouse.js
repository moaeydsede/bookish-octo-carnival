import { db } from "./firebase.js";
import { requireRole, setupLogout } from "./guard.js";
import { $, escapeHtml, icon, toast, askNotifyPermission, notifyNow } from "./utils.js";
import { collection, onSnapshot, query, orderBy, limit, doc, setDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

setupLogout("btnLogout");

function render(rows){
  if(!rows.length){ $("prepTable").innerHTML="<p class='muted'>لا يوجد طلبات تجهيز.</p>"; return; }
  $("prepTable").innerHTML=`<table class="table"><thead><tr>
    <th>الطلب</th><th>الحالة</th><th>آخر إرسال</th><th>إجراء</th>
  </tr></thead><tbody>${
    rows.map(r=>`<tr>
      <td><a class="link" href="order.html?code=${encodeURIComponent(r.orderCode)}">${escapeHtml(r.orderCode)}</a></td>
      <td><span class="badge ${r.status==="NEW"?"yellow":"badge"}">${escapeHtml(r.status)}</span></td>
      <td>${escapeHtml(r.lastSentAt||r.createdAt||"")}</td>
      <td><button class="btnSecondary" data-done="${escapeHtml(r.orderCode)}" style="width:auto;padding:8px 10px">${icon("check")} تم التجهيز</button></td>
    </tr>`).join("")
  }</tbody></table>`;

  document.querySelectorAll("button[data-done]").forEach(b=>b.onclick=async()=>{
    await setDoc(doc(db,"prep_requests",b.dataset.done),{status:"DONE",doneAt:new Date().toISOString()},{merge:true});
    toast("تم التجهيز", `Order: ${b.dataset.done}`);
  });
}

async function setupRealtime(){
  await askNotifyPermission();
  const qy=query(collection(db,"prep_requests"),orderBy("createdAt","desc"),limit(500));
  let first=true;
  onSnapshot(qy,(snap)=>{
    const rows=[];
    snap.forEach(d=>{
      const p=d.data();
      if((p.status||"NEW")==="DONE") return;
      rows.push({orderCode:p.orderCode||d.id,status:p.status||"NEW",createdAt:p.createdAt||"",lastSentAt:p.lastSentAt||""});
    });
    render(rows);

    if(first){first=false;return;}
    snap.docChanges().forEach(ch=>{
      if(ch.type==="added"){
        const p=ch.doc.data();
        if((p.status||"NEW")!=="DONE"){
          const title="طلب جديد للتجهيز";
          const body=`Order: ${p.orderCode||ch.doc.id}`;
          toast(title, body);
          notifyNow(title, body);
        }
      }
    });
  });
}

document.getElementById("btnRefresh").onclick=()=>location.reload();


async function setupWarehousePush(){
  const stateEl = document.getElementById("pushState");
  const setState=(t)=>{ if(stateEl) stateEl.textContent=t; };
  try{
    if(!("OneSignalDeferred" in window)) { setState("OneSignal غير متاح"); return; }
    const OneSignal = await new Promise((resolve)=>{ window.OneSignalDeferred.push(async (os)=>resolve(os)); });
    const refresh = async ()=>{
      const perm = await OneSignal.Notifications.permission;
      const subId = await OneSignal.User.PushSubscription.getId();
      const optedIn = await OneSignal.User.PushSubscription.optedIn;
      setState(`permission=${perm} | optedIn=${optedIn} | subscriptionId=${subId || "—"}`);
    };

    document.getElementById("btnEnableWarehousePush").onclick = async ()=>{
      await OneSignal.Notifications.requestPermission();
      const perm = await OneSignal.Notifications.permission;
      if(perm!=="granted"){ toast("الإشعارات","لم يتم السماح"); return; }
      await OneSignal.User.PushSubscription.optIn();
      toast("الإشعارات","تم تفعيل الإشعارات للمخزن");
      await refresh();
    };
    document.getElementById("btnDisableWarehousePush").onclick = async ()=>{
      await OneSignal.User.PushSubscription.optOut();
      toast("الإشعارات","تم إلغاء الإشعارات");
      await refresh();
    };
    await refresh();
  }catch(e){
    console.warn(e);
    setState("تعذر تهيئة الإشعارات");
  }
}

(async()=>{
  const ctx=await requireRole(["warehouse","admin"]);
  if(ctx.role==="admin") document.getElementById("goAdmin").style.display="inline-block";
  await setupRealtime();
  try{ await setupWarehousePush(); }catch{}
})();