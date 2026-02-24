import { db } from "./firebase.js";
import { requireRole, setupLogout } from "./guard.js";
import { $, escapeHtml } from "./utils.js";
import {
  collection, doc, setDoc, getDocs, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

setupLogout("btnLogout");

let lastPreview=null;

function showMsg(t,err=false){
  const m=$("msg");
  m.textContent=t;
  m.classList.toggle("err",!!err);
}

function readExcel(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=(e)=>{
      try{
        const data=new Uint8Array(e.target.result);
        const wb=XLSX.read(data,{type:"array"});
        const sheets={};
        wb.SheetNames.forEach(name=>{
          const ws=wb.Sheets[name];
          sheets[name]=XLSX.utils.sheet_to_json(ws,{defval:""});
        });
        resolve(sheets);
      }catch(err){reject(err);}
    };
    reader.onerror=reject;
    reader.readAsArrayBuffer(file);
  });
}

$("btnPreview").onclick=async()=>{
  try{
    const f=$("excelFile").files?.[0];
    if(!f){showMsg("اختر ملف Excel",true);return;}
    const sheets=await readExcel(f);
    lastPreview=sheets;
    const summary=Object.fromEntries(Object.entries(sheets).map(([k,v])=>[k,Array.isArray(v)?v.length:0]));
    $("previewBox").textContent=JSON.stringify(summary,null,2);
    showMsg("Preview جاهز");
  }catch(e){showMsg(e?.message||String(e),true);}
};

function groupOrderItems(orderItems){
  const map=new Map(); // orderCode -> [items]
  for(const r of orderItems){
    const oc=String(r.orderCode||"").trim();
    const pc=String(r.productCode||"").trim();
    const qty=Number(r.requiredQty||0);
    if(!oc||!pc||!Number.isFinite(qty)) continue;
    if(!map.has(oc)) map.set(oc,[]);
    map.get(oc).push({productCode:pc, requiredQty: Math.max(0, qty)});
  }
  return map;
}

$("btnApply").onclick=async()=>{
  try{
    if(!lastPreview){showMsg("اعمل Preview أولاً",true);return;}
    const sheets=lastPreview;
    const Customers=sheets.Customers||[];
    const Products=sheets.Products||[];
    const Inventory=sheets.Inventory||[];
    const Orders=sheets.Orders||[];
    const OrderItems=sheets.OrderItems||[];

    // Customers
    for(const c of Customers){
      const customerCode=String(c.customerCode||"").trim();
      const name=String(c.name||"").trim();
      if(!customerCode||!name) continue;
      await setDoc(doc(db,"customers",customerCode),{
        customerCode,name,
        phone: c.phone?String(c.phone):"",
        address: c.address?String(c.address):"",
        isActive: c.isActive===false?false:true,
        updatedAt:new Date().toISOString()
      },{merge:true});
    }

    // Products
    for(const p of Products){
      const productCode=String(p.productCode||"").trim();
      const modelName=String(p.modelName||"").trim();
      if(!productCode||!modelName) continue;
      await setDoc(doc(db,"products",productCode),{
        productCode,modelName,
        category: p.category?String(p.category):"",
        isActive: p.isActive===false?false:true,
        updatedAt:new Date().toISOString()
      },{merge:true});
    }

    // Inventory
    for(const inv of Inventory){
      const productCode=String(inv.productCode||"").trim();
      if(!productCode) continue;
      const onHandQty=Number(inv.onHandQty||0);
      await setDoc(doc(db,"inventory",productCode),{
        productCode,
        onHandQty: Number.isFinite(onHandQty)?Math.max(0,onHandQty):0,
        updatedAt:new Date().toISOString()
      },{merge:true});
    }

    // Orders + Items
    const itemsMap = groupOrderItems(OrderItems);
    for(const o of Orders){
      const orderCode=String(o.orderCode||"").trim();
      const customerCode=String(o.customerCode||"").trim();
      if(!orderCode||!customerCode) continue;
      const items=itemsMap.get(orderCode)||[];
      await setDoc(doc(db,"customer_orders",orderCode),{
        orderCode,
        customerCode,
        customerNameSnapshot: o.customerNameSnapshot?String(o.customerNameSnapshot):"",
        orderDate: o.orderDate?String(o.orderDate):"",
        status: o.status?String(o.status):"OPEN",
        isLocked: o.isLocked===true?true:false,
        items,
        deliveredTotals: {}, // لا نستوردها في MVP
        notes: o.notes?String(o.notes):"",
        createdByRole: o.createdByRole?String(o.createdByRole):"admin",
        createdAt: o.createdAt?String(o.createdAt):new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },{merge:true});
    }

    await setDoc(doc(collection(db,"audit_logs")),{
      actorRole:"admin",
      action:"IMPORT_ALL",
      entityType:"excel",
      summary:`Imported Customers:${Customers.length}, Products:${Products.length}, Inventory:${Inventory.length}, Orders:${Orders.length}, OrderItems:${OrderItems.length}`,
      timestamp:new Date().toISOString()
    });

    showMsg("Apply تم (ALL)");
  }catch(e){showMsg(e?.message||String(e),true);}
};

