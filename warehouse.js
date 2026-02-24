import { db } from "./firebase.js";
import { requireRole, setupLogout } from "./guard.js";
import { $, escapeHtml } from "./utils.js";
import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

setupLogout("btnLogout");

async function loadOrders(){
  const snap = await getDocs(query(collection(db,"customer_orders"), orderBy("createdAt","desc"), limit(300)));
  const search = $("search").value.trim().toLowerCase();
  const statusFilter = $("statusFilter").value;

  const rows=[];
  snap.forEach(d=>{
    const o=d.data();
    const name=(o.customerNameSnapshot||"").toString();
    if(search && !name.toLowerCase().includes(search)) return;
    const st=o.status||"OPEN";
    if(statusFilter!=="all" && st!==statusFilter) return;
    rows.push({
      orderCode:o.orderCode||d.id,
      customerName:name,
      status:st,
      isLocked:!!o.isLocked,
      items:(Array.isArray(o.items)?o.items.length:0),
      date:o.orderDate||""
    });
  });

  if(rows.length===0){ $("ordersTable").innerHTML="<p class='muted'>لا يوجد بيانات.</p>"; return; }

  $("ordersTable").innerHTML=`
    <table class="table">
      <thead><tr><th>الطلب</th><th>العميل</th><th>التاريخ</th><th>الموديلات</th><th>الحالة</th></tr></thead>
      <tbody>
        ${rows.map(r=>`
          <tr>
            <td><a class="link" href="order.html?code=${encodeURIComponent(r.orderCode)}">${escapeHtml(r.orderCode)}</a></td>
            <td>${escapeHtml(r.customerName)}</td>
            <td>${escapeHtml(r.date)}</td>
            <td>${r.items}</td>
            <td><span class="badge">${escapeHtml(r.status)}${r.isLocked?" • مقفل":""}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

$("btnRefresh").onclick=loadOrders;
$("search").oninput=()=>{clearTimeout(window.__t); window.__t=setTimeout(loadOrders,250);};
$("statusFilter").onchange=loadOrders;

(async()=>{
  await requireRole(["warehouse","admin"]);
  await loadOrders();
})();
