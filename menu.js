// 菜单：营养计算、按周存、随机生成、菜单页
import { store, saveDoc } from "./store.js";
import { DAY, SLOTS, SLOT_BY_NAME, DAYS, CATS, RICE, SPECIAL } from "./data.js";
import { $, esc, r0, f2, money, today, addDays, mondayOf, dow, fmtMD, toast, modal } from "./util.js";
import { actions, changes, ui } from "./ui.js";
import { addEntry, removeEntry } from "./ledger.js";

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
export function entryN(e) {
  if (!e) return ZERO;
  if (e.custom) { const c = e.custom; return { kcal: +c.kcal || 0, p: +c.p || 0, c: +c.c || 0, f: +c.f || 0 }; }
  let n = store.byId[e.r] ? perServing(store.byId[e.r]) : ZERO;
  if (e.rice) n = add(n, riceN(e.rice));
  return n;
}
export const dayN = d => SLOTS.reduce((a, s) => add(a, entryN(d?.[s.k])), ZERO);

/* ---------- 按周存 ---------- */
export const thisWeek = () => mondayOf(today());
export function week(key, create) {
  const m = M(); m.weeks = m.weeks || {};
  if (!m.weeks[key] && create) m.weeks[key] = { days: Array.from({ length: 7 }, () => ({})) };
  return m.weeks[key] || null;
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
function pickFrom(pool, used, lastWeek, limit = 3) {
  const ok = pool.filter(r => (used[r.id] || 0) < limit);
  if (!ok.length) return null;
  // 上周吃过的降低权重，用得少的优先
  const w = ok.map(r => (lastWeek.has(r.id) ? 0.35 : 1) / (1 + (used[r.id] || 0) * 2));
  let x = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ok.length; i++) { x -= w[i]; if (x <= 0) return ok[i]; }
  return ok[ok.length - 1];
}
function riceFor(r, slotK) {
  const s = SLOTS.find(z => z.k === slotK);
  if (!s.rice || hasRice(r) || r.cat === "面食") return 0;
  const need = (s.t.kcal - perServing(r).kcal) / 1.3;
  return Math.max(0, Math.min(350, Math.round(need / 50) * 50));
}
export function generate(key) {
  const w = week(key, true), m = M(), train = m.train || [0, 1, 3, 4];
  const all = store.recipes;
  const prev = week(addDays(key, -7));
  const lastWeek = new Set(); prev?.days.forEach(d => Object.values(d).forEach(e => e?.r && lastWeek.add(e.r)));
  const used = {};
  w.days.forEach(d => Object.values(d).forEach(e => { if (e?.lock && e.r) used[e.r] = (used[e.r] || 0) + 1; }));
  const put = (di, k, r) => {
    const cur = w.days[di][k];
    if (cur && (cur.lock || cur.custom)) return false;
    if (!r) { delete w.days[di][k]; return true; }
    w.days[di][k] = { r: r.id, rice: riceFor(r, k) };
    used[r.id] = (used[r.id] || 0) + 1;
    return true;
  };
  const free = (di, k) => { const c = w.days[di][k]; return !(c && (c.lock || c.custom)); };

  const bfAll = all.filter(r => r.slot === "早餐" && perServing(r).kcal >= 350);
  const bfQuick = bfAll.filter(r => (+r.mins || 0) <= 30 || r.batch);
  const batchPool = all.filter(r => MAIN(r) && (r.cat === "平日备餐" || r.batch) && r.diff !== "费事");
  const trainDinner = all.filter(r => MAIN(r) && (quick(r) || r.cat === "平日备餐"));
  const midDinner = all.filter(r => MAIN(r) && r.diff !== "费事" && (+r.mins || 0) <= 60);
  const weekend = all.filter(r => MAIN(r));
  const weekendBig = weekend.filter(r => r.diff === "费事" || r.diff === "中等");
  const post = store.byId["post-workout"], bed = store.byId["bedtime-milk"];

  for (let di = 0; di < 7; di++) {
    const isTrain = train.includes(di), wkend = di >= 5;
    if (free(di, "b")) put(di, "b", pickFrom(wkend ? bfAll : bfQuick, used, lastWeek));
    if (free(di, "s") && post) put(di, "s", post);
    if (free(di, "n") && bed) put(di, "n", bed);
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
    let short = DAY.kcal - dayN(w.days[di]).kcal;
    for (const k of ["d", "l"]) {
      const e = w.days[di][k], r = e && store.byId[e.r];
      if (!r || e.lock || hasRice(r) || r.cat === "面食") continue;
      while (short > 100 && (e.rice || 0) < 450) { e.rice = (e.rice || 0) + 50; short -= 65; }
    }
  }
  pruneWeeks();
  save();
}

