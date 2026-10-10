// 记账页：这个月还能花多少、各类进度、日历、最近几笔、记一笔。数据就是厨房账本的 ledger。
import { saveDoc } from "../store.js";
import { L, calc, catBudget, addEntry, removeEntry, nameOf } from "../ledger.js";
import { today, addDays, f2 } from "../util.js";

const WEEK = "日一二三四五六";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const gbp = n => ((+n || 0) < -0.004 ? "−£" : "£") + f2(n);
const md = s => `${+s.slice(5,7)}.${+s.slice(8)}`;

let root = null, onPage = false, daySel = null, sheet = null, toastFn = () => {};
const st = { amt:"", cat:null, note:"", src:"card", day:"today" };

// 常用：点一下填好分类和备注
const TPL = [
  { n:"Lidl 买菜", c:"food" }, { n:"Aldi 买菜", c:"food" }, { n:"Meal Deal", c:"food" },
  { n:"零食饮料", c:"snack" }, { n:"请客吃饭", c:"social" }
];
// 记一笔能选的分类：日常的几类，加上囤货
function pickCats(){
  const cats = (L().S.cats || []).map(c => ({ id:c.id, n:c.n }));
  return [...cats, { id:"__stock", n:"囤货" }];
}

const ready = () => !!L()?.S?.cats;

function draw(){
  if (!root) return;
  const now = new Date();
  let h = `<section class="page money">
    <div class="top"><i></i><span>${now.getMonth()+1} 月</span><span class="r">${ready() ? `还有 ${calc().dl} 天` : ""}</span></div>`;
  if (!ready()){ root.innerHTML = h + `<p class="soon">正在拿账本…</p></section>`; return; }
  const c = calc(), perDay = c.left > 0 ? c.left / Math.max(1, c.dl) : 0;
  h += `<div class="left">${c.left < 0 ? `超了 ${gbp(-c.left)}` : gbp(c.left)}</div>
    <div class="leftsub">${c.left < 0 ? "这个月预算花完了，收着点" : `这个月还能花　平均每天 ${gbp(perDay)}`}</div>`;

  h += `<div class="lbl">每月上限</div>`;
  for (const cat of L().S.cats){
    const b = catBudget(cat), sp = c.byC[cat.id] || 0; if (!(b > 0) && !sp) continue;
    const l = b - sp, pct = b > 0 ? Math.min(100, sp / b * 100) : 100;
    const right = l < 0 ? `超了 ${gbp(-l)}` : cat.fixed ? (sp > 0 ? "这个月交过了" : `${gbp(b)} 还没交`) : `还能花 ${gbp(l)}`;
    h += `<div class="cat"><div class="row"><span>${esc(cat.n)}</span><span class="one">${right}</span></div><div class="meter${pct > 85 && !cat.fixed ? " warn" : ""}"><i style="width:${pct.toFixed(1)}%"></i></div></div>`;
  }

  // 日历
  const y = now.getFullYear(), m = now.getMonth(), dim = new Date(y, m+1, 0).getDate(), first = new Date(y, m, 1).getDay();
  const t = today(), mk = t.slice(0,7);
  h += `<div class="lbl">每天花了多少</div><div class="cal"><div class="cal-h">${"一二三四五六日".split("").map(x => `<span>${x}</span>`).join("")}</div><div class="cal-g">`;
  for (let i = 0; i < (first + 6) % 7; i++) h += `<span></span>`;
  for (let d = 1; d <= dim; d++){
    const key = `${mk}-${String(d).padStart(2,"0")}`, v = c.byD[d] || 0, fut = key > t;
    h += `<button class="cd${key === t ? " today" : ""}${key === daySel ? " sel" : ""}${fut ? " fut" : ""}" data-act="day" data-d="${key}"${fut ? " disabled" : ""}><b>${d}</b><small>${v ? Math.round(v) : ""}</small></button>`;
  }
  h += `</div></div>`;

  // 某天的明细 / 最近几笔
  const E = L().E.filter(x => x.cat !== "__save" && x.cat !== "__take");
  const list = daySel ? E.filter(x => x.date === daySel) : E.slice(0, 8);
  h += `<div class="lbl">${daySel ? `${md(daySel)} 那天` : "最近"}${daySel ? `　<button class="link" data-act="day" data-d="">看最近的</button>` : ""}</div>`;
  h += list.length ? list.map(x => `<div class="ent"><span class="d">${md(x.date)}</span><span class="n one">${esc(x.note || nameOf(x.cat))}<small>${esc(nameOf(x.cat))}</small></span><span class="a">${gbp(x.amount)}</span></div>`).join("")
    : `<p class="hint">${daySel ? "这天没花钱。" : "还没有记录。"}</p>`;
  h += `<p class="hint">小票拍给我就行，我来分类、记进来。</p></section>`;
  root.innerHTML = h;
}

