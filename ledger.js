// 记账：数据操作、记账页、+ 记一笔小窗、储蓄罐
import { store, saveDoc, listBackups, restoreBackup, exportAll, importDocs } from "./store.js";
import { $, $$, esc, f2, money, round2, uid, today, dayLabel, parse, iso, toast, modal } from "./util.js";
import { actions, ui } from "./ui.js";

export const L = () => store.docs.ledger;
const save = () => saveDoc("ledger");

/* ---------- 旧数据升级到新分类（只跑一次） ---------- */
export function migrateLedger() {
  const d = L(); if (!d?.S || d.S.v >= 2) return false;
  const S = d.S, old = Object.fromEntries(S.cats.map(c => [c.id, c]));
  const g = old.grocery || { subs: [] };
  S.cats = [
    { id: "grocery", n: "超市", subBudget: true, subs: g.subs },
    { id: "eat", n: "外食", a: 40, subs: [{ id: "party", n: "聚餐" }, { id: "mealdeal", n: "Meal Deal" }, { id: "coffee", n: "外卖咖啡" }] },
    { id: "supp", n: "补剂", a: old.supp?.a ?? 45, subs: [] },
    { id: "trans", n: "交通", a: 15, subs: [] },
    { id: "phone", n: "话费", a: 9, fixed: true, subs: [] },
    { id: "fun", n: "出门玩", a: old.fun?.a ?? 30, subs: [] },
    { id: "other", n: "其他", a: 0, subs: [] },
  ];
  for (const x of d.E) {
    if (x.cat === "fixed") { x.cat = x.sub === "phone" ? "phone" : "other"; x.sub = ""; }
    else if (x.cat === "shop") { x.cat = "other"; x.sub = ""; }
    else if (x.cat === "trans") x.sub = "";
  }
  const ice = S.goals.find(z => /冰岛/.test(z.n));
  if (ice) { ice.t = 1200; ice.due = "2026-12-01"; }
  S.start = S.start || "2026-09-27";
  S.v = 2;
  save();
  return true;
}

export function catOf(id) { return L().S.cats.find(c => c.id === id) || null; }
export function goalOf(id) { return L().S.goals.find(g => g.id === id) || null; }
export function subName(id) { for (const c of L().S.cats) for (const s of c.subs || []) if (s.id === id) return s.n; return ""; }
export function nameOf(id) {
  const g = goalOf(id); if (g) return "储蓄罐 · " + g.n;
  if (id === "__one") return "一次性"; if (id === "__save") return "存进储蓄罐"; if (id === "__take") return "从储蓄罐取出";
  const c = catOf(id); return c ? c.n : "其他";
}
const isSpend = x => x.cat !== "__save" && x.cat !== "__take";
function flow(x) { const a = +x.amount || 0; if (x.cat === "__take") return a; if (goalOf(x.cat)) return 0; return -a; }

// 开始记账的那个月，按剩下的天数折算（话费这种每月一次的不折算）
function factor(c, m) {
  const st = L().S.start; if (!st || c.fixed || st.slice(0, 7) !== m) return 1;
  const [y, mo] = m.split("-").map(Number), dim = new Date(y, mo, 0).getDate();
  return (dim - +st.slice(8) + 1) / dim;
}
export function subBudget(c, s, m) { return c.subBudget ? round2((+s.a || 0) * factor(c, m)) : 0; }
export function catBudget(c, m) {
  m = m || today().slice(0, 7);
  if (L().S.start && m < L().S.start.slice(0, 7)) return 0;
  const base = c.subBudget ? (c.subs || []).reduce((a, s) => a + (+s.a || 0), 0) : (+c.a || 0);
  return round2(base * factor(c, m));
}
export const monthlyBudget = () => L().S.cats.reduce((a, c) => a + (c.subBudget ? (c.subs || []).reduce((b, s) => b + (+s.a || 0), 0) : (+c.a || 0)), 0);

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
  for (const c of S.cats) { alloc += catBudget(c, m); spent += byC[c.id] || 0; }
  const [yy, mm] = m.split("-").map(Number);
  const dim = new Date(yy, mm, 0).getDate();
  const cur = m === t.slice(0, 7), past = m < t.slice(0, 7);
  const st = S.start && S.start.slice(0, 7) === m ? +S.start.slice(8) : 1;
  const dn = cur ? +t.slice(8) : past ? dim : 0;
  const span = dim - st + 1, done = Math.max(0, dn - st + 1);
  const pot = S.goals.reduce((a, g) => a + (+g.s || 0), 0);
  return { m, byC, byS, byD, alloc, spent, left: round2(alloc - spent), dim, dn, st, dl: dim - dn + (cur ? 1 : 0), should: alloc * done / span,
    cash: (+S.cash || 0) + fc, card: (+S.card || 0) + fd, remain: (+S.cash || 0) + (+S.card || 0) + fc + fd, cur, pot };
}
export const unpaidTotal = () => L().S.ones.filter(o => !o.paid).reduce((a, o) => a + (+o.a || 0), 0);

