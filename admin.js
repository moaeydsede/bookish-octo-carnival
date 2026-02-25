import { db } from "./firebase.js";
import { requireRole, setupLogout } from "./guard.js";
import { $, escapeHtml, icon, toast, askNotifyPermission, notifyNow, openMenu, closeMenu } from "./utils.js";
import { collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, limit, where } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

setupLogout("btnLogout");
const setChip=(id,svg,t)=>{const e=document.getElementById(id); if(e) e.innerHTML=svg+`<span>${t}</span>`;};
setChip("tabOrders",icon("list"),"الطلبيات");
setChip("tabCustomers",icon("users"),"العملاء");
setChip("tabProducts",icon("list"),"المواد");
setChip("tabExcel",icon("upload"),"Excel");
setChip("tabAudit",icon("audit"),"العمليات");
setChip("fAll",icon("list"),"الكل");
setChip("fComplete",icon("check"),"المنتهية");
setChip("fPartial",icon("truck"),"قيد التسليم");
setChip("fOpen0",icon("bolt"),"لم يُسلم شيء");
document.getElementById("btnSaveCustomer").innerHTML=icon("plus")+" حفظ العميل";
document.getElementById("btnPreview").innerHTML=icon("search")+" Preview";
document.getElementById("btnApply").innerHTML=icon("upload")+" Apply";
document.getElementById("btnExport").innerHTML=icon("download")+" Export";

let tab="orders";
let orderFilter="all";
let customers=[];

const modalOpen=(t,h)=>{$("modalTitle").textContent=t;$("modalBody").innerHTML=h;$("modalBack").style.display="flex";};
const modalClose=()=>{$("modalBack").style.display="none";$("modalBody").innerHTML="";};
$("btnModalClose").onclick=modalClose;
$("modalBack").onclick=(e)=>{ if(e.target.id==="modalBack") modalClose(); };

function showTab(name){
  tab=name;
  document.getElementById("sectionOrders").style.display=name==="orders"?"block":"none";
  document.getElementById("sectionCustomers").style.display=name==="customers"?"block":"none";
  document.getElementById("sectionProducts").style.display=name==="products"?"block":"none";
  document.getElementById("sectionExcel").style.display=name==="excel"?"block":"none";
  document.getElementById("sectionAudit").style.display=name==="audit"?"block":"none";
  document.querySelectorAll(".chip[data-tab]").forEach(x=>x.classList.toggle("active",x.dataset.tab===name));
}
document.querySelectorAll(".chip[data-tab]").forEach(x=>x.onclick=()=>showTab(x.dataset.tab));

document.getElementById("btnMenu").onclick=openMenu;
document.getElementById("btnMenuClose").onclick=closeMenu;
document.getElementById("menuBack").onclick=(e)=>{if(e.target.id==="menuBack") closeMenu();};
document.querySelectorAll("#menuBack .menuItem[data-filter]").forEach(mi=>mi.onclick=()=>{orderFilter=mi.dataset.filter; closeMenu(); loadOrders();});

document.querySelectorAll(".chip[data-filter]").forEach(x=>x.onclick=()=>{
  orderFilter=x.dataset.filter;
  document.querySelectorAll(".chip[data-filter]").forEach(c=>c.classList.toggle("active",c===x));
  loadOrders();
});

async function loadCustomers(){
  const snap=await getDocs(query(collection(db,"customers"),orderBy("name","asc"),limit(1000)));
  customers=[];
  snap.forEach(d=>customers.push({id:d.id,...d.data()}));
}

