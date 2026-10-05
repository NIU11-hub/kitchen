// 菜单：营养计算、按周存、随机生成、菜单页
import { store, saveDoc } from "./store.js";
import { DAY, SLOTS, SLOT_BY_NAME, DAYS, CATS, RICE, BREAD, BF, SPECIAL, shopName } from "./data.js";
import { $, esc, r0, f2, money, today, addDays, mondayOf, dow, fmtMD, toast, modal } from "./util.js";
import { actions, changes, ui } from "./ui.js";
import { addEntry, removeEntry } from "./ledger.js";
import { boughtFor, invLeft, invName, keepOf } from "./shop.js";

export const M = () => store.docs.menu;
const save = () => saveDoc("menu");
const ZERO = { kcal: 0, p: 0, c: 0, f: 0 };
const add = (a, b) => ({ kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f });

export function perServing(r) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 }, b = r.base || 1;
  for (const i of r.ing || []) { const k = (i.g || 0) / 100 / b; t.kcal += (i.kcal || 0) * k; t.p += (i.p || 0) * k; t.c += (i.c || 0) * k; t.f += (i.f || 0) * k; }
  return t;
}
function riceN(g) { const k = g / 100; return { kcal: RICE.kcal * k, p: RICE.p * k, c: RICE.c * k, f: RICE.f * k }; }
function breadN(g) { const k = g / 100; return { kcal: BREAD.kcal * k, p: BREAD.p * k, c: BREAD.c * k, f: BREAD.f * k }; }
export function entryN(e) {
  if (!e) return ZERO;
  if (e.custom) { const c = e.custom; return { kcal: +c.kcal || 0, p: +c.p || 0, c: +c.c || 0, f: +c.f || 0 }; }
  let n = store.byId[e.r] ? perServing(store.byId[e.r]) : ZERO;
  if (e.rice) n = add(n, riceN(e.rice));
  if (e.bread) n = add(n, breadN(e.bread));
  return n;
}
export const dayN = d => SLOTS.reduce((a, s) => add(a, entryN(d?.[s.k])), ZERO);

// 课表更新（只跑一次）：2026-09-29 周二加了会计研究项目讲座
export function migrateMenu() {
  const m = M(); if (!m || (m.cv || 0) >= 2) return;
  m.classes = m.classes || [[], [], [], [], [], [], []];
  m.dayNotes = m.dayNotes || ["", "", "", "", "", "", ""];
  m.classes[1] = ["13:00–15:00 会计研究项目讲座"];
  m.dayNotes[1] = "13–15 点有课，午饭课前吃；16–17 点训练";
  m.cv = 2; save();
}
// 2026-09-29 刚从中国回来：这周周二不排，周三到周六练减载（计划 W4），周日休
export function migrateWeek() {
  const m = M(), key = "2026-09-28"; if (!m || (m.cv || 0) >= 3) return;
  m.cv = 3;
  if (thisWeek() !== key) { save(); return; }
  const w = week(key, true);
  w.train = [2, 3, 4, 5]; w.off = [1];
  w.notes = {
    1: "刚从中国回来，今天不排，午饭 Meal Deal",
    2: "减载 · 上肢推，16–17 点。卧推 65 做 2 组 5 次；潘德雷划船 2×6；面拉 + 窄握下压 2×15 / 2×12；单手过头农夫 1 组 20 米/侧",
    3: "减载 · 下肢膝，18:00 下课后。深蹲 85 做 2 组 5 次；保加利亚单腿蹲 2×8/侧；腿弯举 2×12；农夫行走 1 组 30 米。跳箱下落这周不做。晚饭 19:30 以后吃提前备好的",
    4: "减载 · 上肢拉，16–17 点。上斜哑铃卧推 2×8；宽握下拉 2×10；侧平举 + 佐特曼弯举 2×15 / 2×12；土耳其起立 2×3/侧",
    5: "减载 · 下肢髋。罗马尼亚硬拉 70 做 2 组 8 次；单腿 RDL 2×8/侧；提踵 + 帕洛夫 2×15 / 2×12；哥萨克蹲 2×6/侧",
    6: "完全休息，这周不做有氧",
  };
  for (const k of Object.keys(w.days[1])) if (!w.days[1][k]?.custom) delete w.days[1][k];
  generate(key);
}

/* ---------- 按周存 ---------- */
export const thisWeek = () => mondayOf(today());
export function week(key, create) {
  const m = M(); m.weeks = m.weeks || {};
  if (!m.weeks[key] && create) m.weeks[key] = { days: Array.from({ length: 7 }, () => ({})) };
  return m.weeks[key] || null;
}
// 某一周的训练日、不排菜的日子、当天备注：这周单独设过就用这周的
export const trainOf = key => week(key)?.train || M().train || [0, 1, 3, 4];
export const offOf = (key, di) => !!week(key)?.off?.includes(di);
export const noteOf = (key, di) => week(key)?.notes?.[di] ?? M().dayNotes?.[di] ?? "";
export function dayKindOf(key, di) {
  if (offOf(key, di)) return "不排";
  if (trainOf(key).includes(di)) return "训练";
  return !week(key)?.train && di === 5 ? "有氧" : "休息";
}
export function todayEntry() { const w = week(thisWeek()); return w ? w.days[dow(today())] : {}; }
function pruneWeeks() {
  const m = M(); const keep = addDays(thisWeek(), -7 * 8);
  for (const k of Object.keys(m.weeks || {})) if (k < keep) delete m.weeks[k];
}

