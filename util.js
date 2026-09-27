export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const r0 = n => Math.round(n), r1 = n => Math.round(n * 10) / 10;
export const uid = p => (p || "x") + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const NF = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const f2 = n => NF.format(Math.abs(+n || 0));
export const money = n => ((+n || 0) < -0.004 ? "−£" : "£") + f2(n);
export const round2 = n => Math.round((+n || 0) * 100) / 100;

export function iso(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
export function today() { return iso(new Date()); }
export function parse(s) { const p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
export function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
export function mondayOf(s) { const d = parse(s); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return iso(d); }
export function dow(s) { return (parse(s).getDay() + 6) % 7; }
const DF = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" });
const MD = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" });
export const fmtDay = s => DF.format(parse(s));
export const fmtMD = s => MD.format(parse(s));
export function dayLabel(s) {
  const t = today();
  if (s === t) return "今天";
  if (s === addDays(t, -1)) return "昨天";
  return fmtDay(s);
}

let tipT, undoFn = null;
export function toast(msg, undo) {
  const el = $("#toast");
  el.querySelector(".t").textContent = msg;
  const b = el.querySelector("button");
  undoFn = undo || null; b.hidden = !undo;
  el.classList.add("on");
  clearTimeout(tipT); tipT = setTimeout(() => { el.classList.remove("on"); undoFn = null; }, undo ? 6000 : 2400);
}
export function bindToast() {
  $("#toast button").onclick = () => { const f = undoFn; undoFn = null; $("#toast").classList.remove("on"); if (f) f(); };
}

// 弹窗：html 里的表单由调用方处理，返回关闭函数
export function modal(html, onMount) {
  const wrap = $("#modal");
  wrap.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`;
  wrap.hidden = false;
  document.body.classList.add("noscroll");
  const close = () => { wrap.hidden = true; wrap.innerHTML = ""; document.body.classList.remove("noscroll"); document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  wrap.onclick = e => { if (e.target === wrap) close(); };
  wrap.querySelectorAll("[data-close]").forEach(b => b.onclick = close);
  onMount && onMount(wrap.querySelector(".box"), close);
  const f = wrap.querySelector("input:not([type=hidden]),select,textarea");
  if (f) setTimeout(() => f.focus(), 30);
  return close;
}