async function renderCustomers(){
  await loadCustomers();
  const s=$("custSearch").value.trim().toLowerCase();
  const rows=customers.filter(c=>!s || String(c.name||"").toLowerCase().includes(s));
  if(!rows.length){ $("customersTable").innerHTML="<p class='muted'>لا يوجد عملاء.</p>"; return; }

  $("customersTable").innerHTML=`<table class="table"><thead><tr><th>الكود</th><th>الاسم</th><th>هاتف</th><th>إجراءات</th></tr></thead><tbody>${
    rows.map(c=>`<tr>
      <td>${escapeHtml(c.customerCode||c.id)}</td>
      <td><a class="link" href="#" data-open="${escapeHtml(c.customerCode||c.id)}">${escapeHtml(c.name||"")}</a></td>
      <td>${escapeHtml(c.phone||"")}</td>
      <td>
        <button class="btnSecondary" data-edit="${escapeHtml(c.customerCode||c.id)}" style="width:auto;padding:8px 10px">${icon("edit")} تعديل</button>
        <button class="btnDanger" data-del="${escapeHtml(c.customerCode||c.id)}" style="width:auto;padding:8px 10px">${icon("trash")} حذف</button>
      </td>
    </tr>`).join("")
  }</tbody></table>`;

  document.querySelectorAll("a[data-open]").forEach(a=>a.onclick=async(e)=>{
    e.preventDefault();
    const code=a.dataset.open;
    const os=await getDocs(query(collection(db,"customer_orders"),where("customerCode","==",code),orderBy("createdAt","desc"),limit(300)));
    const orders=[]; os.forEach(d=>orders.push(d.data()));
    modalOpen("طلبيات العميل", orders.length?`
      <table class="table"><thead><tr><th>orderCode</th><th>date</th><th>status</th><th></th></tr></thead><tbody>${
        orders.map(o=>`<tr>
          <td><a class="link" href="order.html?code=${encodeURIComponent(o.orderCode)}">${escapeHtml(o.orderCode)}</a></td>
          <td>${escapeHtml(o.orderDate||"")}</td>
          <td><span class="badge">${escapeHtml(o.status||"")}</span></td>
          <td><a class="link" href="order.html?code=${encodeURIComponent(o.orderCode)}">فتح</a></td>
        </tr>`).join("")
      }</tbody></table>
    `:"<p class='muted'>لا يوجد طلبيات.</p>");
  });

  document.querySelectorAll("button[data-edit]").forEach(b=>b.onclick=()=>{
    const code=b.dataset.edit;
    const c=customers.find(x=>String(x.customerCode||x.id)===String(code));
    if(!c) return;
    $("customerCode").value=code;
    $("customerName").value=c.name||"";
    $("customerPhone").value=c.phone||"";
    $("customerAddress").value=c.address||"";
    window.scrollTo({top:0,behavior:"smooth"});
  });

  document.querySelectorAll("button[data-del]").forEach(b=>b.onclick=async()=>{
    const code=b.dataset.del;
    if(!confirm("حذف العميل؟")) return;
    await deleteDoc(doc(db,"customers",code));
    await setDoc(doc(collection(db,"audit_logs")),{actorRole:"admin",action:"DELETE_CUSTOMER",entityType:"customer",entityId:code,summary:`Deleted customer ${code}`,timestamp:new Date().toISOString()});
    renderCustomers();
  });
}

$("btnCustRefresh").onclick=renderCustomers;
$("custSearch").oninput=()=>{clearTimeout(window.__cs);window.__cs=setTimeout(renderCustomers,250);};

$("btnSaveCustomer").onclick=async()=>{
  const m=$("custMsg");m.classList.remove("err");m.textContent="";
  try{
    const code=$("customerCode").value.trim();
    const name=$("customerName").value.trim();
    if(!code||!name){m.classList.add("err");m.textContent="أكمل customerCode و اسم العميل";return;}
    await setDoc(doc(db,"customers",code),{
      customerCode:code,name,
      phone:$("customerPhone").value.trim(),
      address:$("customerAddress").value.trim(),
      isActive:true,updatedAt:new Date().toISOString()
    },{merge:true});
    await setDoc(doc(collection(db,"audit_logs")),{actorRole:"admin",action:"UPSERT_CUSTOMER",entityType:"customer",entityId:code,summary:`Upsert customer ${code} ${name}`,timestamp:new Date().toISOString()});
    m.textContent="تم حفظ العميل";
    $("customerCode").value="";$("customerName").value="";$("customerPhone").value="";$("customerAddress").value="";
    renderCustomers();
  }catch(e){m.classList.add("err");m.textContent=e?.message||String(e);}
};