/* ---------- 记一笔 ---------- */
function ensureSheet(){
  if (sheet) return;
  sheet = document.createElement("div");
  sheet.className = "sheet"; sheet.hidden = true;
  document.querySelector(".app").appendChild(sheet);
  sheet.addEventListener("click", onSheet);
  const fab = document.createElement("button");
  fab.className = "fab"; fab.id = "fab"; fab.textContent = "记一笔"; fab.hidden = true;
  fab.onclick = openSheet;
  document.querySelector(".app").appendChild(fab);
}
function openSheet(){ Object.assign(st, { amt:"", cat:null, note:"", src:"card", day:"today" }); sheet.hidden = false; drawSheet(); }
function closeSheet(){ sheet.hidden = true; }
function drawSheet(){
  const ok = parseFloat(st.amt) > 0;
  sheet.innerHTML = `<div class="panel" role="dialog" aria-label="记一笔">
    <div class="ph"><span class="one">${st.note ? esc(st.note) : "记一笔"}</span><button data-act="x">取消</button></div>
    <div class="amt"><small>£</small>${st.amt || "0"}</div>
    <div class="opts">
      <span class="tg"><button data-act="day" data-v="today" aria-pressed="${st.day === "today"}">今天</button><button data-act="day" data-v="yday" aria-pressed="${st.day === "yday"}">昨天</button></span>
      <span class="tg"><button data-act="src" data-v="card" aria-pressed="${st.src === "card"}">卡</button><button data-act="src" data-v="cash" aria-pressed="${st.src === "cash"}">现金</button></span>
    </div>
    <div class="chips2">${TPL.map((t,i) => `<button data-act="tpl" data-i="${i}" aria-pressed="${st.note === t.n}">${t.n}</button>`).join("")}</div>
    <div class="cats2">${pickCats().map(c => `<button data-act="cat" data-c="${c.id}"${ok ? "" : " disabled"}${st.cat === c.id ? ' aria-pressed="true"' : ""}>${esc(c.n)}</button>`).join("")}</div>
    <div class="keys">${["1","2","3","4","5","6","7","8","9",".","0","⌫"].map(k => `<button data-act="k" data-k="${k}">${k}</button>`).join("")}</div>
    <div class="ftip">输完金额，点分类就记好了</div>
  </div>`;
}
function onSheet(ev){
  if (ev.target === sheet) return closeSheet();
  const b = ev.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act;
  if (a === "x") return closeSheet();
  if (a === "k"){
    const k = b.dataset.k;
    if (k === "⌫") st.amt = st.amt.slice(0, -1);
    else if (k === ".") { if (!st.amt.includes(".")) st.amt = (st.amt || "0") + "."; }
    else if (!/\.\d\d$/.test(st.amt) && st.amt.replace(".","").length < 6) st.amt = (st.amt === "0" ? "" : st.amt) + k;
  }
  if (a === "day") st.day = b.dataset.v;
  if (a === "src") st.src = b.dataset.v;
  if (a === "tpl"){ const t = TPL[+b.dataset.i]; if (st.note === t.n){ st.note = ""; st.cat = null; } else { st.note = t.n; st.cat = t.c; } }
  if (a === "cat"){
    const v = parseFloat(st.amt); if (!(v > 0)) return;
    const cat = b.dataset.c, date = st.day === "yday" ? addDays(today(), -1) : today();
    const x = addEntry({ amount:v, cat, note: st.note || (cat === "__stock" ? "囤货" : nameOf(cat)), src: st.src, date });
    closeSheet(); draw();
    toastFn(`记好了 ${gbp(v)} · ${nameOf(cat)}`, () => { removeEntry(x.id, true); saveDoc("ledger"); draw(); });
    return;
  }
  drawSheet();
}

function onClick(ev){
  const b = ev.target.closest("[data-act]"); if (!b || !root.contains(b)) return;
  if (b.dataset.act === "day"){ daySel = b.dataset.d && b.dataset.d !== daySel ? b.dataset.d : null; draw(); }
}

export function renderMoney(view, opts){
  onPage = true; root = view; root.onclick = onClick; toastFn = opts.toast;
  ensureSheet(); document.getElementById("fab").hidden = false;
  daySel = null; draw();
}
export function leaveMoney(){
  onPage = false; if (root && root.onclick === onClick) root.onclick = null;
  if (sheet){ sheet.hidden = true; document.getElementById("fab").hidden = true; }
}
export function redrawMoney(){ if (onPage && (!sheet || sheet.hidden)) draw(); }