$("btnExport").onclick=async()=>{
  try{
    const wb=XLSX.utils.book_new();

    async function addSheet(sheetName, colName, mapper=null){
      const snap=await getDocs(collection(db,colName));
      const rows=[];
      snap.forEach(d=>{
        const data=d.data();
        rows.push(mapper?mapper(d.id,data):({id:d.id,...data}));
      });
      const ws=XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb,ws,sheetName);
    }

    await addSheet("Customers","customers",(id,d)=>({customerCode:id,name:d.name||"",phone:d.phone||"",address:d.address||"",isActive:d.isActive!==false}));
    await addSheet("Products","products",(id,d)=>({productCode:id,modelName:d.modelName||"",category:d.category||"",isActive:d.isActive!==false}));
    await addSheet("Inventory","inventory",(id,d)=>({productCode:id,onHandQty:Number(d.onHandQty||0)}));

    // Orders & OrderItems
    const ordersSnap=await getDocs(collection(db,"customer_orders"));
    const ordersRows=[];
    const itemsRows=[];
    ordersSnap.forEach(d=>{
      const o=d.data();
      const oc=o.orderCode||d.id;
      ordersRows.push({
        orderCode: oc,
        customerCode: o.customerCode||"",
        customerNameSnapshot: o.customerNameSnapshot||"",
        orderDate: o.orderDate||"",
        status: o.status||"",
        isLocked: !!o.isLocked,
        notes: o.notes||"",
        createdByRole: o.createdByRole||"",
        createdAt: o.createdAt||""
      });
      const it=Array.isArray(o.items)?o.items:[];
      for(const x of it){
        itemsRows.push({ orderCode: oc, productCode: x.productCode||"", requiredQty: Number(x.requiredQty||0) });
      }
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ordersRows), "Orders");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemsRows), "OrderItems");

    XLSX.writeFile(wb,"export_all.xlsx");

    await setDoc(doc(collection(db,"audit_logs")),{
      actorRole:"admin",
      action:"EXPORT_ALL",
      entityType:"excel",
      summary:"Exported export_all.xlsx",
      timestamp:new Date().toISOString()
    });

    showMsg("تم التصدير: export_all.xlsx");
  }catch(e){showMsg(e?.message||String(e),true);}
};

async function loadAudit(){
  const qy=query(collection(db,"audit_logs"), orderBy("timestamp","desc"), limit(150));
  const snap=await getDocs(qy);
  const search=$("auditSearch").value.trim().toLowerCase();
  const rows=[];
  snap.forEach(d=>{
    const a=d.data();
    const action=String(a.action||"");
    const summary=String(a.summary||"");
    if(search && !(action.toLowerCase().includes(search)||summary.toLowerCase().includes(search))) return;
    rows.push({time:a.timestamp||"",action,summary,actor:a.actorUserId||a.actorRole||""});
  });

  if(rows.length===0){$("auditTable").innerHTML="<p class='muted'>لا يوجد سجلات.</p>";return;}

  $("auditTable").innerHTML=`
    <table class="table">
      <thead><tr><th>وقت</th><th>Action</th><th>تفاصيل</th><th>Actor</th></tr></thead>
      <tbody>
        ${rows.map(r=>`
          <tr>
            <td>${escapeHtml(r.time)}</td>
            <td><span class="badge">${escapeHtml(r.action)}</span></td>
            <td>${escapeHtml(r.summary)}</td>
            <td>${escapeHtml(r.actor)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

$("btnAuditRefresh").onclick=loadAudit;
$("auditSearch").oninput=()=>{clearTimeout(window.__t); window.__t=setTimeout(loadAudit,250);};

(async()=>{
  await requireRole(["admin"]);
  await loadAudit();
  showMsg("جاهز");
})();