async function loadOrders(){
  const snap=await getDocs(query(collection(db,"customer_orders"),orderBy("createdAt","desc"),limit(500)));
  const s=$("ordersSearch").value.trim().toLowerCase();
  let stats={total:0,complete:0,partial:0,open0:0};
  const rows=[];
  snap.forEach(d=>{
    const o=d.data();
    const code=o.orderCode||d.id;
    const cname=String(o.customerNameSnapshot||"");
    const st=o.status||"OPEN";
    const any=Object.values(o.deliveredTotals||{}).some(v=>Number(v||0)>0);

    if(orderFilter==="COMPLETE" && st!=="COMPLETE") return;
    if(orderFilter==="PARTIAL" && st!=="PARTIAL") return;
    if(orderFilter==="OPEN0" && any) return;

    if(s && !(cname.toLowerCase().includes(s) || String(code).toLowerCase().includes(s))) return;

    stats.total++;
    if(st==="COMPLETE") stats.complete++;
    if(st==="PARTIAL") stats.partial++;
    if(!any) stats.open0++;

    rows.push({code,cname,date:o.orderDate||"",itemsCount:(Array.isArray(o.items)?o.items.length:0),st,locked:!!o.isLocked});
  });

  $("ordersKpi").innerHTML=`
    <div class="box"><div class="muted small">الطلبات</div><div class="num">${stats.total}</div></div>
    <div class="box"><div class="muted small">المنتهية</div><div class="num">${stats.complete}</div></div>
    <div class="box"><div class="muted small">قيد التسليم</div><div class="num">${stats.partial}</div></div>
    <div class="box"><div class="muted small">لم يُسلم شيء</div><div class="num">${stats.open0}</div></div>
  `;

  if(!rows.length){$("ordersTable").innerHTML="<p class='muted'>لا يوجد بيانات.</p>";return;}

  $("ordersTable").innerHTML=`<table class="table"><thead><tr>
    <th>الطلب</th><th>العميل</th><th>التاريخ</th><th>الأصناف</th><th>الحالة</th><th>إجراءات</th>
  </tr></thead><tbody>${
    rows.map(r=>`<tr>
      <td><a class="link" href="order.html?code=${encodeURIComponent(r.code)}">${escapeHtml(r.code)}</a></td>
      <td><a class="link" href="order.html?code=${encodeURIComponent(r.code)}">${escapeHtml(r.cname)}</a></td>
      <td>${escapeHtml(r.date)}</td>
      <td>${r.itemsCount}</td>
      <td><span class="badge ${r.st==="COMPLETE"?"green":(r.st==="PARTIAL"?"yellow":"red")}">${escapeHtml(r.st)}${r.locked?" • مقفل":""}</span></td>
      <td>
        <button class="btnDanger" data-del="${escapeHtml(r.code)}" style="width:auto;padding:8px 10px">${icon("trash")} حذف</button>
      </td>
    </tr>`).join("")
  }</tbody></table>`;

  document.querySelectorAll("button[data-del]").forEach(b=>b.onclick=async()=>{
    if(!confirm("حذف الطلبية؟")) return;
    const code=b.dataset.del;
    await deleteDoc(doc(db,"customer_orders",code));
    await setDoc(doc(collection(db,"audit_logs")),{actorRole:"admin",action:"DELETE_ORDER",entityType:"customer_order",entityId:code,summary:`Deleted order ${code}`,timestamp:new Date().toISOString()});
    loadOrders();
  });
}
$("btnOrdersRefresh").onclick=loadOrders;
$("ordersSearch").oninput=()=>{clearTimeout(window.__os);window.__os=setTimeout(loadOrders,250);};

// Excel
let lastPreview=null;
const showExcel=(t,err=false)=>{const m=$("excelMsg");m.textContent=t;m.classList.toggle("err",!!err);};
const readExcel=(file)=>new Promise((resolve,reject)=>{
  const r=new FileReader();
  r.onload=(e)=>{try{
    const data=new Uint8Array(e.target.result);
    const wb=XLSX.read(data,{type:"array"});
    const sheets={};
    wb.SheetNames.forEach(n=>sheets[n]=XLSX.utils.sheet_to_json(wb.Sheets[n],{defval:""}));
    resolve(sheets);
  }catch(err){reject(err);}};
  r.onerror=reject;
  r.readAsArrayBuffer(file);
});
$("btnPreview").onclick=async()=>{
  try{
    const f=$("excelFile").files?.[0];
    if(!f){showExcel("اختر ملف Excel",true);return;}
    lastPreview=await readExcel(f);
    const summary=Object.fromEntries(Object.entries(lastPreview).map(([k,v])=>[k,Array.isArray(v)?v.length:0]));
    $("previewBox").textContent=JSON.stringify(summary,null,2);
    showExcel("Preview جاهز");
  }catch(e){showExcel(e?.message||String(e),true);}
};

