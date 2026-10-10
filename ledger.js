// 记账：数据操作、记账页、+ 记一笔小窗、储蓄罐
import { store, saveDoc, listBackups, restoreBackup, exportAll, importDocs } from "./store.js";
import { $, $$, esc, f2, money, round2, uid, today, dayLabel, parse, iso, toast, modal, mondayOf } from "./util.js";
import { actions, ui } from "./ui.js";
import { addInv, setInv } from "./shop.js";
import { generate, week, entryFor } from "./menu.js";

export const L = () => store.docs.ledger;
const save = () => saveDoc("ledger");
const INBOX_V = 20261007;   // inbox.json 支持的功能版本：加新字段时调大，并在用到的批次里写 minV

/* ---------- 旧数据升级到新分类（只跑一次） ---------- */
export function migrateLedger() {
  const d = L(); if (!d?.S || d.S.v >= 6) return false;
  if (d.S.v === 5) return migrateV6(d);
  if (d.S.v === 4) return migrateV5(d);
  if (d.S.v === 3) return migrateV4(d);
  if (d.S.v >= 2) return migrateV3(d);
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
  return migrateV3(d);
}

/* ---------- 只分五类：吃饭、零食、交通、话费、其他 ---------- */
// 水算吃饭；汽水、奶昔、咖啡奶茶算零食
const SNACKY = /零食|糖|巧克|奶昔|可乐|汽水|雪碧|芬达|饮料|果汁|奶茶|咖啡|coffee|latte|冰淇淋|雪糕|薯片|饼干|蛋糕|甜/i;
const WATER = /(^|[^汽])水(?!果)|water/i;
// 旧的分类/小类 → 新的五类
export function legacyCat(cat, sub, note) {
  const n = note || "";
  if (["food", "snack", "social", "trans", "phone", "other"].includes(cat)) return cat;
  if (cat === "grocery") {
    if (sub === "snack") return WATER.test(n) && !SNACKY.test(n.replace(WATER, "")) ? "food" : "snack";
    return "food";
  }
  if (cat === "eat") {
    if (sub === "party") return "social";
    if (sub === "coffee") return /咖啡|奶茶|coffee|latte/i.test(n) ? "snack" : "food";
    return "food";
  }
  if (cat === "fixed") return sub === "phone" ? "phone" : "other";
  return "other";   // supp、fun、shop 和不认识的
}
function migrateV3(d) {
  const S = d.S, old = Object.fromEntries(S.cats.map(c => [c.id, c]));
  const gSubs = old.grocery?.subs || [];
  const gAll = gSubs.reduce((a, s) => a + (+s.a || 0), 0);
  const gSnack = +(gSubs.find(s => s.id === "snack")?.a || 0);
  S.cats = [
    { id: "food", n: "吃饭", a: Math.round((gAll - gSnack) || 230) + 10 },
    { id: "snack", n: "零食", a: 15 },
    { id: "trans", n: "交通", a: old.trans?.a ?? 15 },
    { id: "phone", n: "话费", a: 9, fixed: true },
    { id: "other", n: "其他", a: old.fun?.a ?? 30 },
  ];
  for (const x of d.E) {
    if (x.cat.startsWith("__") || S.goals.some(g => g.id === x.cat)) continue;
    const was = x.sub;
    x.cat = legacyCat(x.cat, x.sub, x.note);
    if (was === "party" && !/聚餐/.test(x.note || "")) x.note = ["聚餐", x.note].filter(Boolean).join(" · ");
    x.sub = "";
  }
  S.v = 3;
  return migrateV4(d);
}
// 囤货池：每月固定留 £30（原来吃饭预算里的米面调料挪过来），10 月起算；9 月回来补的算开荒
function migrateV4(d) {
  const S = d.S, food = S.cats.find(c => c.id === "food");
  S.pool = S.pool || { a: 30, start: "2026-10" };
  if (food && +food.a >= 240) food.a = +food.a - 30;
  S.v = 4; return migrateV5(d);
}
// 大额分摊：已经付的几笔按用的月份平摊；公交卡 90 天一续
function migrateV5(d) {
  const S = d.S;
  const rule = [
    [/健身房|Gym/i, { start: "2026-10", months: 9, plan: true }],
    [/UniLink/i, { start: "2026-10", months: 3, plan: true }],
    [/平底锅|切菜板|沥水篮/, { start: "2026-10", months: 9, plan: true }],
    [/希思罗/, { start: "2026-09", months: 1, plan: true }],
    [/生日/, { start: "2026-10", months: 3, plan: false }],
  ];
  for (const x of d.E) if (x.cat === "__one" && !x.spread) { const r = rule.find(([re]) => re.test(x.note || "")); if (r) x.spread = { ...r[1] }; }
  S.recur = S.recur || [{ key: "UniLink", n: "UniLink 公交卡", a: 140, months: 3 }];
  for (const o of S.ones) if (/朋友来玩/.test(o.n)) o.spread = o.spread || { months: 1, plan: false };
  S.v = 5; return migrateV6(d);
}
// 人情单独一类：请客、礼物、聚餐、出去玩，月上限 £30；其他只剩补剂衣服这些，降到 £15
function migrateV6(d) {
  const S = d.S;
  if (!S.cats.some(c => c.id === "social")) {
    const i = S.cats.findIndex(c => c.id === "snack");
    S.cats.splice(i + 1, 0, { id: "social", n: "人情", a: 30 });
    const o = S.cats.find(c => c.id === "other"); if (o && +o.a === 30) o.a = 15;
  }
  for (const x of d.E) {
    if (x.cat === "other" && /聚餐|请客|礼物|生日/.test(x.note || "")) x.cat = "social";
    if (x.cat === "__one" && x.spread && !x.spread.plan && /请客|聚餐|礼物|生日/.test(x.note || "")) x.spread.cat = "social";
  }
  S.v = 6; save(); return true;
}

export function catOf(id) { return L().S.cats.find(c => c.id === id) || null; }
export function goalOf(id) { return L().S.goals.find(g => g.id === id) || null; }
export function subName() { return ""; }
export function nameOf(id) {
  const g = goalOf(id); if (g) return "储蓄罐 · " + g.n;
  if (id === "__one") return "一次性"; if (id === "__stock") return "囤货"; if (id === "__save") return "存进储蓄罐"; if (id === "__take") return "从储蓄罐取出";
  const c = catOf(id); return c ? c.n : "其他";
}
const isSpend = x => x.cat !== "__save" && x.cat !== "__take";
function flow(x) { const a = +x.amount || 0; if (x.cat === "__take") return a; if (goalOf(x.cat)) return x.meta?.hand ? -a : 0; return -a; }

