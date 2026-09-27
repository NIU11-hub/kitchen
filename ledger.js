// 记账：数据操作 + 记账页
import { store, saveDoc, listBackups, restoreBackup, exportAll, importDocs } from "./store.js";
import { $, $$, esc, f2, money, round2, uid, today, dayLabel, parse, toast, modal } from "./util.js";
import { actions, changes, ui } from "./ui.js";

export const L = () => store.docs.ledger;
const save = () => saveDoc("ledger");

export function catOf(id) { return L().S.cats.find(c => c.id === id) || null; }
export function goalOf(id) { return L().S.goals.find(g => g.id === id) || null; }
export function subName(id) { for (const c of L().S.cats) for (const s of c.subs || []) if (s.id === id) return s.n; return ""; }
export function subParent(id) { for (const c of L().S.cats) if ((c.subs || []).some(s => s.id === id)) return c; return null; }
export function nameOf(id) {
  const g = goalOf(id); if (g) return g.n;
  if (id === "__one") return "一次性"; if (id === "__save") return "存入攒钱"; if (id === "__take") return "从攒钱取出";
  const c = catOf(id); return c ? c.n : "其他";
}
export function catBudget(c) { return (c.subs || []).length ? c.subs.reduce((a, s) => a + (+s.a || 0), 0) : (+c.a || 0); }
const isSpend = x => x.cat !== "__save" && x.cat !== "__take";
function flow(x) { const a = +x.amount || 0; if (x.cat === "__take") return a; if (goalOf(x.cat)) return 0; return -a; }

export function calc(month) {
  const S = L().S, E = L().E, t = today(), m = month || t.slice(0, 7);
  const byC = {}, byS = {}, byD = {};
  for (const c of S.cats) { byC[c.id] = 0; for (const s of c.subs || []) byS[s.id] = 0; }
  let fc = 0, fd = 0;
  for (const x of E) {
    const a = +x.amount || 0, fl = flow(x);
    if (x.src === "cash") fc += fl; else fd += fl;
    if (x.date.slice(0, 7) !== m) continue;
    if (byC[x.cat] !== undefined) { byC[x.cat] += a; const d = +x.date.slice(8); byD[d] = (byD[d] || 0) + a; }
    if (x.sub && byS[x.sub] !== undefined) byS[x.sub] += a;
  }
  let alloc = 0, spent = 0;
  for (const c of S.cats) { alloc += catBudget(c); spent += byC[c.id] || 0; }
  const [yy, mm] = m.split("-").map(Number);
  const dim = new Date(yy, mm, 0).getDate();
  const cur = m === t.slice(0, 7), past = m < t.slice(0, 7);
  const dn = cur ? +t.slice(8) : past ? dim : 0;
  return { m, byC, byS, byD, alloc, spent, left: alloc - spent, dim, dn, dl: dim - dn + (cur ? 1 : 0), should: alloc * dn / dim,
    cash: (+S.cash || 0) + fc, card: (+S.card || 0) + fd, remain: (+S.cash || 0) + (+S.card || 0) + fc + fd, cur };
}

export function addEntry(e) {
  const E = L().E;
  const x = { id: uid("e"), date: e.date || today(), amount: round2(e.amount), cat: e.cat, sub: e.sub || "", src: e.src || "card", note: e.note || "" };
  if (e.meta) x.meta = e.meta;
  let pos = 0; while (pos < E.length && E[pos].date > x.date) pos++;
  E.splice(pos, 0, x);
  save();
  return x;
}
export function removeEntry(id, quiet) {
  const S = L().S, E = L().E;
  const i = E.findIndex(x => x.id === id); if (i < 0) return null;
  const x = E[i], a = +x.amount || 0, g = goalOf(x.cat);
  if (g) g.s = round2((+g.s || 0) + a);
  if (x.cat === "__save") { let rest = a; for (let k = S.goals.length - 1; k >= 0 && rest > 0; k--) { const tk = Math.min(+S.goals[k].s || 0, rest); S.goals[k].s = round2((+S.goals[k].s || 0) - tk); rest -= tk; } }
  if (x.cat === "__take") { const q = S.goals.find(g2 => x.note === g2.n + " 取出"); if (q) q.s = round2((+q.s || 0) + a); }
  if (x.cat === "__one") for (const o of S.ones) if (o.xid === x.id) { o.paid = false; o.xid = ""; }
  E.splice(i, 1);
  if (!quiet) save();
  return x;
}
function snapshot() { return JSON.stringify(L()); }
function restoreSnap(s) { const o = JSON.parse(s); store.docs.ledger = o; save(); ui.rerender(); toast("已撤销"); }