function groupItems(orderItems){
  const m=new Map();
  for(const r of orderItems){
    const oc=String(r.orderCode||"").trim();
    const pc=String(r.productCode||"").trim();
    const qty=Number(r.requiredQty||0);
    if(!oc||!pc||!Number.isFinite(qty)) continue;
    if(!m.has(oc)) m.set(oc,[]);
    m.get(oc).push({productCode:pc,requiredQty:Math.max(0,qty)});
  }
  return m;
}

$("btnApply").onclick=async()=>{
  try{
    if(!lastPreview){showExcel("اعمل Preview أولاً",true);return;}
    const s=lastPreview;
    const Customers=s.Customers||[];
    const Products=s.Products||[];
    const Inventory=s.Inventory||[];
    const Orders=s.Orders||[];
    const OrderItems=s.OrderItems||[];
    // Customers
    for(const c of Customers){
      const code=String(c.customerCode||"").trim();
      const name=String(c.name||"").trim();
      if(!code||!name) continue;
      await setDoc(doc(db,"customers",code),{
        customerCode:code,name,
        phone:c.phone?String(c.phone):"",
        address:c.address?String(c.address):"",
        isActive:c.isActive===false?false:true,
        updatedAt:new Date().toISOString()
      },{merge:true});
    }
    // Products
    for(const p of Products){
      const code=String(p.productCode||"").trim();
      const modelName=String(p.modelName||"").trim();
      if(!code||!modelName) continue;
      await setDoc(doc(db,"products",code),{
        productCode:code,modelName,
        category:p.category?String(p.category):"",
        isActive:p.isActive===false?false:true,
        updatedAt:new Date().toISOString()
      },{merge:true});
    }
    // Inventory
    for(const inv of Inventory){
      const code=String(inv.productCode||"").trim();
      if(!code) continue;
      const qty=Number(inv.onHandQty||0);
      await setDoc(doc(db,"inventory",code),{
        productCode:code,
        onHandQty:Number.isFinite(qty)?Math.max(0,qty):0,
        updatedAt:new Date().toISOString()
      },{merge:true});
    }
    // Orders + Items
    const itemsMap=groupItems(OrderItems);
    for(const o of Orders){
      const orderCode=String(o.orderCode||"").trim();
      const customerCode=String(o.customerCode||"").trim();
      if(!orderCode||!customerCode) continue;
      await setDoc(doc(db,"customer_orders",orderCode),{
        orderCode,customerCode,
        customerNameSnapshot:o.customerNameSnapshot?String(o.customerNameSnapshot):"",
        orderDate:o.orderDate?String(o.orderDate):"",
        status:o.status?String(o.status):"OPEN",
        isLocked:o.isLocked===true?true:false,
        items: itemsMap.get(orderCode)||[],
        deliveredTotals:{},
        notes:o.notes?String(o.notes):"",
        createdByRole:o.createdByRole?String(o.createdByRole):"admin",
        createdAt:o.createdAt?String(o.createdAt):new Date().toISOString(),
        updatedAt:new Date().toISOString()
      },{merge:true});
    }
    await setDoc(doc(collection(db,"audit_logs")),{actorRole:"admin",action:"IMPORT_ALL",entityType:"excel",entityId:"excel",summary:`Imported Customers:${Customers.length} Products:${Products.length} Inventory:${Inventory.length} Orders:${Orders.length} Items:${OrderItems.length}`,timestamp:new Date().toISOString()});
    showExcel("Apply تم (ALL)");
  }catch(e){showExcel(e?.message||String(e),true);}
};