/* ---------- 随机生成 ---------- */
const hasRice = r => (r.ing || []).some(i => /米饭/.test(i.n));
const MAIN = r => !["配菜", "加餐", "甜品", "早餐"].includes(r.cat) && r.slot !== "早餐";
const quick = r => (r.diff === "简单" && (+r.mins || 0) <= 30);
// 轮换：越久没吃的越优先，从来没排过的排最前。
// 在最该轮到的前三分之一里随机挑一道，所以每周组合不一样，但池子里每道菜迟早都会轮到。
let LAST = {};
// 家里还剩的东西（生成菜单时用）：名字 -> 克。排进一道菜就扣掉这道菜要用的
let STOCK = null;
const stockKey = i => { const sn = shopName(i.n); return sn ? { k: invName(sn.n), f: sn.f } : null; };
function stockInit(from) {
  STOCK = {};
  for (const n of Object.keys(store.docs.shop?.inv || {})) { const g = invLeft(n, from); if (g > 0) STOCK[n] = g; }
}
// 用到家里现有东西越多越先排；放不久的（肉、菜、奶）算两分
function stockScore(r) {
  if (!STOCK) return 0;
  let sc = 0;
  for (const i of r.ing || []) {
    const x = stockKey(i); if (!x || !(STOCK[x.k] >= 30)) continue;
    const d = keepOf(x.k).days; sc += d && d <= 10 ? 2 : 1;
  }
  return sc;
}
function stockUse(r) {
  if (!STOCK || !r) return;
  for (const i of r.ing || []) { const x = stockKey(i); if (x && STOCK[x.k] > 0) STOCK[x.k] -= (i.g || 0) * x.f / (r.base || 1); }
}
function pickFrom(pool, used, lastWeek, limit = 3) {
  const ok = pool.filter(r => (used[r.id] || 0) < limit);
  if (!ok.length) return null;
  const rank = ok.map(r => ({ r, u: used[r.id] || 0, s: stockScore(r), t: LAST[r.id] || "", x: Math.random() }))
    .sort((p, q) => p.u - q.u || q.s - p.s || (p.t < q.t ? -1 : p.t > q.t ? 1 : 0) || p.x - q.x);
  // 有能用上家里东西的，就在用得最多的几道里挑；没有就在最该轮到的前三分之一里随机
  const best = rank[0];
  const top = best.s > 0 ? rank.filter(z => z.u === best.u && z.s >= best.s - 1).slice(0, 3) : rank.slice(0, Math.max(2, Math.ceil(rank.length / 3)));
  return top[Math.floor(Math.random() * top.length)].r;
}
// 每道菜最近一次排在哪天（生成这周时，这周还没过的几天不算）
function refreshLast(key) {
  const m = M(); m.last = m.last || {};
  for (const [wk, w] of Object.entries(m.weeks || {})) w.days.forEach((d, di) => {
    const date = addDays(wk, di);
    if (wk === key && date >= today()) return;
    for (const e of Object.values(d)) if (e?.r && !(m.last[e.r] >= date)) m.last[e.r] = date;
  });
  LAST = m.last;
}
// 早餐热量差得多（少 150 以上）就配恰巴塔补上，40g 一档；包子、卷饼这类面食早餐不配
const hasBread = r => (r.ing || []).some(i => /卷饼|塔饼|馒头|包子|面粉/.test(i.n));
export function breadFor(r, slotK) {
  if (slotK !== "b" || !r || hasBread(r)) return 0;
  const short = SLOT_BY_NAME["早餐"].t.kcal - perServing(r).kcal;
  if (short < 150) return 0;
  return Math.min(160, Math.round(short / (BREAD.kcal / 100) / 40) * 40);
}
export function entryFor(r, slotK, extra) {
  const e = { r: r.id, rice: riceFor(r, slotK), ...extra };
  const b = breadFor(r, slotK); if (b) e.bread = b;
  return e;
}
const rnd = a => a[Math.floor(Math.random() * a.length)];
// 排早餐：工作日英式早餐（焗豆版排相邻两天吃完一罐），牛油果沙拉相邻两天；周末三明治、北非蛋轮着来
// ok(di) 说哪几天可以动；锁住的、外面吃的、不排的日子不动
function planBreakfast(key, w, ok, used = {}, lastWeek = new Set()) {
  const R = id => store.byId[id];
  const free = di => { if (!ok(di) || offOf(key, di)) return false; const c = w.days[di].b; return !(c && (c.lock || c.custom)); };
  const put = (di, r) => { if (!r) return; w.days[di].b = entryFor(r, "b"); used[r.id] = (used[r.id] || 0) + 1; stockUse(r); };
  let wd = [0, 1, 2, 3, 4].filter(free);
  const adj = () => [[0, 1], [1, 2], [2, 3], [3, 4]].filter(p => p.every(d => wd.includes(d)));
  const pairR = BF.pair.map(R).filter(Boolean);
  // 牛油果沙拉：同一趟采购里的相邻两天（周一二、周三四）优先，牛油果放不住
  if (pairR.length) {
    const same = adj().filter(p => p[0] === 0 || p[0] === 2), any = adj();
    const p = same.length ? rnd(same) : any.length ? rnd(any) : null;
    if (p) { const r = rnd(pairR); p.forEach(d => put(d, r)); wd = wd.filter(d => !p.includes(d)); }
  }
  const bread = R(BF.bread), beans = R(BF.beans);
  if (bread || beans) {
    const bp = beans && adj().length ? rnd(adj()) : [];
    for (const di of wd) put(di, bp.includes(di) ? beans : bread || beans);
    wd = [];
  }
  // 周末，以及工作日英式早餐被删掉时的后备：按老规则从早餐里挑
  const wk = BF.weekend.map(R).filter(Boolean);
  const all = store.recipes.filter(r => r.slot === "早餐" && !/冷冻/.test(r.name) && perServing(r).kcal >= 350);
  for (const di of [...wd, 5, 6]) {
    if (!free(di)) continue;
    const pool = di >= 5 && wk.length ? wk : all.filter(r => (+r.mins || 0) <= 30 || r.batch);
    put(di, pickFrom(pool, used, lastWeek));
  }
}
function riceFor(r, slotK) {
  const s = SLOTS.find(z => z.k === slotK);
  if (!s.rice || hasRice(r) || r.cat === "面食") return 0;
  const need = (s.t.kcal - perServing(r).kcal) / 1.3;
  return Math.max(0, Math.min(350, Math.round(need / 50) * 50));
}
// from：从哪天开始排（默认今天），之前的日子不动
export function generate(key, from = today()) {
  refreshLast(key);
  stockInit(from > addDays(key, 6) ? addDays(key, 7) : from > key ? from : key);
  const w = week(key, true), m = M(), train = trainOf(key);
  // 冰箱只有一小格冷冻，要冻起来的备餐不自动排
  const all = store.recipes.filter(r => !/冷冻/.test(r.name));
  const prev = week(addDays(key, -7));
  const lastWeek = new Set(); prev?.days.forEach(d => Object.values(d).forEach(e => e?.r && lastWeek.add(e.r)));
  const used = {};
  w.days.forEach(d => Object.values(d).forEach(e => { if (e?.lock && e.r) used[e.r] = (used[e.r] || 0) + 1; }));
  const put = (di, k, r) => {
    const cur = w.days[di][k];
    if (cur && (cur.lock || cur.custom)) return false;
    if (!r) { delete w.days[di][k]; return true; }
    w.days[di][k] = entryFor(r, k);
    used[r.id] = (used[r.id] || 0) + 1;
    stockUse(r);
    return true;
  };
  // 已经过去的日子不动，只排今天和以后
  const past = di => addDays(key, di) < from;
  const free = (di, k) => { if (past(di) || offOf(key, di)) return false; const c = w.days[di][k]; return !(c && (c.lock || c.custom)); };

  const batchPool = all.filter(r => MAIN(r) && (r.cat === "平日备餐" || r.batch) && r.diff !== "费事");
  const trainDinner = all.filter(r => MAIN(r) && (quick(r) || r.cat === "平日备餐"));
  const midDinner = all.filter(r => MAIN(r) && r.diff !== "费事" && (+r.mins || 0) <= 60);
  const weekend = all.filter(r => MAIN(r));
  const weekendBig = weekend.filter(r => r.diff === "费事" || r.diff === "中等");
  const post = store.byId["post-workout"], postAlt = all.filter(r => r.slot === "练后" && r.id !== "post-workout"), beds = all.filter(r => r.slot === "睡前");
  let alt = 0;
  planBreakfast(key, w, di => !past(di), used, lastWeek);

  for (let di = 0; di < 7; di++) {
    // 练后平时就是蛋白奶，一周偶尔换一两次
    if (free(di, "s") && post) put(di, "s", postAlt.length && alt < 2 && Math.random() < 0.25 ? (alt++, postAlt[Math.floor(Math.random() * postAlt.length)]) : post);
    if (free(di, "n") && beds.length) put(di, "n", pickFrom(beds, used, new Set(), 4) || beds[0]);
  }
  // 工作日午餐：一次做两顿，周一二一样、周四五一样；周三单独一顿
  for (const pair of [[0, 1], [3, 4]]) {
    const slots = pair.filter(di => free(di, "l"));
    if (!slots.length) continue;
    const r = pickFrom(batchPool, used, lastWeek, 3 - (slots.length - 1));
    for (const di of slots) put(di, "l", r);
  }
  if (free(2, "l")) put(2, "l", pickFrom(batchPool, used, lastWeek));
  // 晚餐
  let bigDone = false;
  for (let di = 0; di < 7; di++) {
    if (!free(di, "d")) continue;
    let pool = train.includes(di) ? trainDinner : di === 2 ? midDinner : di >= 5 ? (bigDone ? weekend : weekendBig) : midDinner;
    // 同一天午晚不重复
    const lunch = w.days[di].l?.r;
    let r = pickFrom(pool.filter(x => x.id !== lunch), used, lastWeek);
    if (!r) r = pickFrom(pool, used, lastWeek, 9);
    if (di >= 5 && r && r.diff !== "简单") bigDone = true;
    put(di, "d", r);
  }
  // 周末午餐：简单的面食或家常菜
  for (const di of [5, 6]) if (free(di, "l")) put(di, "l", pickFrom(all.filter(r => MAIN(r) && r.diff !== "费事" && r.id !== w.days[di].d?.r), used, lastWeek));
  // 全天热量不够时，给午饭晚饭多配米饭补上（每顿最多 450g）
  for (let di = 0; di < 7; di++) {
    if (past(di)) continue;
    let short = DAY.kcal - dayN(w.days[di]).kcal;
    for (const k of ["d", "l"]) {
      const e = w.days[di][k], r = e && store.byId[e.r];
      if (!r || e.lock || hasRice(r) || r.cat === "面食") continue;
      while (short > 100 && (e.rice || 0) < 450) { e.rice = (e.rice || 0) + 50; short -= 65; }
    }
  }
  STOCK = null;
  pruneWeeks();
  save();
}