/* ---------- 菜单页 ---------- */
let wkSel = 0, daySel = dow(today());
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
export function recipeOptions(cur) {
  const list = c => store.recipes.filter(r => r.cat === c);
  return `${cur ? `<option value="__clear">✕ 清空这一格</option>` : `<option value="" selected disabled>选一道…</option>`}
    <optgroup label="特殊情况">${Object.entries(SPECIAL).map(([k, v]) => `<option value="__${k}" ${cur === "__" + k ? "selected" : ""}>${v.label}</option>`).join("")}</optgroup>` +
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
  const train = m.train || [0, 1, 3, 4];
  const dayKind = i => train.includes(i) ? "训练" : i === 5 ? "有氧" : "休息";
  const note = m.dayNotes?.[daySel], cls = m.classes?.[daySel] || [];
  el.innerHTML = `<div class="pagehead"><h1>菜单</h1>
    <div class="seg2 big">${["本周", "下周"].map((t, i) => `<button data-act="wk" data-i="${i}" aria-pressed="${wkSel === i}">${t}<small>${fmtMD(addDays(thisWeek(), 7 * i))}–${fmtMD(addDays(thisWeek(), 7 * i + 6))}</small></button>`).join("")}</div>
    <div class="acts">
      <button class="go sm" data-act="gen">随机生成${w ? "（换掉没锁的）" : ""}</button>
      ${wkSel === 1 ? `<button class="btn" data-act="copywk">复制本周过来</button>` : ""}
      ${w ? `<button class="btn" data-act="clearwk">清空这周</button>` : ""}
    </div></div>
  <details class="rules"><summary>随机生成的规则</summary><ul>
    <li>训练日（周一、二、四、五）晚饭只抽 30 分钟以内或提前备好的。</li>
    <li>周三可以抽中等难度的；周六、周日抽费事的，也是做好吃的那两天。</li>
    <li>工作日午饭一次做两顿：周一二同一道、周四五同一道。</li>
    <li>早餐从早餐碗里轮换；同一道菜一周最多 3 次；上周吃过的少抽。</li>
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
    ${SLOTS.map(s => `<tr><td class="s">${s.name}</td>${w.days.map(dd => { const e = dd?.[s.k]; const r = e && store.byId[e.r];
      if (e?.custom) return `<td><span class="sp-tag">${esc(SPECIAL[e.custom.kind]?.label || "特殊")}</span></td>`;
      return `<td>${r ? `<a href="#r-${esc(r.id)}" data-act="open" data-id="${esc(r.id)}">${esc(r.name)}</a>${e.rice ? `<div class="hint">+米饭 ${e.rice}g</div>` : ""}` : "–"}</td>`; }).join("")}</tr>`).join("")}
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
        : r ? `<a href="#r-${esc(r.id)}" data-act="open" data-id="${esc(r.id)}"><span class="dot"></span>${esc(r.name)}</a>` : `<span class="hint">没排</span>`}
      ${cu ? specialBox(key, di, s.k, cu) : ""}
      ${s.rice && r ? `<div class="extra">配米饭 <span class="stepper sm"><button data-act="rice" data-w="${key}" data-d="${di}" data-k="${s.k}" data-v="-50" aria-label="米饭减 50 克">−</button><span>${e.rice || 0}g</span><button data-act="rice" data-w="${key}" data-d="${di}" data-k="${s.k}" data-v="50" aria-label="米饭加 50 克">+</button></span></div>` : ""}
    </div>
    <div class="num-r"><b>${r0(en.kcal)}</b> kcal · P ${r0(en.p)}</div>
    <div class="swaprow">
      <select data-chg="swap" data-w="${key}" data-d="${di}" data-k="${s.k}" aria-label="换${s.name}">${recipeOptions(cur)}</select>
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
actions.lock = el => { const { d, k } = cell(el); const e = d[k]; if (!e) return; e.lock = !e.lock; save(); ui.rerender(); };
changes.swap = el => {
  const { d, k } = cell(el); const prev = d[k] || {};
  if (prev.custom?.paid) { toast("这格已经记过账，先点撤销再换"); ui.rerender(); return; }
  const v = el.value;
  if (v === "__clear") delete d[k];
  else if (v.startsWith("__")) { const kind = v.slice(2); d[k] = { custom: { kind, ...SPECIAL[kind].presets[0] }, rice: 0, lock: true }; }
  else { const r = store.byId[v]; d[k] = { r: v, rice: riceFor(r, k), lock: prev.lock }; }
  save(); ui.rerender();
};
changes.preset = el => { const { d, k } = cell(el); const e = d[k]; const p = SPECIAL[e.custom.kind].presets[+el.value]; if (p) { e.custom = { ...e.custom, ...p, edited: false }; save(); ui.rerender(); } };
changes.spnum = el => { const { d, k } = cell(el); const e = d[k]; e.custom[el.dataset.key] = Math.max(0, Math.min(5000, +el.value || 0)); if (e.custom.kind !== "custom") e.custom.edited = true; save(); ui.rerender(); };

function markPaid(c, amt, sub, note) {
  const x = addEntry({ date: addDays(c.key, c.di) > today() ? today() : addDays(c.key, c.di), amount: amt, cat: "eat", sub, note, meta: { menu: `${c.key}/${c.di}/${c.k}` } });
  c.d[c.k].custom.paid = { amt, eid: x.id };
  save(); ui.rerender(); toast(`记下了 ${money(amt)} · 外食`);
}
actions.paymeal = el => { const c = cell(el); markPaid(c, SPECIAL.mealdeal.cost, "mealdeal", "Tesco Meal Deal"); };
actions.payout = el => {
  const c = cell(el), cu = c.d[c.k].custom;
  modal(`<form><p class="mt">${esc(cu.name)} 实际付了多少？AA 后自己那份</p><input name="v" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" class="num">
    <div class="two mtop"><button type="button" class="btn" data-close>取消</button><button class="go" type="submit">记下</button></div></form>`,
    (box, close) => box.querySelector("form").onsubmit = e => { e.preventDefault(); const v = parseFloat(e.target.v.value); if (!(v > 0)) return; close();
      markPaid(c, v, cu.kind === "custom" ? "coffee" : "party", cu.kind === "custom" ? cu.name : "聚餐 · " + cu.name); });
};
actions.unpay = el => { const c = cell(el); const cu = c.d[c.k].custom; if (cu?.paid) { removeEntry(cu.paid.eid); delete cu.paid; save(); ui.rerender(); toast("撤销了"); } };