$("btnExport").onclick=async()=>{
  try{
    const wb=XLSX.utils.book_new();
    async function addSheet(sheetName, col, mapFn){
      const snap=await getDocs(collection(db,col));
      const rows=[]; snap.forEach(d=>rows.push(mapFn(d.id,d.data())));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),sheetName);
    }
    await addSheet("Customers","customers",(id,d)=>({customerCode:id,name:d.name||"",phone:d.phone||"",address:d.address||"",isActive:d.isActive!==false}));
    await addSheet("Products","products",(id,d)=>({productCode:id,modelName:d.modelName||"",category:d.category||"",isActive:d.isActive!==false}));
    await addSheet("Inventory","inventory",(id,d)=>({productCode:id,onHandQty:Number(d.onHandQty||0)}));

    const os=await getDocs(collection(db,"customer_orders"));
    const ordersRows=[]; const itemsRows=[];
    os.forEach(d=>{
      const o=d.data(); const oc=o.orderCode||d.id;
      ordersRows.push({orderCode:oc,customerCode:o.customerCode||"",customerNameSnapshot:o.customerNameSnapshot||"",orderDate:o.orderDate||"",status:o.status||"",isLocked:!!o.isLocked,notes:o.notes||"",createdByRole:o.createdByRole||"",createdAt:o.createdAt||""});
      (Array.isArray(o.items)?o.items:[]).forEach(it=>itemsRows.push({orderCode:oc,productCode:it.productCode||"",requiredQty:Number(it.requiredQty||0)}));
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(ordersRows),"Orders");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(itemsRows),"OrderItems");

    XLSX.writeFile(wb,"export_all.xlsx");
    await setDoc(doc(collection(db,"audit_logs")),{actorRole:"admin",action:"EXPORT_ALL",entityType:"excel",entityId:"export_all.xlsx",summary:"Exported export_all.xlsx",timestamp:new Date().toISOString()});
    showExcel("تم التصدير: export_all.xlsx");
  }catch(e){showExcel(e?.message||String(e),true);}
};

// Audit
async function loadAudit(){
  const snap=await getDocs(query(collection(db,"audit_logs"),orderBy("timestamp","desc"),limit(250)));
  const s=$("auditSearch").value.trim().toLowerCase();
  const rows=[];
  snap.forEach(d=>{
    const a=d.data(); const action=String(a.action||""); const summary=String(a.summary||"");
    if(s && !(action.toLowerCase().includes(s)||summary.toLowerCase().includes(s))) return;
    rows.push({time:a.timestamp||"",action,summary,actor:a.actorUserId||a.actorRole||""});
  });
  $("auditTable").innerHTML=rows.length?`<table class="table"><thead><tr><th>وقت</th><th>Action</th><th>تفاصيل</th><th>Actor</th></tr></thead><tbody>${
    rows.map(r=>`<tr><td>${escapeHtml(r.time)}</td><td><span class="badge">${escapeHtml(r.action)}</span></td><td>${escapeHtml(r.summary)}</td><td>${escapeHtml(r.actor)}</td></tr>`).join("")
  }</tbody></table>`:"<p class='muted'>لا يوجد سجلات.</p>";
}
$("btnAuditRefresh").onclick=loadAudit;
$("auditSearch").oninput=()=>{clearTimeout(window.__as);window.__as=setTimeout(loadAudit,250);};