/* ---------- 今晚要做 ---------- */
// 某天某一格排的菜（不排的日子、外面吃的不算）
function entryAt(date, k) {
  const key = mondayOf(date), di = dow(date);
  if (offOf(key, di)) return null;
  const e = week(key)?.days[di]?.[k];
  return e?.r && !e.custom && store.byId[e.r] ? e : null;
}
// 某天要动手做的菜：早餐、晚餐、周末午饭当天做；工作日午饭前一晚做，连着几天同一道的只做一次
function cookOn(d) {
  const list = [];
  for (const k of ["b", "d"]) { const e = entryAt(d, k); if (e) list.push({ r: store.byId[e.r], k, eat: d }); }
  if (dow(d) >= 5) { const e = entryAt(d, "l"); if (e) list.push({ r: store.byId[e.r], k: "l", eat: d }); }
  const nx = addDays(d, 1), e = entryAt(nx, "l");
  if (dow(nx) <= 4 && e && !(dow(d) <= 4 && entryAt(d, "l")?.r === e.r)) {
    let n = 1; while (n < 3 && dow(addDays(nx, n)) <= 4 && entryAt(addDays(nx, n), "l")?.r === e.r) n++;
    list.push({ r: store.byId[e.r], k: "l", eat: nx, n, batch: true });
  }
  return list;
}
// 今晚要做的事：今晚做好的工作日午饭、明天要做的菜里要提前一晚腌/泡的、明早出门前要泡上的
export function tonightTodo(t = today()) {
  const tm = addDays(t, 1), seen = new Set(), uniq = x => !seen.has(x.k + x.r.id + x.eat) && seen.add(x.k + x.r.id + x.eat);
  const cook = cookOn(t).filter(x => x.batch && uniq(x));
  const next = cookOn(tm);
  const prep = next.filter(x => x.r.prep?.when === "前一晚" && uniq(x));
  const morning = next.filter(x => x.r.prep?.when === "当天早上" && uniq(x));
  return { cook, prep, morning };
}