// 按预算花，手上的钱（扣掉没付的大额）能撑到哪天
export function runway() {
  const c = calc(), mb = monthlyBudget();
  let avail = c.remain - unpaidTotal() - Math.max(0, c.left);
  if (avail < 0) return { date: today(), short: true };
  if (!(mb > 0)) return null;
  let d = parse(today()); d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  for (let i = 0; i < 60; i++) {
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (avail < mb) return { date: iso(new Date(d.getFullYear(), d.getMonth(), Math.max(1, Math.floor(avail / mb * dim)))) };
    avail -= mb; d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return { date: null };
}
// 冰岛这类有日期的目标：到出发前生活费留够以后，还能多出多少
export function spareFor(g) {
  if (!g?.due) return 0;
  const c = calc(), mb = monthlyBudget();
  const now = parse(today()), due = parse(g.due);
  const months = (due.getFullYear() - now.getFullYear()) * 12 + due.getMonth() - now.getMonth() + 1;
  return Math.max(0, round2(c.remain - unpaidTotal() - Math.max(0, c.left) - mb * Math.max(0, months - 1)));
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
  if (x.cat === "__save") { const q = goalOf(x.meta?.goal) || S.goals[0]; if (q) q.s = round2(Math.max(0, (+q.s || 0) - a)); }
  if (x.cat === "__take") { const q = goalOf(x.meta?.goal) || S.goals.find(g2 => x.note === g2.n + " 取出"); if (q) q.s = round2((+q.s || 0) + a); }
  if (x.cat === "__one") for (const o of S.ones) if (o.xid === x.id) { o.paid = false; o.xid = ""; }
  E.splice(i, 1);
  if (!quiet) save();
  return x;
}
function snapshot() { return JSON.stringify(L()); }
function restoreSnap(s) { store.docs.ledger = JSON.parse(s); save(); ui.rerender(); toast("已撤销"); }

/* ---------- + 记一笔（小窗，所有页面共用） ---------- */
const UIK = "kitchen:ledgerui";
let F = { cat: "grocery", sub: "meat", src: "card" };
try { Object.assign(F, JSON.parse(localStorage.getItem(UIK) || "{}")); } catch (e) {}
const saveF = () => { try { localStorage.setItem(UIK, JSON.stringify(F)); } catch (e) {} };
const SHOW_SUBS = ["grocery", "eat"];

function recentQuick() {
  const seen = new Set(), out = [];
  for (const x of L().E) {
    if (out.length >= 6) break;
    if (!x.note || !catOf(x.cat) || x.meta) continue;
    const k = x.note + "|" + x.cat + "|" + x.sub; if (seen.has(k)) continue; seen.add(k); out.push(x);
  }
  return out;
}
function formHtml() {
  const S = L().S;
  if (!catOf(F.cat)) F.cat = S.cats[0].id;
  const cur = catOf(F.cat), subs = SHOW_SUBS.includes(cur.id) ? cur.subs || [] : [];
  if (subs.length && !subs.some(s => s.id === F.sub)) F.sub = subs[0].id;
  const q = recentQuick();
  return `<div class="amtbox"><span class="cur">£</span><input class="bigin num" name="amount" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" aria-label="金额"></div>
    ${q.length ? `<div class="quick">${q.map((x, i) => `<button type="button" data-act="quick" data-i="${i}">${esc(x.note)}</button>`).join("")}</div>` : ""}
    <div class="flab">分类</div>
    <div class="chips">${S.cats.map(k => `<button type="button" class="chip2" data-act="fcat" data-id="${k.id}" aria-pressed="${k.id === F.cat}">${esc(k.n)}</button>`).join("")}</div>
    ${subs.length ? `<div class="chips mtop">${subs.map(s => `<button type="button" class="chip2 sm" data-act="fsub" data-id="${s.id}" aria-pressed="${s.id === F.sub}">${esc(s.n)}</button>`).join("")}</div>` : ""}
    <div class="two">
      <label>日期<input name="date" type="date" value="${today()}"></label>
      <div><div class="flab">怎么付</div><div class="seg2">${[["card", "卡"], ["cash", "现金"]].map(([v, n]) => `<button type="button" data-act="fsrc" data-v="${v}" aria-pressed="${F.src === v}">${n}</button>`).join("")}</div></div>
    </div>
    <label class="mtop">备注<input name="note" type="text" placeholder="买了什么（可不填）"></label>
    <button class="go mtop" type="submit">记下</button>`;
}
export function openAdd() {
  modal(`<form class="addf" data-form="add" autocomplete="off"><div class="mhead"><p class="mt">记一笔</p><button type="button" class="x" data-close aria-label="关掉">×</button></div><div id="addbody">${formHtml()}</div></form>`);
}
function refreshForm() {
  const f = $("form[data-form=add]"); if (!f) return;
  const keep = { amount: f.amount.value, date: f.date.value, note: f.note.value };
  $("#addbody").innerHTML = formHtml();
  f.amount.value = keep.amount; f.date.value = keep.date; f.note.value = keep.note;
}
actions.openadd = () => openAdd();
actions.fcat = el => { F.cat = el.dataset.id; saveF(); refreshForm(); };
actions.fsub = el => { F.sub = el.dataset.id; saveF(); refreshForm(); };
actions.fsrc = el => { F.src = el.dataset.v; saveF(); $$("[data-act=fsrc]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === F.src))); };
actions.quick = el => {
  const x = recentQuick()[+el.dataset.i]; if (!x) return;
  F.cat = x.cat; F.sub = x.sub || F.sub; F.src = x.src || "card"; saveF(); refreshForm();
  const f = $("form[data-form=add]"); f.note.value = x.note; f.amount.focus();
};
export function submitAdd(form) {
  const close = () => $("#modal [data-close]")?.click();
  const a = parseFloat(form.amount.value);
  if (!(a > 0)) { toast("先填金额"); form.amount.focus(); return; }
  const cur = catOf(F.cat); if (!cur) { toast("先选一个分类"); return; }
  const sub = SHOW_SUBS.includes(cur.id) && (cur.subs || []).length ? F.sub : "";
  const x = addEntry({ date: form.date.value || today(), amount: a, cat: F.cat, sub, src: F.src, note: form.note.value.trim() });
  close();
  toast(`记下了 £${f2(a)} · ${sub ? subName(sub) : cur.n}`, () => { removeEntry(x.id); ui.rerender(); });
  ui.rerender();
}

/* ---------- 储蓄罐 ---------- */
export function potHtml(compact) {
  const S = L().S, c = calc();
  const main = S.goals.find(g => !g.open) || null;
  let h = "";
  for (const g of S.goals) {
    const t = +g.t || 0, s = +g.s || 0, full = t > 0 && s >= t;
    if (g.open && s <= 0 && compact) continue;
    const pr = t > 0 ? Math.min(100, s / t * 100) : 0;
    const spare = !g.open ? spareFor(g) : 0, need = Math.max(0, round2(t - s));
    const mom = Math.max(0, round2(need - spare));
    h += `<div class="goal">
      <div class="t"><span class="nm">${esc(g.n)}</span><span class="v num"><b>£${f2(s)}</b>${t > 0 ? ` / ${f2(t)}` : ""}</span></div>
      ${t > 0 ? `<div class="pb pur"><i style="width:${pr.toFixed(0)}%"></i></div>` : ""}
      ${g.open ? `<p class="hint">不设上限，冰岛存满以后多出来的放这里。</p>` : full ? `<p class="note ok">✓ 存够了</p>` : `
        <ul class="gl">
          <li>还差 <b class="num">£${f2(need)}</b></li>
          <li>按预算留够${g.due ? ` ${+g.due.slice(5, 7)} 月前` : ""}的生活费，你手上还能挪出 <b class="num">£${f2(spare)}</b></li>
          <li>剩下大约 <b class="num">£${f2(mom)}</b> 要找妈妈要</li>
        </ul>`}
      ${compact ? "" : `<div class="acts mtop">
        ${!g.open && !full && spare > 0 ? `<button class="go sm" data-act="saveto" data-id="${g.id}" data-v="${Math.min(spare, need).toFixed(2)}">存 £${f2(Math.min(spare, need))} 进去</button>` : ""}
        <button class="btn" data-act="saveto" data-id="${g.id}">存入</button>
        ${s > 0 ? `<button class="btn" data-act="payfrom" data-id="${g.id}">用这里的钱付</button><button class="btn" data-act="take" data-id="${g.id}">取出来</button>` : ""}
      </div>`}
    </div>`;
  }
  return `<div class="pothead"><span>Monzo 储蓄罐 · 共 <b class="num">£${f2(c.pot)}</b></span></div>${h}
    ${compact ? "" : `<p class="hint mtop">在 Monzo 里把钱转进 Savings pot 以后，在这里点「存入」填同样的数，手上能花的钱会跟着减少。</p>`}`;
}
function monthEndBanner() {
  const t = today(), c = calc(), dim = c.dim;
  if (+t.slice(8) < dim - 2 || c.left <= 1) return "";
  if (L().E.some(x => x.cat === "__save" && x.date.slice(0, 7) === c.m && x.meta?.monthEnd)) return "";
  const g = L().S.goals.find(z => !z.open && (+z.s || 0) < (+z.t || 0)) || L().S.goals[0];
  if (!g) return "";
  return `<div class="banner">这个月还剩 <b class="num">£${f2(c.left)}</b> 预算没花，要存进储蓄罐吗？
    <button class="go sm" data-act="saveto" data-id="${g.id}" data-v="${c.left.toFixed(2)}" data-me="1">存进「${esc(g.n)}」</button></div>`;
}
export { monthEndBanner };
function askMoney(title, def, cb) {
  modal(`<form><p class="mt">${esc(title)}</p><input name="v" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" class="num big" value="${def || ""}">
    <div class="two mtop"><button type="button" class="btn" data-close>取消</button><button class="go" type="submit">确定</button></div></form>`,
    (box, close) => { box.querySelector("form").onsubmit = e => { e.preventDefault(); const v = parseFloat(e.target.v.value); close(); if (v > 0) cb(v); }; });
}
actions.saveto = el => {
  const g = goalOf(el.dataset.id); if (!g) return;
  askMoney(`存多少进「${g.n}」？（先在 Monzo 里转进 pot）`, el.dataset.v, v => {
    const c = calc(); if (v > c.remain) { toast(`手上只有 £${f2(c.remain)}`); return; }
    g.s = round2((+g.s || 0) + v);
    addEntry({ amount: v, cat: "__save", note: "存进 " + g.n, meta: { goal: g.id, monthEnd: !!el.dataset.me } });
    ui.rerender(); toast(`存进去 £${f2(v)}`);
  });
};
actions.take = el => {
  const g = goalOf(el.dataset.id); if (!g) return;
  askMoney(`从「${g.n}」取多少回到手上？现在有 £${f2(g.s)}`, "", v => {
    if (v > (+g.s || 0)) { toast(`「${g.n}」只有 £${f2(g.s)}`); return; }
    g.s = round2((+g.s || 0) - v);
    addEntry({ amount: v, cat: "__take", note: g.n + " 取出", meta: { goal: g.id } }); ui.rerender(); toast("取出 £" + f2(v));
  });
};
actions.payfrom = el => {
  const g = goalOf(el.dataset.id); if (!g) return;
  modal(`<form><p class="mt">用「${esc(g.n)}」里的钱付一笔（不占每月预算）</p>
    <input name="v" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" class="num big">
    <label class="mtop">花在哪<input name="n" placeholder="比如：机票、青旅、极光团"></label>
    <div class="two mtop"><button type="button" class="btn" data-close>取消</button><button class="go" type="submit">记下</button></div></form>`,
    (box, close) => box.querySelector("form").onsubmit = e => {
      e.preventDefault(); const v = parseFloat(e.target.v.value); if (!(v > 0)) return;
      if (v > (+g.s || 0)) { toast(`「${g.n}」只有 £${f2(g.s)}`); return; }
      g.s = round2((+g.s || 0) - v); addEntry({ amount: v, cat: g.id, note: e.target.n.value.trim() || g.n }); close(); ui.rerender(); toast(`从储蓄罐付了 £${f2(v)}`);
    });
};

/* ---------- 记账页 ---------- */
let viewMonth = null, showSet = false, jFilter = "";
function monthShift(m, n) { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
const mLabel = m => `${+m.slice(0, 4)} 年 ${+m.slice(5)} 月`;
const fmtDate = s => `${+s.slice(0, 4)} 年 ${+s.slice(5, 7)} 月 ${+s.slice(8)} 日`;

export function heroCard(c, withNav) {
  const st = c.left < 0 ? "bad" : (c.cur && c.spent > c.should * 1.1 ? "warn" : "");
  const pill = c.left < 0 ? "超了" : st === "warn" ? "花得偏快" : c.cur ? "节奏正常" : "";
  const rw = c.cur ? runway() : null;
  const first = L().S.start && c.m === L().S.start.slice(0, 7) && c.st > 1;
  return `<div class="hero-l">
    <div class="bal"><span>手上能花 <b class="num">${money(c.remain)}</b></span><span class="num">卡 ${money(c.card)} · 现金 ${money(c.cash)}${c.pot > 0 ? ` · 储蓄罐另有 ${money(c.pot)}` : ""}</span></div>
    ${rw ? `<div class="runway ${rw.short ? "bad" : ""}">${rw.short ? "手上的钱不够付完待付的大额了" : rw.date ? `按预算花，钱够用到 <b>${fmtDate(rw.date)}</b>` : "按预算花，钱够用很久"}</div>` : ""}
    <div class="mrow-h">${withNav ? `<button class="ghost" data-act="mprev" aria-label="上个月">‹</button>` : ""}<span class="lab">${c.cur ? "这个月还能花" : mLabel(c.m) + " 结余"}</span>${withNav ? `<button class="ghost" data-act="mnext" aria-label="下个月" ${c.cur ? "disabled" : ""}>›</button>` : ""}</div>
    <div class="amt num ${c.left < 0 ? "neg" : ""}">${money(c.left)}</div>
    <div class="pace">${pill ? `<span class="pill ${st}">${pill}</span>` : ""}${c.cur ? (c.left > 0 ? `接下来每天 <b class="num">£${f2(c.left / Math.max(1, c.dl))}</b>` : c.left < 0 ? "下个月额度里要补回来" : "额度刚好用完") : ""}</div>
    <div class="bar"><i class="${st}" style="width:${c.alloc > 0 ? Math.min(100, c.spent / c.alloc * 100).toFixed(1) : 0}%"></i>${c.cur ? `<b style="left:calc(${(Math.max(0, c.dn - c.st + 1) / (c.dim - c.st + 1) * 100).toFixed(1)}% - 1px)"></b>` : ""}</div>
    <div class="meta num"><span>预算 £${f2(c.alloc)} · 已花 £${f2(c.spent)}</span><span>${c.cur ? "还剩 " + c.dl + " 天" : ""}</span></div>
    ${first ? `<div class="hint">${+c.m.slice(5)} 月从 ${c.st} 号开始记账，预算按剩下 ${c.dim - c.st + 1} 天折算；下个月起是完整的 £${f2(monthlyBudget())}。</div>` : ""}
  </div>`;
}
function chart(c) {
  const n = c.dim, per = c.alloc / Math.max(1, n - c.st + 1); let max = per * 1.6;
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
    const a = catBudget(k, c.m), sp = c.byC[k.id] || 0, lf = a - sp;
    const pr = a > 0 ? Math.min(100, sp / a * 100) : (sp > 0 ? 100 : 0);
    const cl = a > 0 ? (lf < 0 ? "bad" : lf / a <= .2 ? "warn" : "") : "";
    h += `<div class="it ${cl}"><button class="t" data-act="jfilter" data-id="${k.id}"><span class="nm">${esc(k.n)}</span>
      <span class="v num">${a > 0 ? `剩 <b>${money(lf)}</b> / ${f2(a)}` : `<b>£${f2(sp)}</b> 只记不设预算`}</span></button>
      ${a > 0 ? `<div class="pb"><i style="width:${pr.toFixed(0)}%"></i></div>` : ""}</div>`;
    for (const s of k.subs || []) {
      const sa = subBudget(k, s, c.m), ss = c.byS[s.id] || 0;
      if (!k.subBudget && ss <= 0) continue;
      const sl = sa - ss, spr = sa > 0 ? Math.min(100, ss / sa * 100) : 0;
      const scl = sa > 0 ? (sl < 0 ? "bad" : sl / sa <= .2 ? "warn" : "") : "";
      h += `<div class="it sub ${scl}"><button class="t" data-act="jfilter" data-id="${s.id}"><span class="nm">${esc(s.n)}</span>
        <span class="v num">${sa > 0 ? `剩 <b>${money(sl)}</b> / ${f2(sa)}` : `花了 <b>£${f2(ss)}</b>`}</span></button>
        ${sa > 0 ? `<div class="pb"><i style="width:${spr.toFixed(0)}%"></i></div>` : ""}</div>`;
    }
  }
  return h;
}
function journal(list) {
  if (!list.length) return `<div class="empty">这里还没有账。点右下角的 + 记一笔。</div>`;
  const days = []; let cur = null;
  for (const x of list) { if (!cur || cur.d !== x.date) { cur = { d: x.date, items: [], sum: 0 }; days.push(cur); } cur.items.push(x); if (isSpend(x) && !goalOf(x.cat)) cur.sum += +x.amount || 0; }
  return days.map(g => `<div class="day"><span>${dayLabel(g.d)}</span><span class="num">${g.sum > 0 ? "£" + f2(g.sum) : ""}</span></div>
    <div class="list">${g.items.map(y => {
      const cat = nameOf(y.cat), sb = y.sub ? subName(y.sub) : "";
      const title = esc(y.note || sb || cat);
      const tag = [y.note ? cat : "", sb && y.note ? sb : "", y.src === "cash" ? "现金" : ""].filter(Boolean).join(" · ");
      const inflow = y.cat === "__take", pot = y.cat === "__save" || goalOf(y.cat);
      return `<div class="jr"><span class="m">${title}${tag ? `<small>${esc(tag)}</small>` : ""}</span>
        <span class="a num ${inflow ? "in" : pot ? "pot" : ""}">${inflow ? "+" : ""}${f2(y.amount)}</span>
        <button class="x" data-act="delentry" data-id="${y.id}" aria-label="删除这笔">×</button></div>`;
    }).join("")}</div>`).join("");
}
function onesHtml() {
  return L().S.ones.map(o => `<div class="it ${o.paid ? "done" : ""}"><div class="t"><span class="nm">${o.paid ? "✓ " : ""}${esc(o.n)}</span>
    <span class="v2"><b class="num">£${f2(o.a)}</b><button class="mini" data-act="pay" data-id="${o.id}">${o.paid ? "撤销" : "付了"}</button></span></div></div>`).join("") || `<div class="empty">没有待付的大额。</div>`;
}

export function renderLedger(el) {
  if (!viewMonth) viewMonth = today().slice(0, 7);
  if (showSet) { el.innerHTML = settingsHtml(); bindSettings(); return; }
  const c = calc(viewMonth), E = L().E;
  let list = E.filter(x => x.date.slice(0, 7) === viewMonth), fname = "";
  if (jFilter) { list = list.filter(x => x.cat === jFilter || x.sub === jFilter); fname = subName(jFilter) || nameOf(jFilter); }
  const up = unpaidTotal();
  el.innerHTML = `<div class="pagehead"><h1>记账</h1><div class="acts"><button class="btn" data-act="settings">预算和备份</button></div></div>
  ${c.cur ? monthEndBanner() : ""}
  <div class="cols2">
    <div>
      <section class="card">${heroCard(c, true)}${chart(c)}</section>
      <h2>各分类<span>点一下只看这一类的账</span></h2>
      <section class="card list flush">${catList(c)}</section>
    </div>
    <div>
      <h2 class="h2top">储蓄罐</h2>
      <section class="card">${potHtml(false)}</section>
      <h2>待付的大额<span>${up > 0 ? "还要付 £" + f2(up) : "都付了"}</span></h2>
      <section class="card list flush">${onesHtml()}</section>
      <h2>${viewMonth === today().slice(0, 7) ? "这个月" : +viewMonth.slice(5) + " 月"}的账${fname ? `<span>只看「${esc(fname)}」 <button class="linkbtn" data-act="jfilter" data-id="">看全部</button></span>` : `<span>${list.filter(x => isSpend(x) && !goalOf(x.cat)).length} 笔</span>`}</h2>
      ${journal(list)}
    </div>
  </div>`;
}
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
actions.settings = () => { showSet = true; ui.rerender(); window.scrollTo(0, 0); };
actions.setback = () => { showSet = false; ui.rerender(); };

/* ---------- 设置 ---------- */
function settingsHtml() {
  const S = L().S;
  const row = (attr, id, n, v, ind, del) => `<div class="edit ${ind ? "ind" : ""}"><span class="n2">${esc(n)}</span>
    <input data-${attr}="${id}" type="number" min="0" step="1" inputmode="decimal" value="${+v || 0}" aria-label="${esc(n)}">${del ? `<button class="x" data-act="${del}" data-id="${id}" aria-label="删除 ${esc(n)}">×</button>` : "<span></span>"}</div>`;
  let cats = "";
  for (const c of S.cats) {
    if (c.subBudget) {
      cats += `<div class="edit"><span class="n2"><b>${esc(c.n)}</b></span><span class="dim num">£${f2(catBudget(c, "9999-12"))}</span><span></span></div>`;
      for (const s of c.subs) cats += row("es", s.id, s.n, s.a, true, "delsub");
    } else cats += row("ec", c.id, c.n + ((c.subs || []).length ? `（${c.subs.map(s => s.n).join(" / ")}）` : ""), c.a, false, "");
  }
  return `<div class="pagehead"><h1>预算和备份</h1><div class="acts"><button class="btn" data-act="setback">← 回到记账</button></div></div>
  <div class="cols2">
    <div>
      <h2 class="h2top">开始记账时的余额</h2>
      <section class="card"><div class="two nomt"><label>卡 £<input id="sCard" type="number" step="0.01" value="${+S.card || 0}"></label><label>现金 £<input id="sCash" type="number" step="0.01" value="${+S.cash || 0}"></label></div></section>
      <h2>每月预算<span>0 表示只记不设预算 · 每月合计 £${f2(monthlyBudget())}</span></h2>
      <section class="card list flush">${cats}</section>
      <section class="card mtop"><div class="flab nomt">给超市加一个细分</div>
        <div class="addrow"><input id="nsN" placeholder="名字"><input id="nsA" type="number" placeholder="每月预算" inputmode="decimal"><button class="btn" data-act="addsub">加</button></div></section>
      <button class="go mtop" data-act="saveset">保存</button>
    </div>
    <div>
      <h2 class="h2top">储蓄罐目标</h2>
      <section class="card list flush">${S.goals.map(g => g.open ? `<div class="edit"><span class="n2">${esc(g.n)}</span><span class="dim">不设上限</span><button class="x" data-act="delgoal" data-id="${g.id}">×</button></div>` : row("eg", g.id, g.n, g.t, false, "delgoal")).join("")}</section>
      <div class="addrow mtop"><input id="ngN" placeholder="目标名字"><input id="ngA" type="number" placeholder="目标金额（空=不设上限）" inputmode="decimal"><button class="btn" data-act="addgoal">加</button></div>
      <h2>待付的大额</h2>
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
  catOf("grocery").subs.push({ id: uid("s"), n, a: parseFloat($("#nsA").value) || 0 });
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