// 开始记账的那个月，按剩下的天数折算（话费这种每月一次的不折算）
function factor(c, m) {
  const st = L().S.start; if (!st || c.fixed || st.slice(0, 7) !== m) return 1;
  const [y, mo] = m.split("-").map(Number), dim = new Date(y, mo, 0).getDate();
  return (dim - +st.slice(8) + 1) / dim;
}
// 话费这种每月一次的：这个月交过了，预算就按实际交的算（9 月只交了 £6.46 也算交过）
function fixedPaid(c, m) {
  if (!c.fixed) return 0;
  return round2(L().E.filter(x => x.cat === c.id && x.date.slice(0, 7) === m).reduce((a, x) => a + (+x.amount || 0), 0));
}
export function catBudget(c, m) {
  m = m || today().slice(0, 7);
  if (L().S.start && m < L().S.start.slice(0, 7)) return 0;
  const fp = fixedPaid(c, m); if (fp > 0) return fp;
  return round2((+c.a || 0) * factor(c, m));
}
export const poolOf = () => L().S.pool || null;

/* ---------- 大额分摊 ----------
   一次性付的大额（健身房年卡、公交卡、锅）按用的月份平摊，每个月的账里算那个月的一份。
   x.spread = { start: "2026-10", months: 9, plan: true }
   plan=true：本来就要花的固定开销（健身房、公交卡），这份也加进当月预算，不算超支
   plan=false：计划外的（生日请客、出去玩），这份从当月预算里扣，几个月一起消化 */
const monthsFrom = (a, b) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + m2 - m1; };
export const mAdd = (m, n) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
export function spreadOf(x) {
  if (x.cat !== "__one") return null;
  return x.spread || { start: x.date.slice(0, 7), months: 1, plan: false };
}
export function sharesIn(m) {
  const out = [];
  for (const x of L().E) {
    const sp = spreadOf(x); if (!sp) continue;
    const n = Math.max(1, +sp.months || 1), k = monthsFrom(sp.start, m);
    if (k < 0 || k >= n) continue;
    out.push({ x, share: round2((+x.amount || 0) / n), k: k + 1, n, plan: !!sp.plan, cat: sp.cat || "" });
  }
  return out;
}
// 会续费的固定大额：用完一轮还要再买（公交卡 90 天一张）。算"钱能撑到哪天"时，没预付到的月份要留出这份
export const recurOf = () => L().S.recur || [];
// 囤货池到某个月底还剩多少：每月存进去 a，买囤货从里面扣
export function poolLeft(m) {
  const P = poolOf(); if (!P) return 0;
  m = m || today().slice(0, 7); if (m < P.start) return 0;
  const put = (+P.a || 0) * (monthsFrom(P.start, m) + 1);
  const used = L().E.filter(x => x.cat === "__stock" && x.date.slice(0, 7) >= P.start && x.date.slice(0, 7) <= m).reduce((a, x) => a + (+x.amount || 0), 0);
  return round2(put - used);
}
const poolMonth = m => { const P = poolOf(); return P && m >= P.start ? +P.a || 0 : 0; };
export const monthlyBudget = () => L().S.cats.reduce((a, c) => a + (+c.a || 0), 0) + (poolOf() ? +poolOf().a || 0 : 0);

// 吃饭是超了也得买的，不算进"花得快不快"的提醒；零食、交通、其他才算
const MUST = new Set(["food", "phone"]);
export function calc(month) {
  const S = L().S, E = L().E, t = today(), m = month || t.slice(0, 7);
  const byC = {}, byS = {}, byD = {};
  for (const c of S.cats) byC[c.id] = 0;
  let fc = 0, fd = 0;
  for (const x of E) {
    const a = +x.amount || 0, fl = flow(x);
    if (x.src === "cash") fc += fl; else fd += fl;
    if (x.date.slice(0, 7) !== m || (S.start && x.date < S.start)) continue;
    if (byC[x.cat] !== undefined) { byC[x.cat] += a; const d = +x.date.slice(8); byD[d] = (byD[d] || 0) + a; }
  }
  let alloc = 0, spent = 0, cAlloc = 0, cSpent = 0, stock = 0;
  for (const c of S.cats) { alloc += catBudget(c, m); spent += byC[c.id] || 0; if (!MUST.has(c.id)) { cAlloc += catBudget(c, m); cSpent += byC[c.id] || 0; } }
  for (const x of E) if (x.cat === "__stock" && x.date.slice(0, 7) === m) stock += +x.amount || 0;
  // 囤货池：每月留的那笔算进预算，也算这个月花掉了（钱挪进池子），实际买囤货从池子里扣
  const pm = poolMonth(m); alloc += pm; spent += pm;
  // 大额分摊：这个月该算的那一份
  const shares = sharesIn(m); let amort = 0, amortPlan = 0;
  for (const s2 of shares) {
    amort += s2.share; spent += s2.share;
    if (s2.plan) { amortPlan += s2.share; alloc += s2.share; }
    else if (s2.cat && byC[s2.cat] !== undefined) { byC[s2.cat] += s2.share; if (!MUST.has(s2.cat)) cSpent += s2.share; }
  }
  const [yy, mm] = m.split("-").map(Number);
  const dim = new Date(yy, mm, 0).getDate();
  const cur = m === t.slice(0, 7), past = m < t.slice(0, 7);
  const st = S.start && S.start.slice(0, 7) === m ? +S.start.slice(8) : 1;
  const dn = cur ? +t.slice(8) : past ? dim : 0;
  const span = dim - st + 1, done = Math.max(0, dn - st + 1);
  const pot = S.goals.reduce((a, g) => a + (+g.s || 0), 0);
  const upfront = pm + amort, allocDaily = alloc - pm - amortPlan;
  return { m, byC, byS, byD, alloc, spent, cAlloc, cSpent, stock: round2(stock), upfront: round2(upfront), allocDaily: round2(allocDaily), shares, amort: round2(amort), amortPlan: round2(amortPlan), left: round2(alloc - spent), dim, dn, st, dl: dim - dn + (cur ? 1 : 0), should: alloc * done / span,
    cash: (+S.cash || 0) + fc, card: (+S.card || 0) + fd, remain: (+S.cash || 0) + (+S.card || 0) + fc + fd, cur, pot };
}
export const unpaidTotal = () => L().S.ones.filter(o => !o.paid).reduce((a, o) => a + (+o.a || 0), 0);

