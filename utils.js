export const $ = (id) => document.getElementById(id);

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

export function todayISO() {
  return new Date().toISOString().slice(0,10);
}

export function sum(arr, fn) {
  return arr.reduce((a,x)=>a+(fn?fn(x):x),0);
}

export function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
