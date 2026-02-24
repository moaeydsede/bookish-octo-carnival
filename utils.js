export const $=(id)=>document.getElementById(id);
export function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,(m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));}
export function todayISO(){return new Date().toISOString().slice(0,10);}
export function parseQuery(){const p=new URLSearchParams(location.search);const o={};for(const[k,v]of p.entries())o[k]=v;return o;}
export function icon(name){
const i={
users:`<svg class="ico" viewBox="0 0 24 24"><path d="M16 11a4 4 0 1 0-3.999-4A4 4 0 0 0 16 11ZM8 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm8 2c-3.33 0-6 1.34-6 3v2h12v-2c0-1.66-2.67-3-6-3ZM8 13c-3.33 0-6 1.34-6 3v2h6v-2c0-1.13.39-2.16 1.06-3.03A9.73 9.73 0 0 0 8 13Z"/></svg>`,
list:`<svg class="ico" viewBox="0 0 24 24"><path d="M4 6h2v2H4V6Zm4 0h14v2H8V6ZM4 11h2v2H4v-2Zm4 0h14v2H8v-2ZM4 16h2v2H4v-2Zm4 0h14v2H8v-2Z"/></svg>`,
check:`<svg class="ico" viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4Z"/></svg>`,
truck:`<svg class="ico" viewBox="0 0 24 24"><path d="M20 8h-3V4H1v13h2a3 3 0 0 0 6 0h6a3 3 0 0 0 6 0h2v-5l-3-4ZM6 18a1 1 0 1 1 1-1 1 1 0 0 1-1 1Zm13 0a1 1 0 1 1 1-1 1 1 0 0 1-1 1Zm2-6h-4V10h2.5L21 12Z"/></svg>`,
plus:`<svg class="ico" viewBox="0 0 24 24"><path d="M19 11H13V5h-2v6H5v2h6v6h2v-6h6z"/></svg>`,
edit:`<svg class="ico" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.29a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>`,
trash:`<svg class="ico" viewBox="0 0 24 24"><path d="M6 7h12l-1 14H7L6 7Zm3-3h6l1 2H8l1-2Z"/></svg>`,
search:`<svg class="ico" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 14 15.5l.27.28v.79L20 21.5 21.5 20l-6-6ZM10 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z"/></svg>`,
upload:`<svg class="ico" viewBox="0 0 24 24"><path d="M5 20h14v-2H5v2Zm7-18-5.5 5.5 1.42 1.42L11 5.84V16h2V5.84l3.08 3.08 1.42-1.42L12 2Z"/></svg>`,
download:`<svg class="ico" viewBox="0 0 24 24"><path d="M5 20h14v-2H5v2ZM11 4v8H8l4 4 4-4h-3V4h-2Z"/></svg>`,
bolt:`<svg class="ico" viewBox="0 0 24 24"><path d="M11 21h-1l1-7H7l6-11h1l-1 7h4l-6 11Z"/></svg>`,
audit:`<svg class="ico" viewBox="0 0 24 24"><path d="M3 3h18v2H3V3Zm2 4h14v14H5V7Zm2 2v10h10V9H7Zm2 2h6v2H9v-2Zm0 4h6v2H9v-2Z"/></svg>`
};return i[name]||'';}