/* ---------- 记一笔表单（记账页和今天页共用） ---------- */
const UIK = "kitchen:ledgerui";
let F = { cat: "grocery", sub: "meat", src: "card" };
try { Object.assign(F, JSON.parse(localStorage.getItem(UIK) || "{}")); } catch (e) {}
const saveF = () => { try { localStorage.setItem(UIK, JSON.stringify(F)); } catch (e) {} };

function recentQuick() {
  const seen = new Set(), out = [];
  for (const x of L().E) {
    if (out.length >= 8) break;
    if (!x.note || !(catOf(x.cat) || goalOf(x.cat)) || x.meta) continue;
    const k = x.note + "|" + x.cat + "|" + x.sub; if (seen.has(k)) continue; seen.add(k); out.push(x);
  }
  return out;
}
export function addForm(compact) {
  const c = calc(), S = L().S;
  if (!catOf(F.cat) && !goalOf(F.cat)) F.cat = S.cats[0].id;
  const cur = catOf(F.cat);
  if (cur && (cur.subs || []).length && !cur.subs.some(s => s.id === F.sub)) F.sub = cur.subs[0].id;
  const q = recentQuick();
  const chip = (id, n, rest, on, attr) => `<button type="button" class="chip2" data-act="${attr}" data-id="${id}" aria-pressed="${on}">${esc(n)}<small class="${rest < 0 ? "bad" : ""}">${rest === null ? "" : "剩 " + money(rest)}</small></button>`;
  return `<form class="addf ${compact ? "compact" : ""}" data-form="add" autocomplete="off">
    <div class="amtbox"><span class="cur">£</span><input class="bigin num" name="amount" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" aria-label="金额"></div>
    ${q.length && !compact ? `<div class="quick">${q.map((x, i) => `<button type="button" data-act="quick" data-i="${i}">${esc(x.note)}<small>${esc(x.sub ? subName(x.sub) : nameOf(x.cat))}</small></button>`).join("")}</div>` : ""}
    <div class="flab">分类</div>
    <div class="chips">${S.cats.map(k => chip(k.id, k.n, catBudget(k) ? catBudget(k) - (c.byC[k.id] || 0) : null, k.id === F.cat, "fcat")).join("")}
      ${S.goals.length ? `<span class="sep">从攒的钱里出</span>` + S.goals.map(g => `<button type="button" class="chip2" data-act="fcat" data-id="${g.id}" aria-pressed="${g.id === F.cat}">${esc(g.n)}<small>有 £${f2(g.s)}</small></button>`).join("") : ""}</div>
    ${cur && (cur.subs || []).length ? `<div class="flab">细分</div><div class="chips">${cur.subs.map(s => chip(s.id, s.n, +s.a ? (+s.a - (c.byS[s.id] || 0)) : null, s.id === F.sub, "fsub")).join("")}</div>` : ""}
    <div class="two">
      <label>日期<input name="date" type="date" value="${today()}"></label>
      <div><div class="flab">怎么付</div><div class="seg2">${[["card", "卡"], ["cash", "现金"]].map(([v, n]) => `<button type="button" data-act="fsrc" data-v="${v}" aria-pressed="${F.src === v}">${n}</button>`).join("")}</div></div>
    </div>
    <label>备注<input name="note" type="text" placeholder="买了什么、在哪（可不填）"></label>
    <button class="go" type="submit">记下</button>
  </form>`;
}
actions.fcat = el => { F.cat = el.dataset.id; saveF(); rerenderForm(); };
actions.fsub = el => { F.sub = el.dataset.id; saveF(); rerenderForm(); };
actions.fsrc = el => { F.src = el.dataset.v; saveF(); $$("[data-act=fsrc]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === F.src))); };
actions.quick = el => {
  const x = recentQuick()[+el.dataset.i]; if (!x) return;
  F.cat = x.cat; F.sub = x.sub || F.sub; F.src = x.src || "card"; saveF();
  const form = el.closest("form"); const amt = form.amount.value; rerenderForm();
  const f2_ = $("form[data-form=add]"); f2_.note.value = x.note; f2_.amount.value = amt; f2_.amount.focus();
};
function rerenderForm() {
  const f = $("form[data-form=add]"); if (!f) return;
  const keep = { amount: f.amount.value, date: f.date.value, note: f.note.value };
  f.outerHTML = addForm(f.classList.contains("compact"));
  const g = $("form[data-form=add]"); g.amount.value = keep.amount; g.date.value = keep.date; g.note.value = keep.note;
}
export function submitAdd(form) {
  const a = parseFloat(form.amount.value);
  if (!(a > 0)) { toast("先填金额"); form.amount.focus(); return; }
  const cur = catOf(F.cat), g = goalOf(F.cat);
  if (!cur && !g) { toast("先选一个分类"); return; }
  if (g && a > (+g.s || 0)) { toast(`「${g.n}」只有 £${f2(g.s)}，不够`); return; }
  if (g) g.s = round2((+g.s || 0) - a);
  const sub = cur && (cur.subs || []).length ? F.sub : "";
  const x = addEntry({ date: form.date.value || today(), amount: a, cat: F.cat, sub, src: F.src, note: form.note.value.trim() });
  toast(`记下了 £${f2(a)} · ${sub ? subName(sub) : nameOf(F.cat)}`, () => { removeEntry(x.id); ui.rerender(); });
  ui.rerender();
}

/* ---------- 记账页 ---------- */
let viewMonth = null, showSet = false, jFilter = "";

function monthShift(m, n) { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
const mLabel = m => `${+m.slice(0, 4)} 年 ${+m.slice(5)} 月`;

export function heroCard(c, withNav) {
  const st = c.left < 0 ? "bad" : (c.cur && c.spent > c.should * 1.1 ? "warn" : "");
  const pill = c.left < 0 ? "超了" : st === "warn" ? "花得偏快" : c.cur ? "节奏正常" : "";
  return `<div class="hero-l">
    <div class="bal"><span>手上 <b class="num">${money(c.remain)}</b></span><span class="num">现金 ${money(c.cash)} · 卡 ${money(c.card)}</span></div>
    <div class="mrow-h">${withNav ? `<button class="ghost" data-act="mprev" aria-label="上个月">‹</button>` : ""}<span class="lab">${c.cur ? "这个月还能花" : mLabel(c.m) + " 结余"}</span>${withNav ? `<button class="ghost" data-act="mnext" aria-label="下个月" ${c.cur ? "disabled" : ""}>›</button>` : ""}</div>
    <div class="amt num ${c.left < 0 ? "neg" : ""}">${money(c.left)}</div>
    <div class="pace">${pill ? `<span class="pill ${st}">${pill}</span>` : ""}${c.cur ? (c.left > 0 ? `接下来每天 <b class="num">£${f2(c.left / Math.max(1, c.dl))}</b>` : c.left < 0 ? "下个月额度里要补回来" : "额度刚好用完") : ""}</div>
    <div class="bar"><i class="${st}" style="width:${c.alloc > 0 ? Math.min(100, c.spent / c.alloc * 100).toFixed(1) : 0}%"></i>${c.cur ? `<b style="left:calc(${(c.dn / c.dim * 100).toFixed(1)}% - 1px)"></b>` : ""}</div>
    <div class="meta num"><span>预算 £${f2(c.alloc)} · 已花 £${f2(c.spent)}</span><span>${c.cur ? "还剩 " + c.dl + " 天" : ""}</span></div>
  </div>`;
}
function chart(c) {
  const n = c.dim, per = c.alloc / n; let max = per * 1.6;
  for (let i = 1; i <= n; i++) if ((c.byD[i] || 0) > max) max = c.byD[i];
  if (!(max > 0)) max = 1;
  const W = 600, H = 70, gap = 3, bw = (W - gap * (n - 1)) / n, y = v => H - v / max * H;
  let h = "", over = 0;
  for (let i = 1; i <= n; i++) {
    const v = c.byD[i] || 0, x = (i - 1) * (bw + gap);
    if (i > c.dn || v <= 0) { h += `<rect x="${x.toFixed(1)}" y="${H - 2}" width="${bw.toFixed(1)}" height="2" rx="1" fill="var(--line)"><title>${i} 日 · £0</title></rect>`; continue; }
    if (v > per) over++;
    const bh = Math.max(3, H - y(v));
    h += `<rect x="${x.toFixed(1)}" y="${(H - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${v > per ? "var(--warn)" : "var(--acc)"}" opacity=".8"><title>${i} 日 · £${f2(v)}</title></rect>`;
  }
  if (per > 0) h += `<line x1="0" x2="${W}" y1="${y(per).toFixed(1)}" y2="${y(per).toFixed(1)}" stroke="var(--ink3)" stroke-width="1" stroke-dasharray="4 4"/>`;
  return `<div class="chart"><div class="hd"><span>每天花了多少</span><span><i></i>日均预算 £${f2(per)}${over ? ` · 超了 ${over} 天` : ""}</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="本月每天花销">${h}</svg>
    <div class="ax"><span>1 日</span><span>${Math.ceil(n / 2)} 日</span><span>${n} 日</span></div></div>`;
}
function catList(c) {
  let h = "";
  for (const k of L().S.cats) {
    const a = catBudget(k), sp = c.byC[k.id] || 0, lf = a - sp;
    const pr = a > 0 ? Math.min(100, sp / a * 100) : (sp > 0 ? 100 : 0);
    const cl = a > 0 ? (lf < 0 ? "bad" : lf / a <= .2 ? "warn" : "") : "";
    h += `<div class="it ${cl}"><button class="t" data-act="jfilter" data-id="${k.id}"><span class="nm">${esc(k.n)}</span>
      <span class="v num">${a > 0 ? `<b>${money(lf)}</b> / ${f2(a)}` : `<b>£${f2(sp)}</b> 不设预算`}</span></button>
      ${a > 0 ? `<div class="pb"><i style="width:${pr.toFixed(0)}%"></i></div>` : ""}</div>`;
    for (const s of k.subs || []) {
      const sa = +s.a || 0, ss = c.byS[s.id] || 0, sl = sa - ss;
      const spr = sa > 0 ? Math.min(100, ss / sa * 100) : (ss > 0 ? 100 : 0);
      const scl = sa > 0 ? (sl < 0 ? "bad" : sl / sa <= .2 ? "warn" : "") : "";
      h += `<div class="it sub ${scl}"><button class="t" data-act="jfilter" data-id="${s.id}"><span class="nm">${esc(s.n)}</span>
        <span class="v num">${sa > 0 ? `<b>${money(sl)}</b> / ${f2(sa)}` : `<b>£${f2(ss)}</b>`}</span></button>
        ${sa > 0 ? `<div class="pb"><i style="width:${spr.toFixed(0)}%"></i></div>` : ""}</div>`;
    }
  }
  return h;
}
function journal(list) {
  if (!list.length) return `<div class="empty">这里还没有账。</div>`;
  const days = []; let cur = null;
  for (const x of list) { if (!cur || cur.d !== x.date) { cur = { d: x.date, items: [], sum: 0 }; days.push(cur); } cur.items.push(x); if (isSpend(x)) cur.sum += +x.amount || 0; }
  return days.map(g => `<div class="day"><span>${dayLabel(g.d)}</span><span class="num">${g.sum > 0 ? "£" + f2(g.sum) : ""}</span></div>
    <div class="list">${g.items.map(y => {
      const cat = nameOf(y.cat), sb = y.sub ? subName(y.sub) : "";
      const title = esc(y.note || sb || cat);
      let tag = [y.note ? cat : "", sb && y.note ? sb : "", y.src === "cash" ? "现金" : ""].filter(Boolean).join(" · ");
      if (y.cat === "__take") tag = "";
      const inflow = y.cat === "__take";
      return `<div class="jr"><span class="m">${title}${tag ? `<small>${esc(tag)}</small>` : ""}</span>
        <span class="a num ${inflow ? "in" : ""}">${inflow ? "+" : ""}${f2(y.amount)}</span>
        <button class="x" data-act="delentry" data-id="${y.id}" aria-label="删除这笔">×</button></div>`;
    }).join("")}</div>`).join("");
}
function goalsHtml(c) {
  const S = L().S;
  return S.goals.map(g => {
    const t2 = +g.t || 0, s2 = +g.s || 0, pr = t2 > 0 ? Math.min(100, s2 / t2 * 100) : 0, full = t2 > 0 && s2 >= t2;
    return `<div class="it pur"><div class="t"><span class="nm">${esc(g.n)}</span><span class="v num"><b>£${f2(s2)}</b>${t2 > 0 ? " / " + f2(t2) : ""}</span></div>
      ${t2 > 0 ? `<div class="pb"><i style="width:${pr.toFixed(0)}%"></i></div>` : ""}
      <div class="row2"><span class="note ${full ? "ok" : ""}">${g.open ? "不设上限" : full ? "✓ 攒够了" : "还差 £" + f2(t2 - s2)}</span>
      <button class="mini" data-act="take" data-id="${g.id}">取出来</button></div></div>`;
  }).join("") || `<div class="empty">还没有攒钱目标。</div>`;
}
function onesHtml() {
  return L().S.ones.map(o => `<div class="it ${o.paid ? "done" : ""}"><div class="t"><span class="nm">${o.paid ? "✓ " : ""}${esc(o.n)}</span>
    <span class="v2"><b class="num">£${f2(o.a)}</b><button class="mini" data-act="pay" data-id="${o.id}">${o.paid ? "撤销" : "付了"}</button></span></div></div>`).join("") || `<div class="empty">没有待付的大额。</div>`;
}

export function renderLedger(el) {
  const today_ = today();
  if (!viewMonth) viewMonth = today_.slice(0, 7);
  const c = calc(viewMonth), S = L().S, E = L().E;
  if (showSet) { el.innerHTML = settingsHtml(); bindSettings(); return; }
  let list = E.filter(x => x.date.slice(0, 7) === viewMonth);
  let fname = "";
  if (jFilter) { list = list.filter(x => x.cat === jFilter || x.sub === jFilter); fname = subName(jFilter) || nameOf(jFilter); }
  const unpaid = S.ones.filter(o => !o.paid).reduce((a, o) => a + (+o.a || 0), 0);
  el.innerHTML = `<div class="pagehead"><h1>记账</h1><div class="acts"><button class="btn" data-act="carry">把省下的存进攒钱</button><button class="btn" data-act="settings">设置和备份</button></div></div>
  <div class="cols2">
    <div>
      <section class="card">${heroCard(c, true)}${chart(c)}</section>
      <h2>各分类<span>点一下只看这一类的账</span></h2>
      <section class="card list flush">${catList(c)}</section>
      <h2>攒钱<span>已攒 £${f2(S.goals.reduce((a, g) => a + (+g.s || 0), 0))}</span></h2>
      <section class="card list flush">${goalsHtml(c)}</section>
      <h2>一次性大额<span>${unpaid > 0 ? "待付 £" + f2(unpaid) : "都付了"}</span></h2>
      <section class="card list flush">${onesHtml()}</section>
    </div>
    <div>
      <h2 style="margin-top:0">记一笔</h2>
      <section class="card">${addForm(false)}</section>
      <h2>${mLabelShort(viewMonth)}的账${fname ? `<span>只看「${esc(fname)}」 <button class="linkbtn" data-act="jfilter" data-id="">看全部</button></span>` : `<span>${list.filter(isSpend).length} 笔 · £${f2(list.filter(isSpend).reduce((a, x) => a + (+x.amount || 0), 0))}</span>`}</h2>
      ${journal(list)}
    </div>
  </div>`;
}
const mLabelShort = m => m === today().slice(0, 7) ? "这个月" : `${+m.slice(5)} 月`;

actions.mprev = () => { viewMonth = monthShift(viewMonth, -1); ui.rerender(); };
actions.mnext = () => { const n = monthShift(viewMonth, 1); if (n <= today().slice(0, 7)) { viewMonth = n; ui.rerender(); } };
actions.jfilter = el => { jFilter = el.dataset.id; ui.rerender(); };
actions.delentry = el => {
  const snap = snapshot(); const x = removeEntry(el.dataset.id);
  if (x) { toast(`删了 £${f2(x.amount)}`, () => restoreSnap(snap)); ui.rerender(); }
};
actions.pay = el => {
  const o = L().S.ones.find(z => z.id === el.dataset.id); if (!o) return;
  if (!o.paid) { const x = addEntry({ amount: +o.a || 0, cat: "__one", note: o.n }); o.paid = true; o.xid = x.id; toast("已付 £" + f2(o.a)); }
  else { const E = L().E; const i = E.findIndex(x => x.id === o.xid); if (i >= 0) E.splice(i, 1); o.paid = false; o.xid = ""; toast("撤销了"); }
  save(); ui.rerender();
};
function askAmount(title, cb) {
  modal(`<form data-m="1"><p class="mt">${esc(title)}</p><input name="v" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" class="num">
    <div class="two mtop"><button type="button" class="btn" data-close>取消</button><button class="go" type="submit">确定</button></div></form>`,
    (box, close) => { box.querySelector("form").onsubmit = e => { e.preventDefault(); const v = parseFloat(e.target.v.value); close(); if (v > 0) cb(v); }; });
}
actions.take = el => {
  const g = goalOf(el.dataset.id); if (!g) return;
  askAmount(`从「${g.n}」取多少回到手上？现在有 £${f2(g.s)}`, v => {
    if (v > (+g.s || 0)) { toast(`「${g.n}」只有 £${f2(g.s)}`); return; }
    g.s = round2((+g.s || 0) - v);
    addEntry({ amount: v, cat: "__take", note: g.n + " 取出" }); ui.rerender(); toast("取出 £" + f2(v));
  });
};
actions.carry = () => {
  const avail = Math.max(0, calc().left);
  if (avail <= 0) { toast("这个月额度已经用完了"); return; }
  askAmount(`存多少进去？这个月还剩 £${f2(avail)} 没花`, v => {
    if (v > avail) { toast("最多只能存 £" + f2(avail)); return; }
    const S = L().S; let rest = v, put = 0;
    for (const g of S.goals) { if (rest <= 0 || g.open) continue; const add = Math.min(Math.max(0, (+g.t || 0) - (+g.s || 0)), rest); g.s = round2((+g.s || 0) + add); rest -= add; put += add; }
    for (const g of S.goals) if (g.open && rest > 0) { g.s = round2((+g.s || 0) + rest); put += rest; rest = 0; }
    if (put > 0) addEntry({ amount: put, cat: "__save", note: "存入攒钱" });
    ui.rerender(); toast(put > 0 ? "存进去 £" + f2(put) : "目标都满了，加个不设上限的目标");
  });
};
actions.settings = () => { showSet = true; ui.rerender(); window.scrollTo(0, 0); };
actions.setback = () => { showSet = false; ui.rerender(); };

/* ---------- 设置 ---------- */
function settingsHtml() {
  const S = L().S;
  const row = (attr, id, n, v, ind, del) => `<div class="edit ${ind ? "ind" : ""}"><span class="n2">${esc(n)}</span>
    <input data-${attr}="${id}" type="number" min="0" step="1" inputmode="decimal" value="${+v || 0}" aria-label="${esc(n)}">${del ? `<button class="x" data-act="${del}" data-id="${id}" aria-label="删除 ${esc(n)}">×</button>` : "<span></span>"}</div>`;
  let cats = "";
  for (const c of S.cats) {
    if ((c.subs || []).length) {
      cats += `<div class="edit"><span class="n2"><b>${esc(c.n)}</b></span><span class="dim num">£${f2(catBudget(c))}</span><span></span></div>`;
      for (const s of c.subs) cats += row("es", s.id, s.n, s.a, true, "delsub");
    } else cats += row("ec", c.id, c.n, c.a, false, "");
  }
  return `<div class="pagehead"><h1>记账设置</h1><div class="acts"><button class="btn" data-act="setback">← 回到记账</button></div></div>
  <div class="cols2">
    <div>
      <h2 style="margin-top:0">现在手上的钱<span>记账开始时的余额</span></h2>
      <section class="card"><div class="two"><label>现金 £<input id="sCash" type="number" step="0.01" value="${+S.cash || 0}"></label><label>卡 £<input id="sCard" type="number" step="0.01" value="${+S.card || 0}"></label></div></section>
      <h2>每月预算<span>0 表示只记不设预算</span></h2>
      <section class="card list flush">${cats}</section>
      <section class="card mtop"><div class="flab">加一个细分</div>
        <div class="addrow"><select id="nsP">${S.cats.map(c => `<option value="${c.id}">放进 ${esc(c.n)}</option>`).join("")}</select><input id="nsN" placeholder="名字"><input id="nsA" type="number" placeholder="预算" inputmode="decimal"><button class="btn" data-act="addsub">加</button></div></section>
      <button class="go mtop" data-act="saveset">保存</button>
    </div>
    <div>
      <h2 style="margin-top:0">攒钱目标</h2>
      <section class="card list flush">${S.goals.map(g => g.open ? `<div class="edit"><span class="n2">${esc(g.n)}</span><span class="dim">不设上限</span><button class="x" data-act="delgoal" data-id="${g.id}">×</button></div>` : row("eg", g.id, g.n, g.t, false, "delgoal")).join("")}</section>
      <div class="addrow mtop"><input id="ngN" placeholder="目标名字"><input id="ngA" type="number" placeholder="目标金额（空=不设上限）" inputmode="decimal"><button class="btn" data-act="addgoal">加</button></div>
      <h2>一次性大额</h2>
      <section class="card list flush">${S.ones.map(o => row("eo", o.id, o.n, o.a, false, "delone")).join("")}</section>
      <div class="addrow mtop"><input id="noN" placeholder="名目"><input id="noA" type="number" placeholder="金额" inputmode="decimal"><button class="btn" data-act="addone">加</button></div>
      <h2>备份</h2>
      <section class="card">
        <p class="hint">${store.mode === "cloud" ? "每天第一次打开网站会自动存一份备份，下面能恢复到某一天。" : "现在是本地模式，数据只存在这个浏览器里。"}</p>
        <div id="bkList" class="bklist"></div>
        <div class="two mtop"><button class="btn" data-act="export">复制全部数据</button><button class="btn" data-act="import">粘贴数据恢复</button></div>
      </section>
    </div>
  </div>`;
}
async function bindSettings() {
  const box = $("#bkList"); if (!box) return;
  const list = await listBackups();
  box.innerHTML = list.length ? list.slice(0, 14).map(b => `<div class="bk"><span>${esc(b.day)}</span><button class="mini" data-act="restore" data-id="${b.id}" data-day="${esc(b.day)}">恢复到这天</button></div>`).join("") : `<div class="hint">还没有备份。</div>`;
}
actions.saveset = () => {
  const S = L().S;
  S.cash = parseFloat($("#sCash").value) || 0; S.card = parseFloat($("#sCard").value) || 0;
  $$("[data-ec]").forEach(i => { const c = catOf(i.dataset.ec); if (c) c.a = parseFloat(i.value) || 0; });
  $$("[data-es]").forEach(i => { for (const c of S.cats) for (const s of c.subs || []) if (s.id === i.dataset.es) s.a = parseFloat(i.value) || 0; });
  $$("[data-eg]").forEach(i => { const g = goalOf(i.dataset.eg); if (g) g.t = parseFloat(i.value) || 0; });
  $$("[data-eo]").forEach(i => { const o = S.ones.find(z => z.id === i.dataset.eo); if (o) o.a = parseFloat(i.value) || 0; });
  save(); ui.rerender(); toast("保存好了");
};
actions.addsub = () => {
  const n = $("#nsN").value.trim(); if (!n) { toast("先填名字"); return; }
  const c = catOf($("#nsP").value); c.subs = c.subs || []; c.subs.push({ id: uid("s"), n, a: parseFloat($("#nsA").value) || 0 });
  save(); ui.rerender(); toast("加好了");
};
actions.delsub = el => { const snap = snapshot(); for (const c of L().S.cats) c.subs = (c.subs || []).filter(s => s.id !== el.dataset.id); save(); ui.rerender(); toast("删了一个细分", () => restoreSnap(snap)); };
actions.addgoal = () => { const n = $("#ngN").value.trim(); if (!n) { toast("先填名字"); return; } const a = parseFloat($("#ngA").value) || 0; L().S.goals.push({ id: uid("g"), n, t: a, s: 0, open: !(a > 0) }); save(); ui.rerender(); };
actions.delgoal = el => { const snap = snapshot(); L().S.goals = L().S.goals.filter(g => g.id !== el.dataset.id); save(); ui.rerender(); toast("删了一个目标", () => restoreSnap(snap)); };
actions.addone = () => { const n = $("#noN").value.trim(); if (!n) { toast("先填名目"); return; } L().S.ones.push({ id: uid("o"), n, a: parseFloat($("#noA").value) || 0, paid: false }); save(); ui.rerender(); };
actions.delone = el => { const snap = snapshot(); L().S.ones = L().S.ones.filter(o => o.id !== el.dataset.id); save(); ui.rerender(); toast("删了一项", () => restoreSnap(snap)); };
actions.restore = async el => {
  if (!el.dataset.armed) { el.dataset.armed = "1"; el.textContent = "再点一次确认"; return; }
  const ok = await restoreBackup(+el.dataset.id); toast(ok ? `恢复到 ${el.dataset.day} 了` : "恢复失败"); ui.rerender();
};
actions.export = () => {
  const txt = exportAll();
  modal(`<p class="mt">全部数据（记账、菜单、采购、食谱）</p><textarea class="mono" rows="10" readonly>${esc(txt)}</textarea><div class="two mtop"><button class="btn" data-close>关掉</button><button class="go" data-act="copyta">复制</button></div>`);
};
actions.copyta = () => { const ta = $("#modal textarea"); ta.select(); try { navigator.clipboard.writeText(ta.value).then(() => toast("复制好了")); } catch (e) { document.execCommand("copy"); toast("复制好了"); } };
actions.import = () => {
  modal(`<form><p class="mt">粘贴之前复制的全部数据，会覆盖现在的记账、菜单和采购记录</p><textarea name="t" class="mono" rows="8"></textarea>
    <div class="two mtop"><button type="button" class="btn" data-close>取消</button><button class="go" type="submit">恢复</button></div></form>`,
    (box, close) => box.querySelector("form").onsubmit = e => { e.preventDefault(); let o; try { o = JSON.parse(e.target.t.value); } catch (er) { toast("格式不对，检查是不是整段都粘进来了"); return; } close(); toast(importDocs(o) ? "恢复好了" : "内容不完整"); ui.rerender(); });
};