// ===== Products (CRUD) =====
let products=[];
async function loadProductsList(){
  const snap=await getDocs(query(collection(db,"products"),orderBy("productCode","asc"),limit(5000)));
  products=[]; snap.forEach(d=>products.push({id:d.id,...d.data()}));
}
async function renderProducts(){
  await loadProductsList();
  const s=($("prodSearch").value||"").trim().toLowerCase();
  const rows=products.filter(p=>{
    const code=String(p.productCode||p.id||"").toLowerCase();
    const name=String(p.modelName||"").toLowerCase();
    return !s || code.includes(s) || name.includes(s);
  });
  if(!rows.length){ $("productsTable").innerHTML="<p class='muted'>لا يوجد مواد.</p>"; return; }
  $("productsTable").innerHTML=`<table class="table"><thead><tr><th>رقم</th><th>اسم</th><th>تصنيف</th><th>إجراءات</th></tr></thead><tbody>${
    rows.map(p=>`<tr>
      <td>${escapeHtml(p.productCode||p.id)}</td>
      <td>${escapeHtml(p.modelName||"")}</td>
      <td>${escapeHtml(p.category||"")}</td>
      <td class="noPrint">
        <button class="btnSecondary" data-pedit="${escapeHtml(p.productCode||p.id)}" style="width:auto;padding:8px 10px">${icon("edit")} تعديل</button>
        <button class="btnDanger" data-pdel="${escapeHtml(p.productCode||p.id)}" style="width:auto;padding:8px 10px">${icon("trash")} حذف</button>
      </td>
    </tr>`).join("")
  }</tbody></table>`;
  document.querySelectorAll("button[data-pedit]").forEach(b=>b.onclick=()=>{
    const code=b.dataset.pedit;
    const p=products.find(x=>String(x.productCode||x.id)===String(code));
    if(!p) return;
    $("productCode").value=code;
    $("modelName").value=p.modelName||"";
    $("category").value=p.category||"";
    window.scrollTo({top:0,behavior:"smooth"});
  });
  document.querySelectorAll("button[data-pdel]").forEach(b=>b.onclick=async()=>{
    const code=b.dataset.pdel;
    if(!confirm("حذف الصنف؟")) return;
    await deleteDoc(doc(db,"products",code));
    await setDoc(doc(collection(db,"audit_logs")),{actorUserId:ctx.user.uid,actorRole:ctx.role,action:"DELETE_PRODUCT",entityType:"product",entityId:code,summary:`Deleted product ${code}`,timestamp:new Date().toISOString()});
    renderProducts();
  });
}
document.getElementById("btnSaveProduct").innerHTML=icon("plus")+" حفظ الصنف";
document.getElementById("btnProdRefresh").onclick=renderProducts;
document.getElementById("prodSearch").oninput=()=>{clearTimeout(window.__ps);window.__ps=setTimeout(renderProducts,250);};
document.getElementById("btnClearProduct").onclick=()=>{$("productCode").value="";$("modelName").value="";$("category").value="";$("prodMsg").textContent="";$("prodMsg").classList.remove("err");};

document.getElementById("btnSaveProduct").onclick=async()=>{
  const m=$("prodMsg"); m.classList.remove("err"); m.textContent="";
  try{
    const code=$("productCode").value.trim();
    const name=$("modelName").value.trim();
    if(!code||!name){m.classList.add("err");m.textContent="أكمل رقم الموديل واسم الموديل";return;}
    await setDoc(doc(db,"products",code),{productCode:code,modelName:name,category:$("category").value.trim(),isActive:true,updatedAt:new Date().toISOString()},{merge:true});
    await setDoc(doc(collection(db,"audit_logs")),{actorUserId:ctx.user.uid,actorRole:ctx.role,action:"UPSERT_PRODUCT",entityType:"product",entityId:code,summary:`Upsert product ${code} ${name}`,timestamp:new Date().toISOString()});
    m.textContent="تم حفظ الصنف";
    document.getElementById("btnClearProduct").click();
    renderProducts();
  }catch(e){m.classList.add("err");m.textContent=e?.message||String(e);}
};

(async()=>{
  await requireRole(["admin"]);
  showTab("orders");
  await renderCustomers();
  await loadOrders();
  await loadAudit();
  try{ await renderProducts(); }catch{}

  // Realtime in-app notifications (optional)
  try{
    await askNotifyPermission();
    const { onSnapshot, query, collection, orderBy, limit } = await import("https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js");
    let firstD=true;
    onSnapshot(query(collection(db,"deliveries"),orderBy("createdAt","desc"),limit(1)),(snap)=>{
      if(firstD){firstD=false;return;}
      snap.docChanges().forEach(ch=>{
        if(ch.type==="added"){
          const d=ch.doc.data();
          const title="تسليم جديد";
          const body=`طلب ${d.orderCode}`;
          toast(title, body); notifyNow(title, body);
        }
      });
    });
    let firstP=true;
    onSnapshot(query(collection(db,"prep_requests"),orderBy("createdAt","desc"),limit(1)),(snap)=>{
      if(firstP){firstP=false;return;}
      snap.docChanges().forEach(ch=>{
        if(ch.type==="added"){
          const p=ch.doc.data();
          const title="طلب جديد للمخزن";
          const body=`Order: ${p.orderCode||ch.doc.id}`;
          toast(title, body); notifyNow(title, body);
        }
      });
    });
  }catch{}
})();