import { db } from "./firebase.js";
import { requireRole, setupLogout } from "./guard.js";
import { $, escapeHtml, parseQuery, icon } from "./utils.js";
import { doc, getDoc, collection, query, where, getDocs, runTransaction, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

setupLogout("btnLogout");
const { code: orderCode="" } = parseQuery();
let ctx=null, orderData=null, inventory=new Map();

const modalOpen=(t,h)=>{$("modalTitle").textContent=t;$("modalBody").innerHTML=h;$("modalBack").style.display="flex";};
const modalClose=()=>{$("modalBack").style.display="none";$("modalBody").innerHTML="";};
$("btnModalClose").onclick=modalClose;
$("modalBack").onclick=(e)=>{ if(e.target.id==="modalBack") modalClose(); };

function badgeStatus(st){ return st==="COMPLETE"?"green":(st==="PARTIAL"?"yellow":"red"); }

async function loadInventory(items){
  inventory.clear();
  for(const it of items){
    const inv=await getDoc(doc(db,"inventory",it.productCode));
    inventory.set(it.productCode, inv.exists()?Number(inv.data().onHandQty||0):0);
  }
}

function computeState(totals, items){
  let any=false, all=true;
  for(const it of items){
    const req=Number(it.requiredQty||0);
    const del=Number(totals[it.productCode]||0);
    if(del>0) any=true;
    if(del<req) all=false;
  }
  let status="OPEN";
  if(all && items.length) status="COMPLETE";
  else if(any) status="PARTIAL";
  return {status,isLocked:any};
}

function renderHeader(){
  const o=orderData;
  const st=o.status||"OPEN";
  $("headerCard").innerHTML=`<div class="row">
    <div class="grow">
      <h3>طلب: ${escapeHtml(o.orderCode)}</h3>
      <div class="muted">العميل: <b>${escapeHtml(o.customerNameSnapshot||"")}</b> • كود: ${escapeHtml(o.customerCode||"")}</div>
      <div class="muted">التاريخ: ${escapeHtml(o.orderDate||"")} • ملاحظات: ${escapeHtml(o.notes||"")}</div>
    </div>
    <div><span class="badge ${badgeStatus(st)}">${escapeHtml(st)}${o.isLocked?" • مقفل":""}</span></div>
  </div>`;
}

function renderItems(){
  const items=Array.isArray(orderData.items)?orderData.items:[];
  const totals=orderData.deliveredTotals||{};
  const canDeliver=(ctx.role==="warehouse"||ctx.role==="admin");

  $("itemsTable").innerHTML=`<table class="table"><thead><tr>
    <th>الصنف</th><th>مطلوب</th><th>تم تسليم</th><th>متبقي</th><th>متوفر</th>${canDeliver?'<th class="noPrint">تسليم الآن</th>':''}
  </tr></thead><tbody>${
    items.map(it=>{
      const req=Number(it.requiredQty||0);
      const del=Number(totals[it.productCode]||0);
      const rem=Math.max(0,req-del);
      const onHand=inventory.get(it.productCode)||0;
      const max=Math.min(rem,onHand);
      return `<tr>
        <td>${escapeHtml(it.productCode)}</td>
        <td>${req}</td>
        <td>${del}</td>
        <td>${rem}</td>
        <td>${onHand}</td>
        ${canDeliver?`<td class="noPrint">
          <input type="number" min="0" max="${max}" value="0" data-p="${escapeHtml(it.productCode)}" style="max-width:170px"/>
          <div class="muted small">max: ${max}</div>
        </td>`:""}
      </tr>`;
    }).join("")
  }</tbody></table>`;
}

async function renderDeliveries(){
  const snap=await getDocs(query(collection(db,"deliveries"),where("orderCode","==",orderCode)));
  const rows=[]; snap.forEach(d=>rows.push({id:d.id,...d.data()}));
  rows.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  if(!rows.length){$("deliveriesTable").innerHTML="<p class='muted'>لا يوجد تسليمات.</p>";return;}
  $("deliveriesTable").innerHTML=rows.map(r=>`<div class="card" style="margin:10px 0">
    <div class="row"><div class="grow"><b>${escapeHtml(r.deliveryId||r.id)}</b><div class="muted small">${escapeHtml(r.createdAt||"")} • ${escapeHtml(r.status||"")}</div></div></div>
    <div class="muted small">${(Array.isArray(r.items)?r.items:[]).map(i=>`${escapeHtml(i.productCode)}: ${Number(i.qty||0)}`).join(" | ")}</div>
  </div>`).join("");
}

function readDeliveryInputs(){
  const out=[];
  document.querySelectorAll("input[data-p]").forEach(inp=>{
    const p=inp.dataset.p;
    const qty=Math.max(0,Number(inp.value||0));
    if(qty>0) out.push({productCode:p,qty});
  });
  return out;
}

async function confirmDelivery(){
  const m=$("msg"); m.classList.remove("err"); m.textContent="";
  try{
    const deliveryItems=readDeliveryInputs();
    if(!deliveryItems.length) throw new Error("أدخل كميات التسليم");
    const deliveryId=`${orderCode}-D-${Date.now()}`;
    const orderRef=doc(db,"customer_orders",orderCode);

    await runTransaction(db, async(tx)=>{
      const os=await tx.get(orderRef);
      if(!os.exists()) throw new Error("الطلب غير موجود");
      const o=os.data();
      const items=Array.isArray(o.items)?o.items:[];
      const totals={...(o.deliveredTotals||{})};

      for(const di of deliveryItems){
        const invRef=doc(db,"inventory",di.productCode);
        const inv=await tx.get(invRef);
        const onHand=inv.exists()?Number(inv.data().onHandQty||0):0;
        if(onHand < di.qty) throw new Error(`المتوفر أقل من المطلوب للصنف ${di.productCode}`);
        tx.set(invRef,{onHandQty:onHand-di.qty,updatedAt:new Date().toISOString()},{merge:true});
        totals[di.productCode]=Number(totals[di.productCode]||0)+Number(di.qty);
      }

      const st=computeState(totals,items);
      tx.set(orderRef,{deliveredTotals:totals,status:st.status,isLocked:st.isLocked,updatedAt:new Date().toISOString()},{merge:true});
      tx.set(doc(db,"deliveries",deliveryId),{
        deliveryId,orderCode,status:"CONFIRMED",
        items:deliveryItems,createdByUserId:ctx.user.uid,createdByRole:ctx.role,
        createdAt:new Date().toISOString()
      });
      tx.set(doc(collection(db,"audit_logs")),{
        actorUserId:ctx.user.uid,actorRole:ctx.role,
        action:"CONFIRM_DELIVERY_TX",entityType:"customer_order",entityId:orderCode,
        summary:`Confirmed delivery ${deliveryId}`,timestamp:new Date().toISOString()
      });
    });

    m.textContent="تم التسليم وخصم المخزون";
    await refreshAll();
  }catch(e){m.classList.add("err");m.textContent=e?.message||String(e);}
}

async function editOrderModal(){
  const canEdit = (ctx.role==="admin") || (ctx.role==="sales" && !orderData.isLocked);
  if(!canEdit){$("msg").classList.add("err");$("msg").textContent="التعديل غير مسموح (الطلب مقفل بعد أول تسليم)";return;}
  const items = (Array.isArray(orderData.items)?orderData.items:[]).map(x=>({...x}));
  const renderRows=()=>items.map((it,i)=>`<tr>
    <td><input value="${escapeHtml(it.productCode)}" data-p="${i}"/></td>
    <td><input type="number" min="0" value="${Number(it.requiredQty||0)}" data-q="${i}"/></td>
    <td><button class="btnDanger" data-r="${i}" style="width:auto;padding:8px 10px">${icon("trash")} حذف</button></td>
  </tr>`).join("");

  modalOpen("تعديل الطلبية",`
    <div class="grid2">
      <input id="eName" value="${escapeHtml(orderData.customerNameSnapshot||"")}" placeholder="اسم العميل"/>
      <input id="eNotes" value="${escapeHtml(orderData.notes||"")}" placeholder="ملاحظات"/>
    </div>
    <hr/>
    <table class="table"><thead><tr><th>الصنف</th><th>الكمية المطلوبة</th><th></th></tr></thead>
      <tbody id="editBody">${renderRows()}</tbody>
    </table>
    <div class="row">
      <input id="newP" class="grow" placeholder="productCode جديد"/>
      <input id="newQ" type="number" min="0" placeholder="qty" style="max-width:220px"/>
      <button id="btnAdd" class="btnSecondary" style="width:auto">${icon("plus")} إضافة</button>
    </div>
    <div class="row">
      <button id="btnSave" style="width:auto">${icon("check")} حفظ</button>
      <button id="btnCancel" class="btnSecondary" style="width:auto">إلغاء</button>
    </div>
  `);

  const rerender=()=>{
    document.getElementById("editBody").innerHTML=renderRows();
    document.querySelectorAll("button[data-r]").forEach(b=>b.onclick=()=>{items.splice(Number(b.dataset.r),1);rerender();});
  };
  rerender();

  document.getElementById("btnAdd").onclick=()=>{
    const p=document.getElementById("newP").value.trim();
    const q=Number(document.getElementById("newQ").value||0);
    if(!p||!Number.isFinite(q)||q<=0) return;
    items.push({productCode:p,requiredQty:q});
    document.getElementById("newP").value="";document.getElementById("newQ").value="";
    rerender();
  };

  document.getElementById("btnCancel").onclick=()=>modalClose();

  document.getElementById("btnSave").onclick=async()=>{
    try{
      document.querySelectorAll("input[data-p]").forEach(inp=>{const i=Number(inp.dataset.p);items[i].productCode=inp.value.trim();});
      document.querySelectorAll("input[data-q]").forEach(inp=>{const i=Number(inp.dataset.q);items[i].requiredQty=Math.max(0,Number(inp.value||0));});
      await setDoc(doc(db,"customer_orders",orderCode),{
        customerNameSnapshot:document.getElementById("eName").value.trim(),
        notes:document.getElementById("eNotes").value.trim(),
        items:items.filter(x=>x.productCode && Number(x.requiredQty||0)>=0),
        updatedAt:new Date().toISOString()
      },{merge:true});
      await setDoc(doc(collection(db,"audit_logs")),{
        actorUserId:ctx.user.uid,actorRole:ctx.role,
        action:"EDIT_ORDER",entityType:"customer_order",entityId:orderCode,
        summary:`Edited order ${orderCode}`,timestamp:new Date().toISOString()
      });
      modalClose();
      await refreshAll();
    }catch(e){$("msg").classList.add("err");$("msg").textContent=e?.message||String(e);}
  };
}

async function deleteOrder(){
  if(ctx.role!=="admin"){ $("msg").classList.add("err"); $("msg").textContent="الحذف للأدمن فقط"; return; }
  if(!confirm("حذف الطلبية؟")) return;
  await deleteDoc(doc(db,"customer_orders",orderCode));
  await setDoc(doc(collection(db,"audit_logs")),{
    actorUserId:ctx.user.uid,actorRole:ctx.role,
    action:"DELETE_ORDER",entityType:"customer_order",entityId:orderCode,
    summary:`Deleted order ${orderCode}`,timestamp:new Date().toISOString()
  });
  location.href="admin.html";
}

async function refreshAll(){
  const os=await getDoc(doc(db,"customer_orders",orderCode));
  orderData=os.exists()?os.data():null;
  if(!orderData) throw new Error("الطلب غير موجود");
  await loadInventory(orderData.items||[]);
  renderHeader();
  renderItems();
  await renderDeliveries();
}

document.getElementById("btnPrint").onclick=()=>window.print();
document.getElementById("btnConfirmDelivery").innerHTML=icon("truck")+" تأكيد تسليم وخصم";
document.getElementById("btnConfirmDelivery").onclick=confirmDelivery;
document.getElementById("btnEditOrder").onclick=editOrderModal;
document.getElementById("btnDeleteOrder").onclick=deleteOrder;

(async()=>{
  ctx=await requireRole(["admin","sales","warehouse"]);
  if(ctx.role==="sales") document.getElementById("goSales").style.display="inline-block";
  if(ctx.role==="warehouse"){document.getElementById("goWarehouse").style.display="inline-block";document.getElementById("warehouseActions").style.display="flex";}
  if(ctx.role==="admin"){document.getElementById("goAdmin").style.display="inline-block";document.getElementById("warehouseActions").style.display="flex";document.getElementById("btnDeleteOrder").style.display="inline-block";}
  if(ctx.role==="sales" || ctx.role==="admin") document.getElementById("btnEditOrder").style.display="inline-block";
  if(!orderCode){document.getElementById("headerCard").innerHTML="<p class='muted'>افتح الصفحة مع ?code=ORDER_CODE</p>";return;}
  await refreshAll();
})();