/* ---------- 菜单页 ---------- */
// 周六周日打开菜单，默认看下周
let wkSel = dow(today()) >= 5 ? 1 : 0, daySel = dow(today()) >= 5 ? 0 : dow(today());
export function mealAdvice(n, d) {
  const out = [], dk = n.kcal - DAY.kcal;
  if (Math.abs(dk) <= 120) out.push(`<span class="ok">热量合适</span>，和 2900 差 ${r0(Math.abs(dk))} kcal。`);
  else if (dk > 0) out.push(`<span class="up">热量多了 ${r0(dk)} kcal</span>，把某一餐的米饭减 ${Math.round(dk / 1.3 / 50) * 50 || 50}g。`);
  else out.push(`<span class="up">热量少了 ${r0(-dk)} kcal</span>，某一餐多配 ${Math.round(-dk / 1.3 / 50) * 50 || 50}g 米饭。`);
  if (n.p < DAY.pLo) out.push(`<span class="up">蛋白少了 ${r0(DAY.pLo - n.p)}g</span>，睡前换成希腊酸奶 200g，或者多加 1 勺蛋白粉。`);
  else out.push(`<span class="ok">蛋白够了</span>。`);
  if (n.f > DAY.f * 1.2) out.push(`<span class="up">脂肪偏高</span>，其他餐的油少放点。`);
  if (Object.values(d || {}).some(e => e?.custom?.kind === "eatout")) out.push(`有聚餐：前面几顿照常吃别空着，聚餐时先吃肉和菜，第二天照计划吃就行。`);
  return out;
}
function bar(label, v, target, color, lo) {
  const pct = Math.min(v / target * 100, 100), over = v > target * 1.1;
  return `<div class="mrow"><div class="lab"><span>${label}</span><span><b>${r0(v)}</b> / ${lo ? lo + "–" : ""}${target}</span></div>
    <div class="track"><span style="width:${pct}%;background:${over ? "var(--warn)" : color}"></span></div></div>`;
}
export function recipeOptions(cur, slot) {
  const list = c => store.recipes.filter(r => r.cat === c);
  const sweet = slot === "甜品";
  const fit = sweet ? list("甜品") : slot ? store.recipes.filter(r => r.slot === slot) : [];
  const head = `${cur ? `<option value="__clear">✕ 清空这一格</option>` : `<option value="" selected disabled>${sweet ? "想吃哪个…" : "选一道…"}</option>`}
    ${fit.length ? `<optgroup label="${sweet ? "甜品" : "常作" + slot + "的"}">${fit.map(r => `<option value="${esc(r.id)}" ${r.id === cur ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</optgroup>` : ""}`;
  if (sweet) return head;
  return `${head}<optgroup label="特殊情况">${Object.entries(SPECIAL).map(([k, v]) => `<option value="__${k}" ${cur === "__" + k ? "selected" : ""}>${v.label}</option>`).join("")}</optgroup>` +
    CATS.map(c => list(c).length ? `<optgroup label="${c}">${list(c).map(r => `<option value="${esc(r.id)}" ${r.id === cur ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</optgroup>` : "").join("");
}
export function specialBox(key, di, k, cu, compact) {
  const sp = SPECIAL[cu.kind]; if (!sp) return "";
  const date = addDays(key, di);
  const paid = cu.paid ? `<span class="paid">已记 ${money(cu.paid.amt)} <button class="linkbtn" data-act="unpay" data-w="${key}" data-d="${di}" data-k="${k}">撤销</button></span>` : "";
  const payBtn = cu.paid ? paid : cu.kind === "mealdeal"
    ? `<button class="mini" data-act="paymeal" data-w="${key}" data-d="${di}" data-k="${k}">吃了，记 £${f2(sp.cost)}</button>`
    : `<button class="mini" data-act="payout" data-w="${key}" data-d="${di}" data-k="${k}" ${date > today() ? "title=\"吃完再记\"" : ""}>吃完了，记账</button>`;
  if (compact) return payBtn;
  const pre = cu.kind === "custom" ? "" : `<select data-chg="preset" data-w="${key}" data-d="${di}" data-k="${k}" aria-label="选哪种">${sp.presets.map((p, i) => `<option value="${i}" ${p.name === cu.name ? "selected" : ""}>${esc(p.name)}</option>`).join("")}${cu.edited ? `<option selected>按包装改过的数字</option>` : ""}</select>`;
  const f = (kk, lab) => `<label>${lab}<input type="number" inputmode="decimal" min="0" data-chg="spnum" data-w="${key}" data-d="${di}" data-k="${k}" data-key="${kk}" value="${r0(+cu[kk] || 0)}"></label>`;
  return `<div class="sp-edit">${pre}<div class="sp-nums">${f("kcal", "kcal")}${f("p", "蛋白")}${f("c", "碳水")}${f("f", "脂肪")}</div>${payBtn}</div>`;
}

export function renderMenu(el) {
  const key = addDays(thisWeek(), 7 * wkSel), m = M();
  const w = week(key);
  const d = w?.days[daySel] || {}, n = dayN(d);
  const dayKind = i => dayKindOf(key, i);
  const note = noteOf(key, daySel), cls = m.classes?.[daySel] || [];
  el.innerHTML = `<div class="pagehead"><h1>菜单</h1>
    <div class="seg2 big">${["本周", "下周"].map((t, i) => `<button data-act="wk" data-i="${i}" aria-pressed="${wkSel === i}">${t}<small>${fmtMD(addDays(thisWeek(), 7 * i))}–${fmtMD(addDays(thisWeek(), 7 * i + 6))}</small></button>`).join("")}</div>
    <div class="acts">
      <button class="go sm" data-act="gen">随机生成${wkSel === 0 && dow(today()) > 0 ? "（今天到周日）" : w ? "（换掉没锁的）" : ""}</button>
      ${wkSel === 1 ? `<button class="btn" data-act="copywk">复制本周过来</button>` : ""}
      ${w ? `<button class="btn" data-act="clearwk">清空这周</button>` : ""}
    </div></div>
  <details class="rules"><summary>随机生成的规则</summary><ul>
    <li>早餐：工作日基本是英式早餐，焗豆版排相邻两天（一罐吃两顿），牛油果鸡蛋沙拉也排相邻两天；周末从恰巴塔三明治、北非蛋里挑。</li>
    <li>早餐热量差得多就配恰巴塔补，不配米饭。</li>
    <li>训练日（周一、二、四、五）晚饭只抽 30 分钟以内或提前备好的。</li>
    <li>周三可以抽中等难度的；周六、周日抽费事的，也是做好吃的那两天。</li>
    <li>工作日午饭一次做两顿：周一二同一道、周四五同一道。</li>
    <li>每道菜轮着来：越久没吃的越先排，同一道菜一周最多 3 次。</li>
    <li>甜品格自动排不会碰，想吃那天自己选一道；材料会进采购清单，按整个方子买。</li>
    <li>米饭按每餐热量目标自动配，面食不配。点 🔒 锁住的格子不会被换。</li>
  </ul></details>
  ${!w ? `<div class="notice">这周还没排。点上面「随机生成」，或者在下面一格一格选。</div>` : ""}
  <div class="days">${DAYS.map((nm, i) => `<button data-act="day" data-i="${i}" aria-current="${i === daySel}">
    <div class="d">${nm} <span class="k">${fmtMD(addDays(key, i))}</span></div><div class="k">${dayKind(i)} · ${r0(dayN(w?.days[i]).kcal)}</div></button>`).join("")}</div>
  ${note || cls.length ? `<div class="dayinfo">${cls.map(x => `<span>📚 ${esc(x)}</span>`).join("")}${note ? `<span>${esc(note)}</span>` : ""}</div>` : ""}
  <div class="daygrid">
    <div class="meals">${SLOTS.map(s => mealRow(key, daySel, s, d[s.k])).join("")}</div>
    <aside class="card sum">
      <h3>${DAYS[daySel]}合计</h3>
      ${bar("热量 kcal", n.kcal, DAY.kcal, "var(--ink2)")}
      ${bar("蛋白 g", n.p, DAY.pHi, "var(--p)", DAY.pLo)}
      ${bar("碳水 g", n.c, DAY.c, "var(--c)")}
      ${bar("脂肪 g", n.f, DAY.f, "var(--f)")}
      <div class="note">${n.kcal > 0 ? `<ul>${mealAdvice(n, d).map(x => `<li>${x}</li>`).join("")}</ul>` : `<span class="hint">这天还没排。</span>`}</div>
    </aside>
  </div>
  ${w ? `<section class="week"><h2>一周总览</h2><div class="scroll card flush"><table class="wt">
    <thead><tr><th></th>${DAYS.map((x, i) => `<th>${x}<small>${fmtMD(addDays(key, i))}</small></th>`).join("")}</tr></thead><tbody>
    ${SLOTS.filter(s => !s.opt || w.days.some(dd => dd?.[s.k])).map(s => `<tr><td class="s">${s.name}</td>${w.days.map(dd => { const e = dd?.[s.k]; const r = e && store.byId[e.r];
      if (e?.custom) return `<td><span class="sp-tag">${esc(SPECIAL[e.custom.kind]?.label || "特殊")}</span></td>`;
      return `<td>${r ? `<a href="#r-${esc(r.id)}" data-act="open" data-id="${esc(r.id)}">${esc(r.name)}</a>${e.rice ? `<div class="hint">+米饭 ${e.rice}g</div>` : ""}${e.bread ? `<div class="hint">+恰巴塔 ${e.bread}g</div>` : ""}` : "–"}</td>`; }).join("")}</tr>`).join("")}
    <tr class="tot"><td class="s">合计</td>${w.days.map(dd => { const x = dayN(dd); return `<td>${r0(x.kcal)} kcal<div class="hint">P ${r0(x.p)} · C ${r0(x.c)} · F ${r0(x.f)}</div></td>`; }).join("")}</tr>
    </tbody></table></div></section>` : ""}`;
}
function mealRow(key, di, s, e) {
  e = e || {};
  const r = store.byId[e.r], cu = e.custom, en = entryN(e);
  const cur = cu ? "__" + cu.kind : e.r;
  return `<div class="meal ${r ? "cat-" + r.cat : ""} ${cu ? "special" : ""}">
    <div class="slot">${s.name}${s.hint ? `<small>${s.hint}</small>` : ""}</div>
    <div class="dish">
      ${cu ? `<span class="sp-name"><span class="sp-tag">${esc(SPECIAL[cu.kind]?.label || "特殊")}</span>${esc(cu.name)}</span>`
        : r ? `<a href="#r-${esc(r.id)}" data-act="open" data-id="${esc(r.id)}"><span class="dot"></span>${esc(r.name)}</a>` : `<span class="hint">${s.opt ? "不吃就空着" : "没排"}</span>`}
      ${cu ? specialBox(key, di, s.k, cu) : ""}
      ${s.k === "b" && r ? `<div class="extra">配恰巴塔 <span class="stepper sm"><button data-act="bread" data-w="${key}" data-d="${di}" data-k="${s.k}" data-v="-40" aria-label="面包减 40 克">−</button><span>${e.bread || 0}g</span><button data-act="bread" data-w="${key}" data-d="${di}" data-k="${s.k}" data-v="40" aria-label="面包加 40 克">+</button></span></div>` : ""}
      ${s.rice && r ? `<div class="extra">配米饭 <span class="stepper sm"><button data-act="rice" data-w="${key}" data-d="${di}" data-k="${s.k}" data-v="-50" aria-label="米饭减 50 克">−</button><span>${e.rice || 0}g</span><button data-act="rice" data-w="${key}" data-d="${di}" data-k="${s.k}" data-v="50" aria-label="米饭加 50 克">+</button></span></div>` : ""}
    </div>
    <div class="num-r"><b>${r0(en.kcal)}</b> kcal · P ${r0(en.p)}</div>
    <div class="swaprow">
      <select data-chg="swap" data-w="${key}" data-d="${di}" data-k="${s.k}" aria-label="换${s.name}">${recipeOptions(cur, s.name)}</select>
      ${e.r && !cu && !s.opt && s.k !== "s" && s.k !== "n" ? `<button class="mini" data-act="eatout" data-w="${key}" data-d="${di}" data-k="${s.k}">改吃外面</button>` : ""}
      ${(e.r || cu) ? `<button class="lock ${e.lock ? "on" : ""}" data-act="lock" data-w="${key}" data-d="${di}" data-k="${s.k}" aria-pressed="${!!e.lock}" title="${e.lock ? "已锁定，随机生成不会换" : "锁定这一格"}">${e.lock ? "🔒" : "🔓"}</button>` : ""}
    </div>
  </div>`;
}
const cell = el => { const w = week(el.dataset.w, true); return { w, d: w.days[+el.dataset.d], k: el.dataset.k, di: +el.dataset.d, key: el.dataset.w }; };

actions.wk = el => { wkSel = +el.dataset.i; ui.rerender(); };
actions.day = el => { daySel = +el.dataset.i; ui.rerender(); };
actions.gen = () => { generate(addDays(thisWeek(), 7 * wkSel)); ui.rerender(); toast("排好了，不喜欢的直接换"); };
actions.copywk = () => {
  const src = week(thisWeek()); if (!src) { toast("本周还是空的"); return; }
  const dst = week(addDays(thisWeek(), 7), true);
  dst.days = src.days.map(d => { const o = {}; for (const [k, v] of Object.entries(d)) { const c = JSON.parse(JSON.stringify(v)); if (c.custom) delete c.custom.paid; o[k] = c; } return o; });
  save(); ui.rerender(); toast("复制过来了");
};
actions.clearwk = el => {
  if (!el.dataset.armed) { el.dataset.armed = "1"; el.textContent = "再点一次确认清空"; setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.textContent = "清空这周"; } }, 3000); return; }
  const key = addDays(thisWeek(), 7 * wkSel); const w = week(key);
  if (w) w.days = w.days.map(d => Object.fromEntries(Object.entries(d).filter(([, v]) => v.custom?.paid)));
  save(); ui.rerender();
};
actions.rice = el => { const { d, k } = cell(el); const e = d[k]; if (!e) return; e.rice = Math.max(0, Math.min(600, (e.rice || 0) + (+el.dataset.v))); save(); ui.rerender(); };
actions.bread = el => { const { d, k } = cell(el); const e = d[k]; if (!e) return; e.bread = Math.max(0, Math.min(240, (e.bread || 0) + (+el.dataset.v))); if (!e.bread) delete e.bread; save(); ui.rerender(); };
actions.lock = el => { const { d, k } = cell(el); const e = d[k]; if (!e) return; e.lock = !e.lock; save(); ui.rerender(); };
changes.swap = el => {
  const { d, k } = cell(el); const prev = d[k] || {};
  if (prev.custom?.paid) { toast("这格已经记过账，先点撤销再换"); ui.rerender(); return; }
  const v = el.value;
  if (v === "__clear") delete d[k];
  else if (v.startsWith("__")) { const kind = v.slice(2); d[k] = { custom: { kind, ...SPECIAL[kind].presets[0] }, rice: 0, lock: true }; }
  else { const r = store.byId[v]; d[k] = entryFor(r, k, { lock: prev.lock }); }
  save(); ui.rerender();
};
changes.preset = el => { const { d, k } = cell(el); const e = d[k]; const p = SPECIAL[e.custom.kind].presets[+el.value]; if (p) { e.custom = { ...e.custom, ...p, edited: false }; save(); ui.rerender(); } };
changes.spnum = el => { const { d, k } = cell(el); const e = d[k]; e.custom[el.dataset.key] = Math.max(0, Math.min(5000, +el.value || 0)); if (e.custom.kind !== "custom") e.custom.edited = true; save(); ui.rerender(); };

