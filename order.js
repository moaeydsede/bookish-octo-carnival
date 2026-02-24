import { db } from "./firebase.js";
import { requireRole, setupLogout } from "./guard.js";
import { $, escapeHtml } from "./utils.js";
import {
  doc, getDoc, collection, query, where, getDocs, runTransaction, setDoc
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

setupLogout("btnLogout");

const params = new URLSearchParams(location.search);
const orderCode = params.get("code") || "";

let ctx = null;
let orderData = null;
let inventory = new Map();
let draft = new Map(); // productCode -> qtyToDeliver

function badgeStatus(st){
  if(st==="COMPLETE") return "green";
  if(st==="PARTIAL") return "yellow";
  return "red";
}

async function loadInventoryForItems(items){
  inventory.clear();
  for(const it of items){
    const invSnap = await getDoc(doc(db,"inventory", it.productCode));
    inventory.set(it.productCode, invSnap.exists() ? Number(invSnap.data().onHandQty||0) : 0);
  }
}

function computeDeliveredTotals(){
  return orderData?.deliveredTotals || {};
}

function renderHeader(){
  const o=orderData;
  const st=o.status||"OPEN";
  $("headerCard").innerHTML = `
    <div class="row">
      <div class="grow">
        <h3>طلب: ${escapeHtml(o.orderCode)}</h3>
        <div class="muted">العميل: <b>${escapeHtml(o.customerNameSnapshot||"")}</b> • كود: ${escapeHtml(o.customerCode||"")}</div>
        <div class="muted">التاريخ: ${escapeHtml(o.orderDate||"")} • ملاحظات: ${escapeHtml(o.notes||"")}</div>
      </div>
      <div>
        <div class="badge ${badgeStatus(st)}">${escapeHtml(st)}${o.isLocked?" • مقفل":""}</div>
      </div>
    </div>
  `;
}

function renderItems(){
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  const deliveredTotals = computeDeliveredTotals();

  const rows = items.map(it=>{
    const req = Number(it.requiredQty||0);
    const del = Number(deliveredTotals[it.productCode]||0);
    const rem = Math.max(0, req-del);
    const onHand = inventory.get(it.productCode) || 0;
    const qtyDraft = Number(draft.get(it.productCode)||0);

    return { productCode: it.productCode, req, del, rem, onHand, qtyDraft };
  });

  $("itemsTable").innerHTML = `
    <table class="table">
      <thead><tr>
        <th>الموديل</th><th>مطلوب</th><th>تم تسليم</th><th>متبقي</th><th>متوفر بالمخزن</th>
        <th class="noPrint">تجهيز الآن</th>
      </tr></thead>
      <tbody>
        ${rows.map(r=>`
          <tr>
            <td>${escapeHtml(r.productCode)}</td>
            <td>${r.req}</td>
            <td>${r.del}</td>
            <td>${r.rem}</td>
            <td>${r.onHand}</td>
            <td class="noPrint">
              ${ctx.role==="warehouse" || ctx.role==="admin" ? `
                <input data-p="${escapeHtml(r.productCode)}" type="number" min="0"
                  max="${Math.min(r.rem, r.onHand)}" value="${r.qtyDraft}" />
                <div class="muted small">max: ${Math.min(r.rem, r.onHand)}</div>
              ` : `<span class="muted">—</span>`}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll('#itemsTable input[data-p]').forEach(inp=>{
    inp.oninput=()=>{
      const p=inp.getAttribute("data-p");
      const v=Math.max(0, Number(inp.value||0));
      draft.set(p, v);
    };
  });
}

async function renderDeliveries(){
  const snap = await getDocs(query(collection(db,"deliveries"), where("orderCode","==", orderCode)));
  const rows=[];
  snap.forEach(d=>{
    const x=d.data();
    rows.push({
      id:d.id,
      status:x.status||"DRAFT",
      createdAt:x.createdAt||"",
      createdByRole:x.createdByRole||"",
      items:Array.isArray(x.items)?x.items:[]
    });
  });
  rows.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));

  if(rows.length===0){ $("deliveriesTable").innerHTML="<p class='muted'>لا يوجد تسليمات.</p>"; return; }

  $("deliveriesTable").innerHTML = rows.map(r=>`
    <div class="card" style="margin:10px 0">
      <div class="row">
        <div class="grow">
          <b>${escapeHtml(r.id)}</b>
          <div class="muted small">Status: ${escapeHtml(r.status)} • ${escapeHtml(r.createdAt)} • ${escapeHtml(r.createdByRole)}</div>
        </div>
      </div>
      <div class="muted small">${r.items.map(i=>`${escapeHtml(i.productCode)}: ${Number(i.qty||0)}`).join(" | ")}</div>
    </div>
  `).join("");
}

function calcDeliveryItems(){
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  const deliveredTotals = computeDeliveredTotals();
  const out=[];
  for(const it of items){
    const req=Number(it.requiredQty||0);
    const del=Number(deliveredTotals[it.productCode]||0);
    const rem=Math.max(0, req-del);
    const onHand=inventory.get(it.productCode)||0;
    const qty=Number(draft.get(it.productCode)||0);
    const max=Math.min(rem,onHand);
    if(qty>0){
      if(qty>max) throw new Error(`الكمية أكبر من المسموح للموديل ${it.productCode} (max ${max})`);
      out.push({productCode: it.productCode, qty});
    }
  }
  return out;
}