// 按预算花，手上的钱（扣掉没付的大额）能撑到哪天
// 某个月要从手上掏的钱：日常预算 + 囤货池 + 到期要续费的固定大额（已经预付覆盖到的月份不算）
export function needIn(m) {
  let need = monthlyBudget();
  for (const r of recurOf()) {
    const paid = L().E.filter(x => x.cat === "__one" && x.spread && (x.note || "").includes(r.key))
      .some(x => monthsFrom(x.spread.start, m) >= 0 && monthsFrom(x.spread.start, m) < x.spread.months);
    if (!paid) need += (+r.a || 0) / Math.max(1, +r.months || 1);
  }
  return round2(need);
}
export function runway() {
  const c = calc(); if (!(monthlyBudget() > 0)) return null;
  let avail = c.remain - unpaidTotal() - Math.max(0, c.left);
  if (avail < 0) return { date: today(), short: true };
  let m = mAdd(today().slice(0, 7), 1);
  for (let i = 0; i < 60; i++) {
    const need = needIn(m), [y, mo] = m.split("-").map(Number), dim = new Date(y, mo, 0).getDate();
    if (avail < need) return { date: iso(new Date(y, mo - 1, Math.max(1, Math.floor(avail / need * dim)))) };
    avail -= need; m = mAdd(m, 1);
  }
  return { date: null };
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
  if (g && !x.meta?.hand) g.s = round2((+g.s || 0) + a);
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
let F = { cat: "food", src: "card" };
try { Object.assign(F, JSON.parse(localStorage.getItem(UIK) || "{}")); } catch (e) {}
const CAT_HINT = {
  food: "超市买菜买肉、水、日用品、Meal Deal、外卖正餐",
  snack: "糖、巧克力、奶昔、可乐、奶茶咖啡这些想吃才买的",
  trans: "公交、打车、大巴火车",
  phone: "每月话费",
  social: "请客、送礼、聚餐、跟朋友出去玩，这些可以不花的",
  other: "补剂、衣服护肤、药",
  __stock: "米、面粉、油、燕麦、调料、蛋白粉、蜂蜜、咖啡这种一买用很久的，从囤货池里扣",
};
const saveF = () => { try { localStorage.setItem(UIK, JSON.stringify(F)); } catch (e) {} };

// 话费这种每月一次的，这个月交过了就不再出现在记一笔里
function openCats() {
  const c = calc();
  return L().S.cats.filter(k => !(k.fixed && catBudget(k) > 0 && (c.byC[k.id] || 0) >= catBudget(k) - 0.004));
}
function recentQuick() {
  const seen = new Set(), out = [], ok = new Set(openCats().map(k => k.id));
  for (const x of L().E) {
    if (out.length >= 6) break;
    if (!x.note || !(ok.has(x.cat) || x.cat === "__stock") || x.meta) continue;
    const k = x.note + "|" + x.cat; if (seen.has(k)) continue; seen.add(k); out.push(x);
  }
  return out;
}
function formHtml() {
  const cats = [...openCats(), { id: "__stock", n: "囤货" }];
  if (!cats.some(k => k.id === F.cat)) F.cat = cats[0].id;
  const q = recentQuick();
  return `<div class="amtbox"><span class="cur">£</span><input class="bigin num" name="amount" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" aria-label="金额"></div>
    ${q.length ? `<div class="quick">${q.map((x, i) => `<button type="button" data-act="quick" data-i="${i}">${esc(x.note)}</button>`).join("")}</div>` : ""}
    <div class="flab">分类</div>
    <div class="chips">${cats.map(k => `<button type="button" class="chip2" data-act="fcat" data-id="${k.id}" aria-pressed="${k.id === F.cat}">${esc(k.n)}</button>`).join("")}</div>
    <div class="hint">${CAT_HINT[F.cat] || ""}</div>
    <div class="two">
      <label>日期<input name="date" type="date" value="${today()}"></label>
      <div><div class="flab">怎么付</div><div class="seg2">${[["card", "卡"], ["cash", "现金"]].map(([v, n]) => `<button type="button" data-act="fsrc" data-v="${v}" aria-pressed="${F.src === v}">${n}</button>`).join("")}</div></div>
    </div>
    <label class="mtop">备注<input name="note" type="text" placeholder="买了什么（可不填）"></label>
    <button class="go mtop" type="submit">记下</button>`;
}
export function openAdd() {
  modal(`<form class="addf" data-form="add" autocomplete="off"><div class="mhead"><p class="mt">记一笔</p><span class="mh-r"><button type="button" class="mini" data-act="openrc">粘贴小票</button><button type="button" class="x" data-close aria-label="关掉">×</button></span></div><div id="addbody">${formHtml()}</div></form>`);
}
function refreshForm() {
  const f = $("form[data-form=add]"); if (!f) return;
  const keep = { amount: f.amount.value, date: f.date.value, note: f.note.value };
  $("#addbody").innerHTML = formHtml();
  f.amount.value = keep.amount; f.date.value = keep.date; f.note.value = keep.note;
}
actions.openadd = () => openAdd();
actions.fcat = el => { F.cat = el.dataset.id; saveF(); refreshForm(); };
actions.fsrc = el => { F.src = el.dataset.v; saveF(); $$("[data-act=fsrc]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === F.src))); };
actions.quick = el => {
  const x = recentQuick()[+el.dataset.i]; if (!x) return;
  F.cat = x.cat; F.src = x.src || "card"; saveF(); refreshForm();
  const f = $("form[data-form=add]"); f.note.value = x.note; f.amount.focus();
};
export function submitAdd(form) {
  const close = () => $("#modal [data-close]")?.click();
  const a = parseFloat(form.amount.value);
  if (!(a > 0)) { toast("先填金额"); form.amount.focus(); return; }
  const cur = F.cat === "__stock" ? { n: "囤货" } : catOf(F.cat); if (!cur) { toast("先选一个分类"); return; }
  const x = addEntry({ date: form.date.value || today(), amount: a, cat: F.cat, src: F.src, note: form.note.value.trim() });
  close();
  toast(`记下了 £${f2(a)} · ${cur.n}`, () => { removeEntry(x.id); ui.rerender(); });
  ui.rerender();
}

/* ---------- 粘贴小票：Claude 识别完给一段导入码，粘进来一次记好 ----------
   格式：{"d":"2026-09-28","s":"Tesco","p":"card","l":[["eat","mealdeal",3.85,"三明治 水"], ...]}
   l 每行 = [分类, 小类, 金额, 备注]；分类/小类写 id 或中文名都行。一次可以粘好几张。 */
function scanObjects(txt) {
  const out = []; let depth = 0, start = -1, inStr = false, escp = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (inStr) { if (escp) escp = false; else if (ch === "\\") escp = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') { if (depth > 0) inStr = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}" && depth > 0) { depth--; if (depth === 0) { try { out.push(JSON.parse(txt.slice(start, i + 1))); } catch (e) {} } }
  }
  return out;
}
function findCat(v) {
  const k = String(v ?? "").trim(), cats = L().S.cats;
  if (["stock", "囤货", "__stock"].includes(k)) return { id: "__stock", n: "囤货" };
  if (["once", "一次性", "__one"].includes(k)) return { id: "__one", n: "一次性" };
  return cats.find(c => c.id === k) || cats.find(c => c.n === k) || null;
}
function parseReceipts(txt) { return normReceipts(scanObjects(txt.replace(/[“”]/g, '"'))); }
function normReceipts(objs) {
  const recs = [];
  for (const o of objs) {
    if (!o || !Array.isArray(o.l)) continue;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(o.d || "") ? o.d : today();
    const shop = String(o.s || "").trim();
    const src = o.p === "cash" ? "cash" : "card";
    const lines = [];
    for (const r of o.l) {
      const [cv, sv, av, nv] = Array.isArray(r) ? r : [r.c, r.sub, r.a, r.n];
      const amt = round2(parseFloat(av));
      if (!(amt > 0)) continue;
      const note = String(nv || "").trim();
      let c = findCat(cv) || findCat(legacyCat(String(cv ?? "").trim(), String(sv ?? "").trim(), note)), warn = "";
      if (!c) { c = findCat("other"); warn = `没有「${cv}」这个分类，先放进其他`; }
      lines.push({ cat: c.id, sub: "", amt, note, warn });
    }
    if (!lines.length) continue;
    const total = round2(lines.reduce((a, x) => a + x.amt, 0));
    const rc = (shop + "|" + date + "|" + total).toLowerCase();
    const dup = L().E.some(x => x.meta?.rc === rc);
    recs.push({ date, shop, src, lines, total, rc, dup });
  }
  return recs;
}
let RC = [];
function rcPreview() {
  if (!RC.length) return `<div class="hint">把 Claude 给的导入码整段粘到上面，这里会先列出来给你看。</div>`;
  const all = round2(RC.reduce((a, r) => a + r.total, 0));
  return RC.map(r => `<div class="rc">
      <div class="rch"><b>${esc(r.shop || "小票")}</b><span class="dim">${dayLabel(r.date)}${r.src === "cash" ? " · 现金" : ""}</span><b class="num">£${f2(r.total)}</b></div>
      ${r.dup ? `<div class="rcw">这张好像已经记过了（同一家店、同一天、同样的总额），确定要再记一次吗？</div>` : ""}
      ${r.lines.map(x => `<div class="rcl"><span>${esc(nameOf(x.cat))}${x.note ? `<small>${esc(x.note)}</small>` : ""}${x.warn ? `<small class="bad">${esc(x.warn)}</small>` : ""}</span><span class="num">£${f2(x.amt)}</span></div>`).join("")}
    </div>`).join("") + (RC.length > 1 ? `<div class="rcsum">${RC.length} 张一共 <b class="num">£${f2(all)}</b></div>` : "");
}
function openReceipt() {
  RC = [];
  modal(`<form class="rcf" data-form="rc" autocomplete="off"><div class="mhead"><p class="mt">粘贴小票</p><button type="button" class="x" data-close aria-label="关掉">×</button></div>
    <textarea class="mono" name="t" rows="4" placeholder="把 Claude 给的导入码粘到这里"></textarea>
    <div id="rcprev" class="mtop">${rcPreview()}</div>
    <div class="two mtop"><button type="button" class="btn" data-act="openadd">手动记</button><button class="go" type="submit" disabled>记进账本</button></div></form>`,
    box => {
      const ta = box.querySelector("textarea"), go = box.querySelector("button[type=submit]");
      ta.addEventListener("input", () => {
        RC = parseReceipts(ta.value);
        box.querySelector("#rcprev").innerHTML = ta.value.trim() && !RC.length ? `<div class="rcw">没认出来，确认一下是不是整段都粘进来了。</div>` : rcPreview();
        go.disabled = !RC.length;
        go.textContent = RC.length ? `记进账本（${RC.reduce((a, r) => a + r.lines.length, 0)} 笔）` : "记进账本";
      });
    });
}
actions.openrc = () => openReceipt();
export function submitReceipt() {
  if (!RC.length) return;
  const snap = snapshot();
  let n = 0, sum = 0;
  for (const r of RC) for (const x of r.lines) {
    addEntry({ date: r.date, amount: x.amt, cat: x.cat, sub: x.sub, src: r.src, note: [r.shop, x.note].filter(Boolean).join(" · "), meta: { rc: r.rc } });
    n++; sum += x.amt;
  }
  RC = [];
  $("#modal [data-close]")?.click();
  ui.rerender();
  toast(`记下了 ${n} 笔，共 £${f2(sum)}`, () => restoreSnap(snap));
}

/* ---------- Claude 直接记：Claude 把识别好的账推到 inbox.json，网站打开时自动记进来（每批只记一次） */
let inboxBusy = false;
export async function applyInbox() {
  if (store.mode !== "cloud" || inboxBusy) return;
  inboxBusy = true;
  try { await applyInboxOnce(); } finally { inboxBusy = false; }
}
async function applyInboxOnce() {
  let box;
  try { const r = await fetch(new URL("inbox.json", import.meta.url), { cache: "no-cache" }); if (!r.ok) return; box = await r.json(); } catch (e) { return; }
  const S = L().S; S.inbox = S.inbox || [];
  // minV：这一批要用到新功能时写上，浏览器还在用旧缓存代码就先不记，等刷新到新代码再记
  const todo = (box.batches || []).filter(b => b.id && !S.inbox.includes(b.id) && !(+b.minV > INBOX_V));
  if (!todo.length) return;
  const snap = snapshot();
  let n = 0, sum = 0, paid = [], skipped = 0, inv = 0, regen = false, dropped = [];
  for (const b of todo) {
    // redo：先删掉这几张记过的小票（店|日期|总额），下面按新的分类重记
    for (const rc of b.redo || []) for (const x of L().E.filter(z => z.meta?.rc === String(rc).toLowerCase())) removeEntry(x.id, true);
    // 同一张小票（同店、同天、同总额）已经记过的就跳过，不管之前是粘贴的还是手记的
    for (const r of normReceipts(b.receipts || [])) { if (r.dup) { skipped++; continue; } for (const x of r.lines) {
      addEntry({ date: r.date, amount: x.amt, cat: x.cat, sub: x.sub, src: r.src, note: [r.shop, x.note].filter(Boolean).join(" · "), meta: { rc: r.rc, ib: b.id } });
      n++; sum += x.amt;
    } }
    // 买回来的东西记进家里的库存；囤货类标「家里还有」
    if (b.inv?.length) { (b.invSet ? setInv : addInv)(b.inv, b.invFrom || today()); inv += b.inv.length; }
    if (b.have?.length) { const P = store.docs.shop.pantry = store.docs.shop.pantry || {}; for (const n of b.have) P[n] = 1; saveDoc("shop"); }
    for (const nm of b.pay || []) {
      const o = S.ones.find(z => !z.paid && z.n.toLowerCase().includes(String(nm).toLowerCase()));
      if (!o) continue;
      const x = addEntry({ date: b.payDate || today(), amount: +o.a || 0, cat: "__one", note: o.n });
      o.paid = true; o.xid = x.id; paid.push(o.n);
    }
    // del：删掉记错的某一笔 [{d, a, n}]（日期、金额对上，备注包含 n）
    for (const o of b.del || []) for (const x of L().E.filter(z => z.date === o.d && Math.abs((+z.amount || 0) - (+o.a || 0)) < 0.005 && (z.note || "").includes(o.n))) removeEntry(x.id, true);
    // ones：已经付了的一次性大额 [{d, a, n, spread: {start, months, plan}}]
    for (const o of b.ones || []) {
      const x = addEntry({ date: o.d, amount: +o.a || 0, cat: "__one", note: o.n, meta: { ib: b.id } });
      if (o.spread) { x.spread = { start: o.d.slice(0, 7), ...o.spread }; save(); }
      n++; sum += +o.a || 0;
    }
    // drop：不用付了的待付大额（名字包含即可），直接删掉
    for (const nm of b.drop || []) { const i = S.ones.findIndex(z => !z.paid && z.n.includes(nm)); if (i >= 0) dropped.push(S.ones.splice(i, 1)[0].n); }
    // goal：用储蓄罐（比如冰岛）的钱付的，不占每月预算 [{d, a, n, g}]；罐里不够的那部分算从手上的钱出
    for (const o of b.goal || []) {
      const g = S.goals.find(z => z.n.includes(o.g)), a = round2(+o.a || 0); if (!g || !(a > 0)) continue;
      const pot = round2(Math.min(a, Math.max(0, +g.s || 0))), hand = round2(a - pot);
      if (pot > 0) { g.s = round2((+g.s || 0) - pot); addEntry({ date: o.d, amount: pot, cat: g.id, note: o.n, meta: { ib: b.id } }); }
      if (hand > 0) addEntry({ date: o.d, amount: hand, cat: g.id, note: o.n, meta: { ib: b.id, hand: true } });
      n++; sum += a;
    }
    // set：直接把某天某一格换成指定的菜 [{d, k, r, lock}]；也可以是 {d, k, custom:{name,kcal,p,c,f}} 或 {d, k, from: 抄哪天的同一格}
    for (const x of b.set || []) {
      const day = week(mondayOf(x.d), true).days[(parse(x.d).getDay() + 6) % 7];
      if (x.custom) day[x.k] = { custom: { kind: "custom", ...x.custom }, rice: 0, lock: true };
      else if (x.from) {
        const src = week(mondayOf(x.from))?.days[(parse(x.from).getDay() + 6) % 7]?.[x.k]; if (!src) continue;
        const c = JSON.parse(JSON.stringify(src)); if (c.custom) delete c.custom.paid; day[x.k] = { ...c, lock: true };
      } else {
        const r = store.byId[x.r]; if (!r) continue;
        day[x.k] = entryFor(r, x.k, x.lock ? { lock: true } : {});
        if (x.rice != null) day[x.k].rice = x.rice;
        if (x.bread != null) { if (x.bread) day[x.k].bread = x.bread; else delete day[x.k].bread; }
      }
      saveDoc("menu"); regen = true;
    }
    // regen：库存更新后，从这天起没锁的格子按家里有的东西重排
    if (b.regen) { generate(mondayOf(b.regen), b.regen); regen = true; }
    S.inbox.push(b.id);
  }
  save(); ui.rerender();
  const dr = dropped.length ? `「${dropped.join("、")}」不用付了，删掉了` : "";
  if (!n && !paid.length) { if (dr) toast(dr, () => restoreSnap(snap)); else if (inv || regen) toast(`家里的库存更新了 ${inv} 样${regen ? "，菜单按库存重排了" : ""}`); return; }
  toast(`Claude 帮你记了 ${n} 笔 £${f2(sum)}${skipped ? `（${skipped} 张已经记过，跳过了）` : ""}${paid.length ? "，" + paid.join("、") + " 标成已付" : ""}${dr ? "；" + dr : ""}`, () => restoreSnap(snap));
}

/* ---------- 储蓄罐：每个月底把没花完的存进去 ---------- */
function monthShift(m, n) { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
const mLabel = m => `${+m.slice(0, 4)} 年 ${+m.slice(5)} 月`;
const fmtDate = s => `${+s.slice(0, 4)} 年 ${+s.slice(5, 7)} 月 ${+s.slice(8)} 日`;
const lastDay = m => { const [y, mo] = m.split("-").map(Number); return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`; };
const goalPaid = g => L().E.filter(x => x.cat === g.id).reduce((a, x) => a + (+x.amount || 0), 0);
function mainGoal() { const G = L().S.goals; return G.find(g => !g.open && (+g.s || 0) + goalPaid(g) < (+g.t || 0)) || G.find(g => g.open) || G[0] || null; }
function savedLog() { const S = L().S; S.saved = S.saved || {}; return S.saved; }

function banner(text, btns) { return `<div class="banner"><span>${text}</span>${btns ? `<span class="acts">${btns}</span>` : ""}</div>`; }
export function monthEndBanner() {
  const t = today(), d = +t.slice(8), g = mainGoal(); if (!g) return "";
  if (d <= 7) {
    const m = monthShift(t.slice(0, 7), -1), st = L().S.start;
    if (!st || m >= st.slice(0, 7)) {
      const left = Math.max(0, calc(m).left), log = savedLog()[m];
      if (!log && left >= 1) return banner(`${+m.slice(5)} 月省下了 <b class="num">£${f2(left)}</b>。去 Monzo 把这些钱转进储蓄罐，转完点一下。`,
        `<button class="go sm" data-act="monthsave" data-m="${m}" data-v="${left.toFixed(2)}">已经转了</button><button class="btn" data-act="monthskip" data-m="${m}">这次不存</button>`);
    }
  }
  const c = calc();
  if (d >= c.dim - 2 && c.left > 0) return banner(`快到月底了，这个月照现在能省下 <b class="num">£${f2(c.left)}</b>，下个月 1 号提醒你存进储蓄罐。`, "");
  return "";
}
actions.monthsave = el => {
  const m = el.dataset.m, v = +el.dataset.v, g = mainGoal(); if (!g || !(v > 0)) return;
  g.s = round2((+g.s || 0) + v);
  const x = addEntry({ date: lastDay(m), amount: v, cat: "__save", note: `${+m.slice(5)} 月省下的`, meta: { goal: g.id, month: m } });
  savedLog()[m] = { amt: v, eid: x.id }; save(); ui.rerender(); toast(`存进「${g.n}」£${f2(v)}`);
};
actions.monthskip = el => { savedLog()[el.dataset.m] = { skip: true }; save(); ui.rerender(); };

export function potHtml(compact) {
  const S = L().S, c = calc(), log = savedLog();
  const hist = Object.entries(log).filter(([, v]) => v.amt).sort().slice(-6);
  let h = "";
  for (const g of S.goals) {
    const t = +g.t || 0, s = +g.s || 0, paid = round2(L().E.filter(x => x.cat === g.id).reduce((a, x) => a + (+x.amount || 0), 0)), full = t > 0 && s + paid >= t;
    if (g.open && s <= 0) continue;
    const pr = t > 0 ? Math.min(100, (s + paid) / t * 100) : 0, need = Math.max(0, round2(t - s - paid));
    let plan = "";
    if (!g.open && !full && g.due) {
      // 出发前还有几次月底存钱：从这个月底到出发前一个月底
      const now = parse(today()), due = parse(g.due);
      const n = Math.max(0, (due.getFullYear() - now.getFullYear()) * 12 + due.getMonth() - now.getMonth());
      plan = n ? `<div class="plan"><div class="hint">出发前还有 <b>${n}</b> 次月底存钱。每月省下多少，对应找妈妈要多少：</div>
        <div class="plangrid">${[0, 30, 50, 80].map(v => `<div><span>每月省 £${v}</span><b class="num">£${Math.round(Math.max(0, need - v * n)).toLocaleString("en-GB")}</b></div>`).join("")}</div></div>` : "";
    }
    h += `<div class="goal">
      <div class="t"><span class="nm">${esc(g.n)}</span><span class="v num"><b>£${f2(s)}</b>${t > 0 ? ` / ${f2(t)}` : ""}</span></div>
      ${paid > 0 ? `<p class="hint">已经付掉 <b class="num">£${f2(paid)}</b>（算在目标里）</p>` : ""}
      ${t > 0 ? `<div class="pb pur"><i style="width:${pr.toFixed(0)}%"></i></div>` : ""}
      ${g.open ? `<p class="hint">不设上限，冰岛存满以后多出来的放这里。</p>` : full ? `<p class="note ok">✓ 存够了</p>` : `<p class="hint">还差 <b class="num">£${f2(need)}</b></p>${compact ? "" : plan}`}
      ${compact ? "" : `<div class="acts mtop"><button class="btn" data-act="saveto" data-id="${g.id}">手动存一笔</button>
        ${s > 0 ? `<button class="btn" data-act="payfrom" data-id="${g.id}">用这里的钱付</button><button class="btn" data-act="take" data-id="${g.id}">取出来</button>` : ""}</div>`}
    </div>`;
  }
  return `<div class="pothead"><span>Monzo 储蓄罐 · 共 <b class="num">£${f2(c.pot)}</b></span></div>${h}
    ${compact ? "" : `<div class="hint mtop">${hist.length ? "存过的：" + hist.map(([m, v]) => `${+m.slice(5)} 月 +£${f2(v.amt)}`).join(" · ") : "每个月没花完的预算，下个月 1 号会提醒你转进储蓄罐。花超了的月份就不存，不用勉强。"}</div>`}`;
}
function askMoney(title, def, cb) {
  modal(`<form><p class="mt">${esc(title)}</p><input name="v" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" class="num big" value="${def || ""}">
    <div class="two mtop"><button type="button" class="btn" data-close>取消</button><button class="go" type="submit">确定</button></div></form>`,
    (box, close) => { box.querySelector("form").onsubmit = e => { e.preventDefault(); const v = parseFloat(e.target.v.value); close(); if (v > 0) cb(v); }; });
}
actions.saveto = el => {
  const g = goalOf(el.dataset.id); if (!g) return;
  askMoney(`手动存多少进「${g.n}」？（先在 Monzo 里转进 pot）`, "", v => {
    const c = calc(); if (v > c.remain) { toast(`手上只有 £${f2(c.remain)}`); return; }
    g.s = round2((+g.s || 0) + v);
    addEntry({ amount: v, cat: "__save", note: "存进 " + g.n, meta: { goal: g.id } });
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
// 花钱速度：按日子今天该花到预算的几成
function pace(c) { return c.cur ? Math.max(0, c.dn - c.st + 1) / (c.dim - c.st + 1) : 1; }
function status(spent, budget, p) {
  if (!(budget > 0)) return "";
  if (spent > budget + 0.004) return "bad";
  if (p < 1 && spent > budget * p * 1.15 + 1) return "warn";
  return "";
}

// 首页和记账页共用：今天还能花多少
export function heroCard(c) {
  const st = status(c.cSpent, c.cAlloc, pace(c));
  const perDay = c.left > 0 ? c.left / Math.max(1, c.dl) : 0;
  const rw = c.cur ? runway() : null;
  return `<div class="hero2">
    <div class="lab">${c.cur ? "今天起每天还能花" : mLabel(c.m)}</div>
    ${c.cur ? `<div class="amt num ${c.left < 0 ? "neg" : ""}">${c.left < 0 ? "超了" : "£" + f2(perDay)}<small>${c.left < 0 ? "" : " / 天"}</small></div>
      <div class="sub">这个月还剩 <b class="num ${c.left < 0 ? "up" : ""}">${money(c.left)}</b>，还有 ${c.dl} 天 ${st ? `<span class="pill ${st}">${st === "bad" ? "超预算了" : "花得偏快"}</span>` : `<span class="pill">节奏正常</span>`}</div>`
    : `<div class="amt num ${c.left < 0 ? "neg" : ""}">${c.left < 0 ? "超了 " + money(-c.left) : "省下 " + money(c.left)}</div>
      <div class="sub">预算 £${f2(c.alloc)} · 花了 £${f2(c.spent)}</div>`}
    ${rw ? `<div class="runway ${rw.short ? "bad" : ""}">${rw.short ? "手上的钱不够付完待付的大额了" : rw.date ? `按预算花，手上的钱够用到 <b>${fmtDate(rw.date)}</b>` : "按预算花，钱够用很久"}</div>` : ""}
  </div>`;
}
// 这个月的预算一根条：已花多少、还能花多少，竖线是按日子今天该花到哪
function monthBar(c) {
  // 月初就算进去的（囤货池、大额分摊）不按日子摊，竖线只量日常花销
  const a = c.alloc, sp = c.spent, p = pace(c), should = c.upfront + c.allocDaily * p;
  const pct = a > 0 ? Math.min(100, sp / a * 100) : 0, st = status(c.cSpent, c.cAlloc, p);
  return `<div class="mbar ${st}">
    <div class="mbar-h"><span>这个月预算 <b class="num">£${f2(a)}</b></span></div>
    <div class="mbar-t"><i style="width:${pct.toFixed(1)}%"></i>${c.cur && a > 0 ? `<b style="left:${Math.min(100, should / a * 100).toFixed(1)}%"></b>` : ""}</div>
    <div class="mbar-l"><span>已花 <b class="num">£${f2(sp)}</b></span><span>${c.left < 0 ? `超了 <b class="num up">£${f2(-c.left)}</b>` : `还能花 <b class="num">£${f2(c.left)}</b>`}</span></div>
    ${c.cur ? `<div class="hint">竖线是到今天该花到的 £${f2(should)}：月初先算进去的囤货池和大额分摊 £${f2(c.upfront)}，加上日常花销按日子摊到今天的部分。${st ? "零食、交通、其他花得偏快，这几天收着点。" : sp > should ? "超出来的主要是吃饭，该买照买。" : "花得不快。"}</div>` : ""}
  </div>`;
}
function bar(name, spent, budget, p, fixed, act, soft) {
  const stt = fixed || soft ? "" : status(spent, budget, p), pct = budget > 0 ? Math.min(100, spent / budget * 100) : 0;
  const left = budget - spent;
  const right = !(budget > 0) ? `花了 <b>£${f2(spent)}</b>` : fixed ? (spent >= budget - 0.004 ? `<b>已交 ✓</b>` : `还没交 <b>£${f2(budget)}</b>`)
    : left < -0.004 ? `超了 <b>£${f2(-left)}</b>` : `还剩 <b>£${f2(left)}</b><small> / ${f2(budget)}</small>`;
  return `<button class="cb ${stt}" ${act}><span class="nm">${esc(name)}</span>
    <span class="trk">${budget > 0 ? `<i style="width:${pct.toFixed(1)}%"></i>${!fixed && p < 1 ? `<b style="left:${(p * 100).toFixed(1)}%"></b>` : ""}` : ""}</span>
    <span class="r num">${right}</span></button>`;
}
function catList(c) {
  const p = pace(c); let h = "";
  for (const k of L().S.cats) {
    const a = catBudget(k, c.m), sp = c.byC[k.id] || 0;
    if (!(a > 0) && sp <= 0) continue;
    h += bar(k.n, sp, a, p, k.fixed, `data-act="jfilter" data-id="${k.id}"`, k.id === "food");
    if (k.id === "snack") {
      const xs = L().E.filter(x => x.cat === "snack" && x.date.slice(0, 7) === c.m);
      if (xs.length) h += `<div class="subnote">买了 ${xs.length} 次：${xs.slice(0, 8).map(x => esc(x.note.replace(/^[^·]*·\s*/, "") || "零食")).join("、")}${xs.length > 8 ? " …" : ""}</div>`;
    }
  }
  // 一次性的（锅、公交卡、生日请客这种）不占每月预算，但列出来，免得找不到
  // 大额分摊：这个月摊到的每一份
  if (c.shares.length) {
    h += `<div class="amort"><div class="amh"><span>大额分摊</span><span class="num">这个月 <b>£${f2(c.amort)}</b></span></div>${c.shares.map(s2 => `<div class="amr ${s2.plan ? "" : "unplan"}"><span>${esc((s2.x.note || "大额").replace(/^[A-Za-z][^·]*·\s*/, ""))}<small>£${f2(s2.x.amount)} 分 ${s2.n} 个月，第 ${s2.k} 个月${s2.plan ? "" : s2.cat === "social" ? " · 算进人情" : " · 计划外"}</small></span><span class="num">£${f2(s2.share)}</span></div>`).join("")}
      <div class="hint">固定开销（健身房、公交卡）每月这一份已经算进预算；计划外的（请客、送礼）这一份算进当月「人情」里。</div></div>`;
  }
  const P = poolOf();
  if (P && c.m >= P.start) {
    const left = poolLeft(c.m);
    h += `<button class="cb" data-act="jfilter" data-id="__stock"><span class="nm">囤货池</span><span class="hint">每月存 £${f2(P.a)}${c.stock > 0 ? `，这个月买了 £${f2(c.stock)}` : ""}</span><span class="r num">${left >= 0 ? `还剩 <b>£${f2(left)}</b>` : `先垫了 <b>£${f2(-left)}</b>`}</span></button>`;
    if (left < 0) h += `<div class="subnote">这个月囤货买得多，池子先垫上，后面几个月每月的 £${f2(P.a)} 会慢慢补回来，不算超支。</div>`;
  } else if (c.stock > 0) h += `<button class="cb" data-act="jfilter" data-id="__stock"><span class="nm">开荒囤货</span><span class="hint">刚回来补的，不占预算</span><span class="r num">花了 <b>£${f2(c.stock)}</b></span></button>`;
  return h + `<div class="hint">吃饭超了只提醒不标红，该买照买；零食、交通、其他花快了才变色。</div><div class="hint legend"><span class="lg"><i></i>竖线 = 按日子今天该花到哪</span><span class="lg warn"><i></i>花得偏快</span><span class="lg bad"><i></i>超预算</span></div>`;
}
// 手上的钱分成几块
function overviewHtml(c) {
  const hand = Math.max(0, c.remain), left = Math.max(0, Math.min(c.left, hand)), up = Math.min(unpaidTotal(), hand - left);
  const future = Math.max(0, hand - left - up), total = hand + c.pot || 1;
  const seg = (v, cls, label) => v > 0 ? `<div class="${cls}" style="flex:${v}" title="${label} £${f2(v)}">${v / total > .12 ? label.split(" ")[0] : ""}</div>` : "";
  return `<div class="ovtop"><span>手上 <b class="num">£${f2(hand)}</b></span>${c.pot > 0 ? `<span>储蓄罐 <b class="num">£${f2(c.pot)}</b></span>` : ""}</div>
    <div class="stack">${seg(left, "s1", "这个月")}${seg(up, "s2", "待付")}${seg(future, "s3", "以后的生活费")}${seg(c.pot, "s4", "储蓄罐")}</div>
    <div class="leg">
      <span><i class="s1"></i>这个月还能花 <b class="num">£${f2(left)}</b></span>
      ${up > 0 ? `<span><i class="s2"></i>还没付的大额 <b class="num">£${f2(up)}</b></span>` : ""}
      <span><i class="s3"></i>以后几个月的生活费 <b class="num">£${f2(future)}</b></span>
      ${c.pot > 0 ? `<span><i class="s4"></i>储蓄罐 <b class="num">£${f2(c.pot)}</b></span>` : ""}
    </div>`;
}
function journal(list) {
  if (!list.length) return `<div class="empty">这里还没有账。点右下角的 + 记一笔。</div>`;
  const days = []; let cur = null;
  for (const x of list) { if (!cur || cur.d !== x.date) { cur = { d: x.date, items: [], sum: 0 }; days.push(cur); } cur.items.push(x); if (isSpend(x) && !goalOf(x.cat)) cur.sum += +x.amount || 0; }
  return days.map(g => `<div class="day"><span>${dayLabel(g.d)}</span><span class="num">${g.sum > 0 ? "£" + f2(g.sum) : ""}</span></div>
    <div class="list">${g.items.map(y => {
      const cat = nameOf(y.cat);
      const title = esc(y.note || cat);
      const tag = [y.note ? cat : "", y.src === "cash" ? "现金" : ""].filter(Boolean).join(" · ");
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
  if (jFilter) { list = list.filter(x => x.cat === jFilter); fname = nameOf(jFilter); }
  const up = unpaidTotal(), first = L().S.start && c.m === L().S.start.slice(0, 7) && c.st > 1;
  const canNext = monthShift(viewMonth, 1) <= today().slice(0, 7);
  el.innerHTML = `<div class="pagehead"><h1>记账</h1>
    <div class="mnav"><button class="ghost" data-act="mprev" aria-label="上个月">‹</button><b>${mLabel(viewMonth)}</b><button class="ghost" data-act="mnext" aria-label="下个月" ${canNext ? "" : "disabled"}>›</button></div>
    <div class="acts"><button class="btn" data-act="settings">预算和备份</button></div></div>
  ${c.cur ? monthEndBanner() : ""}
  <section class="card herowide">${heroCard(c)}${monthBar(c)}</section>
  ${first ? `<p class="hint mtop">${+c.m.slice(5)} 月从 ${c.st} 号开始记账，预算按剩下 ${c.dim - c.st + 1} 天折算成 £${f2(c.alloc)}；下个月起是完整的 £${f2(monthlyBudget())}。</p>` : ""}
  <div class="cols2">
    <div>
      <h2>每一类还剩多少<span>点一下只看这一类的账</span></h2>
      <section class="card cats">${catList(c)}</section>
      <h2>${viewMonth === today().slice(0, 7) ? "这个月" : +viewMonth.slice(5) + " 月"}的账${fname ? `<span>只看「${esc(fname)}」 <button class="linkbtn" data-act="jfilter" data-id="">看全部</button></span>` : `<span>${list.filter(x => isSpend(x) && !goalOf(x.cat)).length} 笔</span>`}</h2>
      ${journal(list)}
    </div>
    <div>
      ${c.cur ? `<h2>手上的钱都在哪</h2><section class="card">${overviewHtml(c)}</section>` : ""}
      <h2>储蓄罐</h2>
      <section class="card">${potHtml(false)}</section>
      <h2>待付的大额<span>${up > 0 ? "还要付 £" + f2(up) : "都付了"}</span></h2>
      <section class="card list flush">${onesHtml()}</section>
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
  if (!o.paid) { const x = addEntry({ amount: +o.a || 0, cat: "__one", note: o.n }); if (o.spread) x.spread = { start: x.date.slice(0, 7), ...o.spread }; o.paid = true; o.xid = x.id; toast("已付 £" + f2(o.a)); }
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
  for (const c of S.cats) cats += row("ec", c.id, c.n, c.a, false, "");
  if (S.pool) cats += row("ep", "pool", "囤货池（每月存）", S.pool.a, false, "");
  return `<div class="pagehead"><h1>预算和备份</h1><div class="acts"><button class="btn" data-act="setback">← 回到记账</button></div></div>
  <div class="cols2">
    <div>
      <h2 class="h2top">开始记账时的余额</h2>
      <section class="card"><div class="two nomt"><label>卡 £<input id="sCard" type="number" step="0.01" value="${+S.card || 0}"></label><label>现金 £<input id="sCash" type="number" step="0.01" value="${+S.cash || 0}"></label></div></section>
      <h2>每月预算<span>0 表示只记不设预算 · 每月合计 £${f2(monthlyBudget())}</span></h2>
      <section class="card list flush">${cats}</section>
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
  $$("[data-ep]").forEach(i => { if (S.pool) S.pool.a = parseFloat(i.value) || 0; });
  $$("[data-eg]").forEach(i => { const g = goalOf(i.dataset.eg); if (g) g.t = parseFloat(i.value) || 0; });
  $$("[data-eo]").forEach(i => { const o = S.ones.find(z => z.id === i.dataset.eo); if (o) o.a = parseFloat(i.value) || 0; });
  save(); ui.rerender(); toast("保存好了");
};
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