function markPaid(c, amt, cat, note) {
  const x = addEntry({ date: addDays(c.key, c.di) > today() ? today() : addDays(c.key, c.di), amount: amt, cat, note, meta: { menu: `${c.key}/${c.di}/${c.k}` } });
  c.d[c.k].custom.paid = { amt, eid: x.id };
  save(); ui.rerender(); toast(`记下了 ${money(amt)} · ${cat === "food" ? "吃饭" : "其他"}`);
}
actions.paymeal = el => { const c = cell(el); markPaid(c, SPECIAL.mealdeal.cost, "food", "Tesco Meal Deal"); };
actions.payout = el => {
  const c = cell(el), cu = c.d[c.k].custom;
  modal(`<form><p class="mt">${esc(cu.name)} 实际付了多少？AA 后自己那份</p><input name="v" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" class="num">
    <div class="two mtop"><button type="button" class="btn" data-close>取消</button><button class="go" type="submit">记下</button></div></form>`,
    (box, close) => box.querySelector("form").onsubmit = e => { e.preventDefault(); const v = parseFloat(e.target.v.value); if (!(v > 0)) return; close();
      markPaid(c, v, SPECIAL[cu.kind]?.cat || "food", cu.kind === "custom" ? cu.name : "聚餐 · " + cu.name); });
};
actions.unpay = el => { const c = cell(el); const cu = c.d[c.k].custom; if (cu?.paid) { removeEntry(cu.paid.eid); delete cu.paid; save(); ui.rerender(); toast("撤销了"); } };