function computeNewOrderState(deliveredTotals, items){
  let anyDelivered=false;
  let allDone=true;
  for(const it of items){
    const req=Number(it.requiredQty||0);
    const del=Number(deliveredTotals[it.productCode]||0);
    if(del>0) anyDelivered=true;
    if(del < req) allDone=false;
  }
  let status="OPEN";
  if(allDone && items.length>0) status="COMPLETE";
  else if(anyDelivered) status="PARTIAL";
  return { status, isLocked: anyDelivered };
}

async function saveDelivery(status){
  const msg=$("msg"); msg.classList.remove("err"); msg.textContent="";
  try{
    if(!orderCode) throw new Error("لا يوجد orderCode");
    const deliveryItems = calcDeliveryItems();
    if(deliveryItems.length===0) throw new Error("أدخل كمية تجهيز على الأقل");

    const deliveryId = `${orderCode}-${Date.now()}`;
    await setDoc(doc(db,"deliveries",deliveryId),{
      deliveryId,
      orderCode,
      status,
      items: deliveryItems,
      createdByUserId: ctx.user.uid,
      createdByRole: ctx.role,
      createdAt: new Date().toISOString()
    });

    await setDoc(doc(collection(db,"audit_logs")),{
      actorUserId: ctx.user.uid,
      actorRole: ctx.role,
      action: status==="CONFIRMED" ? "CONFIRM_DELIVERY" : "CREATE_DELIVERY_DRAFT",
      entityType: "delivery",
      entityId: deliveryId,
      summary: `${status} for ${orderCode}`,
      timestamp: new Date().toISOString()
    });

    msg.textContent = status==="CONFIRMED" ? "تم تأكيد التسليم" : "تم حفظ مسودة التسليم";
    draft.clear();
    await refreshAll();
  }catch(e){
    msg.classList.add("err"); msg.textContent=e?.message||String(e);
  }
}

async function confirmDeliveryTransaction(){
  const msg=$("msg"); msg.classList.remove("err"); msg.textContent="";
  try{
    const deliveryItems = calcDeliveryItems();
    if(deliveryItems.length===0) throw new Error("أدخل كمية تجهيز على الأقل");

    const deliveryId = `${orderCode}-C-${Date.now()}`;
    const orderRef = doc(db,"customer_orders", orderCode);

    await runTransaction(db, async (tx)=>{
      const orderSnap = await tx.get(orderRef);
      if(!orderSnap.exists()) throw new Error("الطلب غير موجود");
      const o = orderSnap.data();
      const items = Array.isArray(o.items) ? o.items : [];
      const deliveredTotals = { ...(o.deliveredTotals||{}) };

      // update inventory + totals
      for(const di of deliveryItems){
        const invRef = doc(db,"inventory", di.productCode);
        const invSnap = await tx.get(invRef);
        const onHand = invSnap.exists() ? Number(invSnap.data().onHandQty||0) : 0;
        if(onHand < di.qty) throw new Error(`المتوفر أقل من المطلوب للموديل ${di.productCode}`);
        tx.set(invRef, { onHandQty: onHand - di.qty, updatedAt: new Date().toISOString() }, { merge:true });
        deliveredTotals[di.productCode] = Number(deliveredTotals[di.productCode]||0) + Number(di.qty);
      }

      const newState = computeNewOrderState(deliveredTotals, items);

      tx.set(orderRef, {
        deliveredTotals,
        status: newState.status,
        isLocked: newState.isLocked,
        updatedAt: new Date().toISOString()
      }, { merge:true });

      // create delivery
      const delRef = doc(db,"deliveries", deliveryId);
      tx.set(delRef, {
        deliveryId,
        orderCode,
        status: "CONFIRMED",
        items: deliveryItems,
        createdByUserId: ctx.user.uid,
        createdByRole: ctx.role,
        createdAt: new Date().toISOString()
      });

      // audit
      const auditRef = doc(collection(db,"audit_logs"));
      tx.set(auditRef, {
        actorUserId: ctx.user.uid,
        actorRole: ctx.role,
        action: "CONFIRM_DELIVERY_TX",
        entityType: "customer_order",
        entityId: orderCode,
        summary: `Confirmed delivery ${deliveryId}`,
        timestamp: new Date().toISOString()
      });
    });

    msg.textContent="تم تأكيد التسليم وخصم المخزون";
    draft.clear();
    await refreshAll();
  }catch(e){
    msg.classList.add("err"); msg.textContent=e?.message||String(e);
  }
}

async function refreshAll(){
  const osnap = await getDoc(doc(db,"customer_orders", orderCode));
  orderData = osnap.exists()?osnap.data():null;
  if(!orderData) throw new Error("الطلب غير موجود");
  await loadInventoryForItems(orderData.items||[]);
  renderHeader();
  renderItems();
  await renderDeliveries();
}

document.getElementById("btnPrint").onclick = ()=>window.print();

document.getElementById("btnSaveDraft").onclick = ()=>saveDelivery("DRAFT");
document.getElementById("btnConfirmDelivery").onclick = ()=>confirmDeliveryTransaction();

(async()=>{
  ctx = await requireRole(["admin","sales","warehouse"]);
  if(ctx.role==="sales") document.getElementById("goSales").style.display="inline-block";
  if(ctx.role==="warehouse") { document.getElementById("goWarehouse").style.display="inline-block"; document.getElementById("warehouseActions").style.display="flex"; }
  if(ctx.role==="admin") { document.getElementById("goAdmin").style.display="inline-block"; document.getElementById("warehouseActions").style.display="flex"; }
  if(!orderCode){ document.getElementById("headerCard").innerHTML="<p class='muted'>افتح الصفحة مع ?code=ORDER_CODE</p>"; return; }
  await refreshAll();
})();
