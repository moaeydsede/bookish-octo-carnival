import { db } from "./firebase.js";
import { requireRole, setupLogout } from "./guard.js";
import { $, escapeHtml, todayISO } from "./utils.js";
import {
  collection, doc, setDoc, getDocs, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

setupLogout("btnLogout");

let currentUser=null;
let currentRole=null;
let items=[];

function renderItems(){
  if(items.length===0){ $("itemsList").textContent="لا يوجد موديلات بعد."; return; }
  $("itemsList").innerHTML = items.map((it,i)=>`
    • ${escapeHtml(it.productCode)} — كمية: ${it.requiredQty}
    <a href="#" data-i="${i}" class="link" style="font-size:12px">حذف</a>
  `).join("<br/>");
  document.querySelectorAll("#itemsList a[data-i]").forEach(a=>{
    a.onclick=(e)=>{e.preventDefault(); items.splice(Number(a.dataset.i),1); renderItems();};
  });
}

$("btnAddItem").onclick=()=>{
  const productCode=$("productCode").value.trim();
  const requiredQty=Number($("requiredQty").value);
  if(!productCode || !Number.isFinite(requiredQty) || requiredQty<=0) return;
  const existing = items.find(x=>x.productCode===productCode);
  if(existing) existing.requiredQty += requiredQty;
  else items.push({productCode, requiredQty});
  $("productCode").value=""; $("requiredQty").value="";
  renderItems();
};

$("btnClear").onclick=()=>{
  items=[]; renderItems();
  $("orderCode").value=""; $("customerCode").value=""; $("customerName").value="";
  $("notes").value=""; $("orderDate").value=todayISO();
  $("msg").textContent="";
};

async function inventoryMap(){
  const invSnap=await getDocs(collection(db,"inventory"));
  const map=new Map();
  invSnap.forEach(d=>map.set(d.id, Number(d.data().onHandQty||0)));
  return map;
}

function computeReady(order, inv){
  const it = Array.isArray(order.items)?order.items:[];
  const deliveredTotals = order.deliveredTotals || {};
  let any=false, full=true;
  for(const x of it){
    const req=Number(x.requiredQty||0);
    const del=Number(deliveredTotals[x.productCode]||0);
    const rem=Math.max(0, req-del);
    if(rem<=0) continue;
    const onHand = inv.get(x.productCode)||0;
    if(onHand>0) any=true;
    if(onHand < rem) full=false;
  }
  if(!any) full=false;
  return {readyAny:any, readyFull:full};
}

function kpiRender(stats){
  $("kpi").innerHTML = `
    <div class="box"><div class="muted small">الطلبات</div><div class="num">${stats.total}</div></div>
    <div class="box"><div class="muted small">جاهز جزئي</div><div class="num">${stats.readyAny}</div></div>
    <div class="box"><div class="muted small">جاهز بالكامل</div><div class="num">${stats.readyFull}</div></div>
    <div class="box"><div class="muted small">غير جاهز</div><div class="num">${stats.notReady}</div></div>
  `;
}

async function loadOrders(){
  const inv = await inventoryMap();
  const snap = await getDocs(query(collection(db,"customer_orders"), orderBy("createdAt","desc"), limit(300)));

  const search = $("searchCustomer").value.trim().toLowerCase();
  const filter = $("filterReady").value;

  const rows=[];
  let stats={total:0,readyAny:0,readyFull:0,notReady:0};

  snap.forEach(d=>{
    const o=d.data();
    const customerName=(o.customerNameSnapshot||"").toString();
    if(search && !customerName.toLowerCase().includes(search)) return;

    const r = computeReady(o, inv);
    const isReadyAny=r.readyAny;
    const isReadyFull=r.readyFull;
    if(filter==="readyAny" && !isReadyAny) return;
    if(filter==="readyFull" && !isReadyFull) return;
    if(filter==="notready" && isReadyAny) return;

    const it = Array.isArray(o.items)?o.items:[];
    const models = it.filter(x=>Number(x.requiredQty||0)>0).length;

    stats.total++;
    if(isReadyFull) stats.readyFull++;
    if(isReadyAny) stats.readyAny++;
    if(!isReadyAny) stats.notReady++;

    rows.push({
      orderCode:o.orderCode||d.id,
      customerName,
      orderDate:o.orderDate||"",
      status:o.status||"OPEN",
      isLocked: !!o.isLocked,
      models,
      badge: isReadyFull ? "green" : (isReadyAny ? "yellow" : "red"),
      readyText: isReadyFull ? "جاهز بالكامل" : (isReadyAny ? "جاهز جزئي" : "غير جاهز")
    });
  });

  kpiRender(stats);

  if(rows.length===0){ $("ordersTable").innerHTML="<p class='muted'>لا يوجد بيانات.</p>"; return; }

  $("ordersTable").innerHTML = `
    <table class="table">
      <thead><tr>
        <th>الطلب</th><th>العميل</th><th>التاريخ</th><th>الموديلات</th><th>الحالة</th><th>جاهزية</th>
      </tr></thead>
      <tbody>
        ${rows.map(r=>`
          <tr>
            <td><a class="link" href="order.html?code=${encodeURIComponent(r.orderCode)}">${escapeHtml(r.orderCode)}</a></td>
            <td>${escapeHtml(r.customerName)}</td>
            <td>${escapeHtml(r.orderDate)}</td>
            <td>${r.models}</td>
            <td><span class="badge">${escapeHtml(r.status)}${r.isLocked?" • مقفل":""}</span></td>
            <td><span class="badge ${r.badge}">${r.readyText}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

$("btnRefresh").onclick=loadOrders;
$("searchCustomer").oninput=()=>{clearTimeout(window.__t); window.__t=setTimeout(loadOrders, 250);};
$("filterReady").onchange=loadOrders;

$("btnCreateOrder").onclick=async()=>{
  const msg=$("msg"); msg.classList.remove("err"); msg.textContent="";
  try{
    const orderCode=$("orderCode").value.trim();
    const customerCode=$("customerCode").value.trim();
    const customerNameSnapshot=$("customerName").value.trim();
    const orderDate=$("orderDate").value || todayISO();
    const notes=$("notes").value.trim();

    if(!orderCode||!customerCode||!customerNameSnapshot){ msg.classList.add("err"); msg.textContent="أكمل orderCode / customerCode / customerName"; return; }
    if(items.length===0){ msg.classList.add("err"); msg.textContent="أضف موديل واحد على الأقل"; return; }

    await setDoc(doc(db,"customer_orders",orderCode),{
      orderCode, customerCode, customerNameSnapshot, orderDate,
      status:"OPEN", isLocked:false,
      items: items.map(x=>({productCode:x.productCode, requiredQty:Number(x.requiredQty)})),
      deliveredTotals:{},
      notes,
      createdByUserId: currentUser.uid,
      createdByRole: currentRole,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },{merge:false});

    await setDoc(doc(collection(db,"audit_logs")),{
      actorUserId: currentUser.uid,
      actorRole: currentRole,
      action: "CREATE_ORDER",
      entityType: "customer_order",
      entityId: orderCode,
      summary: `Created order ${orderCode} for ${customerNameSnapshot}`,
      timestamp: new Date().toISOString()
    });

    msg.textContent="تم حفظ الطلبية";
    $("btnClear").click();
    await loadOrders();
  }catch(e){
    msg.classList.add("err"); msg.textContent=e?.message||String(e);
  }
};

(async()=>{
  const { user, role } = await requireRole(["sales","admin"]);
  currentUser=user; currentRole=role;
  if(role==="admin"){ const a=document.getElementById("goAdmin"); if(a) a.style.display="inline-block"; }
  $("orderDate").value=todayISO();
  renderItems();
  await loadOrders();
})();