/* ---------- 临时改吃外面 ---------- */
const DN = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
// 把 key 周 di 天 k 这顿的菜往后挪：同一餐次一天天往后顺，挪到空格为止
function pushLater(key, di, k, carry) {
  let w = key, d = di;
  for (let i = 0; i < 14; i++) {
    d++; if (d > 6) { d = 0; w = addDays(w, 7); }
    const wk = week(w, true), cur = wk.days[d][k];
    if (cur && (cur.custom || cur.lock)) continue;
    wk.days[d][k] = { r: carry.r, rice: carry.rice || 0, ...(carry.bread ? { bread: carry.bread } : {}) };
    if (!cur || !cur.r) return;
    carry = { r: cur.r, rice: cur.rice, bread: cur.bread };
  }
}
export function eatOutModal(key, di, k) {
  const w = week(key, true), e = w.days[di][k] || {}, r = store.byId[e.r];
  const slot = SLOTS.find(s => s.k === k);
  modal(`<form><div class="mhead"><p class="mt">${DN[di]}${slot.name}改吃外面</p><button type="button" class="x" data-close aria-label="关掉">×</button></div>
    <div class="chips" id="eoKind">${[["mealdeal", "Meal Deal"], ["eatout", "聚餐"], ["custom", "外卖 / 其他"]].map(([v, n], i) => `<button type="button" class="chip2" data-kind="${v}" aria-pressed="${i === 0}">${n}</button>`).join("")}</div>
    <label class="mtop">花了多少 £<input name="v" type="number" step="0.01" min="0" inputmode="decimal" class="num big" value="4.00"></label>
    <label class="mtop">吃的什么（可不填）<input name="n" placeholder="比如：鸡肉三明治套餐"></label>
    ${r ? `<p class="hint mtop">原来的「${esc(r.name)}」：${boughtFor(key, di) ? "食材已经买了，会往后挪到下一顿同一餐，不浪费。" : "食材还没买，采购清单会自动少买。"}</p>` : ""}
    <div class="two mtop"><button type="button" class="btn" data-close>取消</button><button class="go" type="submit">记下</button></div></form>`,
    (box, close) => {
      let kind = "mealdeal";
      box.querySelectorAll("[data-kind]").forEach(b => b.onclick = () => {
        kind = b.dataset.kind; box.querySelectorAll("[data-kind]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        if (kind === "mealdeal") box.querySelector("[name=v]").value = "4.00"; else box.querySelector("[name=v]").value = "";
        box.querySelector("[name=v]").focus();
      });
      box.querySelector("form").onsubmit = ev => {
        ev.preventDefault(); const f = ev.target, amt = parseFloat(f.v.value);
        if (!(amt > 0)) { toast("先填花了多少"); return; }
        const sp = SPECIAL[kind], p = sp.presets[0], nm = f.n.value.trim() || p.name;
        const x = addEntry({ date: addDays(key, di) > today() ? today() : addDays(key, di), amount: amt, cat: sp.cat, note: kind === "eatout" ? "聚餐 · " + nm : kind === "mealdeal" ? "Meal Deal" : nm, meta: { menu: `${key}/${di}/${k}` } });
        let msg = `记下了 ${money(amt)}`;
        if (r) {
          if (boughtFor(key, di)) { pushLater(key, di, k, { r: e.r, rice: e.rice, bread: e.bread }); msg += `，「${r.name}」往后挪了一顿`; }
          else msg += "，采购清单已经少买这顿的";
        }
        w.days[di][k] = { custom: { kind, ...p, name: nm, paid: { amt, eid: x.id } }, lock: true };
        save(); close(); ui.rerender(); toast(msg);
      };
    });
}
actions.eatout = el => eatOutModal(el.dataset.w, +el.dataset.d, el.dataset.k);
