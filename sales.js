import { db } from "./firebase.js";
import { requireRole, setupLogout } from "./guard.js";
import { $, escapeHtml, todayISO, icon, toast, askNotifyPermission, notifyNow } from "./utils.js";
import { collection, doc, setDoc, getDocs, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

setupLogout("btnLogout");

// UI labels
const setChip=(id,svg,t)=>{const e=document.getElementById(id); if(e) e.innerHTML=svg+`<span>${t}</span>`;};
setChip("sfAll",icon("list"),"الكل");
setChip("sfPartial",icon("truck"),"قيد التسليم");
setChip("sfOpen0",icon("bolt"),"لم يُسلم شيء");
setChip("sfComplete",icon("check"),"منتهية");

document.getElementById("btnSendToWarehouse").innerHTML=icon("truck")+" إرسال المحدد للمخزن";
document.getElementById("btnClearSelection").innerHTML=icon("trash")+" إلغاء التحديد";
document.getElementById("btnAddItem").innerHTML=icon("plus")+" إضافة";
document.getElementById("btnCreateOrder").innerHTML=icon("check")+" ترحيل/حفظ الطلب";
document.getElementById("btnClear").innerHTML=icon("trash")+" تفريغ";

let ctx=null;
let items=[];
let orderFilter="all";
let selected=new Set();
let customers=[];
let products=[];

const modalOpen=(t,h)=>{$("modalTitle").textContent=t;$("modalBody").innerHTML=h;$("modalBack").style.display="flex";};
const modalClose=()=>{$("modalBack").style.display="none";$("modalBody").innerHTML="";};
$("btnModalClose").onclick=modalClose;
$("modalBack").onclick=(e)=>{ if(e.target.id==="modalBack") modalClose(); };

function normalize(s){return String(s||"").toLowerCase().trim();}

async function loadCustomers(){
  const snap=await getDocs(query(collection(db,"customers"),orderBy("name","asc"),limit(2000)));
  customers=[];
  snap.forEach(d=>{
    const c=d.data();
    customers.push({customerCode:c.customerCode||d.id, name:c.name||"", phone:c.phone||""});
  });
  buildCustomerSelect("");
}
function buildCustomerSelect(filterText=""){
  const f=normalize(filterText);
  const words=f.split(/\s+/).filter(Boolean);
  const filtered = !words.length ? customers : customers.filter(c=>{
    const name=normalize(c.name);
    return words.every(w=>name.includes(w));
  });
  const sel=$("customerSelect");
  sel.innerHTML = `<option value="">— اختر عميل —</option>` + filtered.map(c=>`<option value="${escapeHtml(c.customerCode)}">${escapeHtml(c.name)} (${escapeHtml(c.customerCode)})</option>`).join("");
}
function currentCustomer(){
  const code=$("customerSelect").value;
  const c=customers.find(x=>x.customerCode===code);
  return c?{code:c.customerCode,name:c.name}:{code:"",name:""};
}
$("customerSearchBox").oninput=()=>buildCustomerSelect($("customerSearchBox").value);
$("customerSelect").onchange=()=>{
  const c=currentCustomer();
  $("customerName").value=c.name;
  if(c.name) toast("تم اختيار العميل", c.name);
};

async function loadProducts(){
  const snap=await getDocs(query(collection(db,"products"),orderBy("productCode","asc"),limit(5000)));
  products=[]; snap.forEach(d=>{
    const p=d.data();
    products.push({productCode:p.productCode||d.id, modelName:p.modelName||""});
  });
  const dl=document.getElementById("productsDatalist");
  if(dl){
    dl.innerHTML = products.map(p=>`<option value="${escapeHtml(p.productCode)}">${escapeHtml(p.modelName)}</option>`).join("");
  }
}
function productNameByCode(code){
  const p=products.find(x=>x.productCode===code);
  return p?p.modelName:"";
}
$("productCode").oninput=()=>{
  const code=$("productCode").value.trim();
  const name=productNameByCode(code);
  $("productNameHint").textContent = name ? `اسم الموديل: ${name}` : "";
};

function renderItemsTable(){
  if(!items.length){ $("itemsTable").innerHTML="لا يوجد أصناف بعد."; return; }
  $("itemsTable").innerHTML=`<table class="table"><thead><tr><th>رقم الموديل</th><th>اسم الموديل</th><th>الكمية</th><th></th></tr></thead><tbody>${
    items.map((it,i)=>`<tr>
      <td>${escapeHtml(it.productCode)}</td>
      <td>${escapeHtml(productNameByCode(it.productCode) || it.modelNameSnapshot || "")}</td>
      <td>${Number(it.requiredQty)||0}</td>
      <td><a class="link" href="#" data-del="${i}">حذف</a></td>
    </tr>`).join("")
  }</tbody></table>`;
  document.querySelectorAll("a[data-del]").forEach(a=>a.onclick=(e)=>{e.preventDefault();items.splice(Number(a.dataset.del),1);renderItemsTable();});
}

$("btnAddItem").onclick=()=>{
  const p=$("productCode").value.trim();
  const q=Number($("requiredQty").value);
  if(!p || !Number.isFinite(q) || q<=0) return;
  const ex=items.find(x=>x.productCode===p);
  const name=productNameByCode(p);
  if(ex) ex.requiredQty += q;
  else items.push({productCode:p, modelNameSnapshot:name, requiredQty:q});
  $("productCode").value=""; $("requiredQty").value=""; $("productNameHint").textContent="";
  renderItemsTable();
};

$("btnClear").onclick=()=>{
  items=[];
  $("orderCode").value="";
  $("notes").value="";
  $("orderDate").value=todayISO();
  $("msg").textContent=""; $("msg").classList.remove("err");
  renderItemsTable();
};

$("btnClearSelection").onclick=async()=>{ selected.clear(); await loadOrders(); };

document.querySelectorAll(".chip[data-filter]").forEach(ch=>ch.onclick=()=>{
  orderFilter=ch.dataset.filter;
  document.querySelectorAll(".chip[data-filter]").forEach(x=>x.classList.toggle("active",x===ch));
  loadOrders();
});

function passFilter(o){
  const st=o.status||"OPEN";
  const any=Object.values(o.deliveredTotals||{}).some(v=>Number(v||0)>0);
  if(orderFilter==="PARTIAL") return st==="PARTIAL";
  if(orderFilter==="COMPLETE") return st==="COMPLETE";
  if(orderFilter==="OPEN0") return !any;
  return true;
}
function renderKpi(stats){
  $("kpi").innerHTML=`
    <div class="box"><div class="muted small">الطلبات</div><div class="num">${stats.total}</div></div>
    <div class="box"><div class="muted small">قيد التسليم</div><div class="num">${stats.partial}</div></div>
    <div class="box"><div class="muted small">لم يُسلم شيء</div><div class="num">${stats.open0}</div></div>
    <div class="box"><div class="muted small">منتهية</div><div class="num">${stats.complete}</div></div>
  `;
}
function statusBadge(st, locked){
  const cls = st==="COMPLETE"?"green":(st==="PARTIAL"?"yellow":"red");
  return `<span class="badge ${cls}">${escapeHtml(st)}${locked?" • مقفل":""}</span>`;
}

async function loadOrders(){
  const snap=await getDocs(query(collection(db,"customer_orders"),orderBy("createdAt","desc"),limit(600)));
  const search=normalize($("searchCustomer").value);
  const rows=[];
  let stats={total:0,partial:0,open0:0,complete:0};

  snap.forEach(d=>{
    const o=d.data();
    const code=o.orderCode||d.id;
    const cname=String(o.customerNameSnapshot||"");
    if(search && !(normalize(cname).includes(search) || normalize(code).includes(search))) return;
    if(!passFilter(o)) return;

    const st=o.status||"OPEN";
    const any=Object.values(o.deliveredTotals||{}).some(v=>Number(v||0)>0);

    stats.total++;
    if(st==="PARTIAL") stats.partial++;
    if(st==="COMPLETE") stats.complete++;
    if(!any) stats.open0++;

    rows.push({code,cname,date:o.orderDate||"",st,locked:!!o.isLocked,itemsCount:(Array.isArray(o.items)?o.items.length:0),sel:selected.has(code)});
  });

  renderKpi(stats);
  if(!rows.length){ $("ordersTable").innerHTML="<p class='muted'>لا يوجد بيانات.</p>"; return; }

  $("ordersTable").innerHTML=`<table class="table"><thead><tr>
    <th class="noPrint">تحديد</th><th>الطلب</th><th>العميل</th><th>التاريخ</th><th>الأصناف</th><th>الحالة</th>
  </tr></thead><tbody>${
    rows.map(r=>`<tr>
      <td class="noPrint"><input type="checkbox" data-sel="${escapeHtml(r.code)}" ${r.sel?"checked":""}/></td>
      <td><a class="link" href="order.html?code=${encodeURIComponent(r.code)}">${escapeHtml(r.code)}</a></td>
      <td><a class="link" href="order.html?code=${encodeURIComponent(r.code)}">${escapeHtml(r.cname)}</a></td>
      <td>${escapeHtml(r.date)}</td>
      <td>${r.itemsCount}</td>
      <td>${statusBadge(r.st,r.locked)}</td>
    </tr>`).join("")
  }</tbody></table>`;

  document.querySelectorAll("input[data-sel]").forEach(cb=>cb.onchange=()=>{
    const code=cb.dataset.sel;
    if(cb.checked) selected.add(code); else selected.delete(code);
  });
}

$("btnRefresh").onclick=loadOrders;
$("searchCustomer").oninput=()=>{clearTimeout(window.__s);window.__s=setTimeout(loadOrders,250);};

$("btnCreateOrder").onclick=async()=>{
  const m=$("msg"); m.classList.remove("err"); m.textContent="";
  try{
    const orderCode=$("orderCode").value.trim();
    const c=currentCustomer();
    const customerCode=c.code;
    const customerNameSnapshot=c.name;
    const orderDate=$("orderDate").value || todayISO();
    const notes=$("notes").value.trim();

    if(!orderCode){m.classList.add("err");m.textContent="أكمل orderCode";return;}
    if(!customerCode){m.classList.add("err");m.textContent="اختر العميل من القائمة";return;}
    if(!items.length){m.classList.add("err");m.textContent="أضف صنف واحد على الأقل";return;}

    await setDoc(doc(db,"customer_orders",orderCode),{
      orderCode,customerCode,customerNameSnapshot,orderDate,notes,
      status:"OPEN",isLocked:false,
      items: items.map(x=>({productCode:x.productCode, modelNameSnapshot:x.modelNameSnapshot||"", requiredQty:Number(x.requiredQty)})),
      deliveredTotals:{},
      createdByUserId: ctx.user.uid,
      createdByRole: ctx.role,
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    },{merge:false});

    await setDoc(doc(collection(db,"audit_logs")),{
      actorUserId: ctx.user.uid,actorRole: ctx.role,
      action:"CREATE_ORDER",entityType:"customer_order",entityId:orderCode,
      summary:`Created order ${orderCode} for ${customerNameSnapshot}`,
      timestamp:new Date().toISOString()
    });

    toast("تم ترحيل الطلب", `Order: ${orderCode}`);
    m.textContent="تم حفظ/ترحيل الطلب";
    $("btnClear").click();
    await loadOrders();
  }catch(e){m.classList.add("err");m.textContent=e?.message||String(e);}
};

$("btnSendToWarehouse").onclick=async()=>{
  const m=$("msg"); m.classList.remove("err"); m.textContent="";
  try{
    const codes=[...selected];
    if(!codes.length){m.classList.add("err");m.textContent="حدد طلب واحد على الأقل";return;}
    for(const code of codes){
      await setDoc(doc(db,"prep_requests",code),{
        orderCode:code,
        status:"NEW",
        lastSentAt:new Date().toISOString(),
        createdByUserId: ctx.user.uid,
        createdByRole: ctx.role,
        createdAt:new Date().toISOString()
      },{merge:true});
      await setDoc(doc(collection(db,"audit_logs")),{
        actorUserId: ctx.user.uid,actorRole: ctx.role,
        action:"SEND_TO_WAREHOUSE",entityType:"prep_request",entityId:code,
        summary:`Sent order ${code} to warehouse`,
        timestamp:new Date().toISOString()
      });
    }
    m.textContent=`تم إرسال ${codes.length} طلب للمخزن`;
    toast("إرسال للمخزن", `عدد الطلبات: ${codes.length}`);
    selected.clear();
    await loadOrders();
  }catch(e){m.classList.add("err");m.textContent=e?.message||String(e);}
};

async function setupRealtime(){
  await askNotifyPermission();
  const deliveriesQ=query(collection(db,"deliveries"),orderBy("createdAt","desc"),limit(1));
  let first=true;
  onSnapshot(deliveriesQ,(snap)=>{
    if(first){first=false;return;}
    snap.docChanges().forEach(ch=>{
      if(ch.type==="added"){
        const d=ch.doc.data();
        const title="تسليم جديد من المخزن";
        const body=`طلب ${d.orderCode} • ${Array.isArray(d.items)?d.items.length:0} صنف`;
        toast(title, body);
        notifyNow(title, body);
      }
    });
  });
}

(async()=>{
  ctx=await requireRole(["sales","admin"]);
  if(ctx.role==="admin") document.getElementById("goAdmin").style.display="inline-block";
  $("orderDate").value=todayISO();
  renderItemsTable();
  await loadCustomers();
  await loadProducts();
  await loadOrders();
  await setupRealtime();
})();