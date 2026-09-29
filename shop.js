// 采购：一周三次（小冰箱），按菜单算清单、勾选同步、小票拆账
import { store, saveDoc } from "./store.js";
import { SLOTS, PACKS, EST_PER_KG, BULK, KEEP, TRIPS, SHOP_GROUPS, ingSub, shopName } from "./data.js";
import { $, esc, r1, f2, money, round2, today, addDays, dow, fmtMD, toast, modal } from "./util.js";
import { actions, changes, ui } from "./ui.js";
import { week, thisWeek } from "./menu.js";
import { L, catBudget, calc, addEntry, removeEntry } from "./ledger.js";

const S = () => { const s = store.docs.shop; s.bought = s.bought || {}; s.pantry = s.pantry || {}; s.receipts = s.receipts || {}; return s; };
const save = () => saveDoc("shop");

// 下一趟采购：今天就是采购日就算今天
export function nextTrip() {
  const di = dow(today());
  const t = TRIPS.find(x => x.day >= di);
  return t ? { trip: t, key: thisWeek() } : { trip: TRIPS[0], key: addDays(thisWeek(), 7) };
}
let sel = null;   // {key, k}

function pick(x) {
  const opts = PACKS[x.n]; if (!opts) return null;
  let best = null;
  for (const o of opts) {
    const need = o.cnt ? Math.ceil(x.cnt || x.g / 55) : x.g;
    if (!(need > 0)) continue;
    const unit = o.cnt || o.size;
    const n = o.loose ? need / unit : Math.ceil(need / unit - 1e-9);
    const pay = n * o.price, use = need / unit * o.price;
    if (!best || pay < best.pay - 1e-9 || (Math.abs(pay - best.pay) < 1e-9 && n < best.n)) best = { o, n, pay, use };
  }
  return best;
}
function cost(x) {
  const p = pick(x); if (p) return { pay: p.pay, use: p.use, p };
  const v = x.g / 1000 * (EST_PER_KG[x.sub] || 0);
  return { pay: v, use: v, est: v > 0 };
}
const isStock = x => x.sub === "pantry" || x.sub === "supp" || BULK.test(x.n);
export function keepOf(n) {
  if (/鸡|牛|梅花|猪|五花|排骨|虾|三文鱼|鳕|白鱼|鱿鱼|培根/.test(n) && !/蛋/.test(n)) return { days: 3, how: "冷藏，两三天内吃完" };
  if (KEEP[n]) return { days: KEEP[n][0], how: KEEP[n][1] };
  return { days: 0, how: "" };
}

// 一趟要买的：这趟覆盖的几天用到的新鲜东西；囤货（米、燕麦、调料、蛋白粉）单独列，家里有就不用买
export function buildShop(key, k) {
  const trip = TRIPS.find(t => t.k === k), w = week(key);
  const fresh = new Map(), stock = new Map();
  const put = (i, f, from, di) => {
    const s = shopName(i.n); if (!s) return;
    const sub = ingSub(s.n) || ingSub(i.n) || "veg";
    const probe = { n: s.n, sub };
    const target = isStock(probe) ? stock : trip.days.includes(di) ? fresh : null;
    if (!target) return;
    const x = target.get(s.n) || { n: s.n, g: 0, cnt: 0, unit: i.unit, note: s.note, sub, from: new Set() };
    x.g += (i.g || 0) * f * s.f; if (i.cnt) { x.cnt += i.cnt * f; x.unit = i.unit; } x.from.add(from);
    target.set(s.n, x);
  };
  (w?.days || []).forEach((d, di) => { for (const s of SLOTS) {
    const e = d?.[s.k]; if (!e || e.custom) continue;
    const r = store.byId[e.r];
    if (r) for (const i of r.ing || []) put(i, s.opt ? 1 : 1 / (r.base || 1), r.name, di);   // 甜品整份做，材料按整个方子买
    if (e.rice) put({ n: "熟米饭", g: e.rice }, 1, "配米饭", di);
  } });
  const pantry = S().pantry;
  const buy = [...fresh.values()];
  let pay = 0, est = 0; const bySub = {};
  for (const x of buy) { const c = cost(x); pay += c.pay; bySub[x.sub] = (bySub[x.sub] || 0) + c.pay; if (c.est) est++; }
  const stockAll = [...stock.values()];
  const stockNeed = stockAll.filter(x => !pantry[x.n] && PACKS[x.n]);
  let stockPay = 0; for (const x of stockNeed) { const c = cost(x); stockPay += c.pay; bySub[x.sub] = (bySub[x.sub] || 0) + c.pay; }
  const groups = SHOP_GROUPS.filter(g => g.id !== "pantry" && g.id !== "supp").map(g => ({ ...g, items: buy.filter(x => x.sub === g.id).sort((p, q) => q.g - p.g) })).filter(g => g.items.length);
  return { trip, groups, buy, pay, est, bySub, stock: k === "mon" ? stockAll : [], stockNeed: k === "mon" ? stockNeed : [], stockPay: k === "mon" ? stockPay : 0 };
}
// 某天那顿的食材是不是已经买了（那一趟记过小票，或者勾过东西）
export function boughtFor(key, di) {
  const t = TRIPS.find(x => x.days.includes(di)); if (!t) return false;
  const s = S(), pre = `${key}:${t.k}`;
  return !!s.receipts[pre] || Object.keys(s.bought).some(x => x.startsWith(pre + ":"));
}

function qty(x) {
  if (x.cnt) { const c = Math.ceil(x.cnt); return `${c} ${x.unit || "个"}<small>约 ${fmtG(x.g)}</small>`; }
  return fmtG(x.g) + (x.note ? `<small>${x.note}</small>` : "");
}
function fmtG(g) { return g >= 1000 ? `${r1(g / 1000)} kg` : `${g < 10 ? r1(g) : Math.ceil(g / 5) * 5} g`; }

function itemRow(x, keyPre, stockRow) {
  const sh = S(), k = keyPre + x.n, co = cost(x), pk = co.p, has = !!sh.pantry[x.n], kp = keepOf(x.n);
  return `<div class="item ${sh.bought[k] || has ? "done" : ""}">
    <input type="checkbox" id="b-${esc(k)}" data-chg="buy" data-k="${esc(k)}" ${sh.bought[k] ? "checked" : ""} ${has ? "disabled" : ""} aria-label="买了${esc(x.n)}">
    <span class="nm"><label for="b-${esc(k)}">${esc(x.n)}</label>
      ${pk ? `<span class="pk">${pk.o.loose ? esc(pk.o.l) : `${pk.n} × ${esc(pk.o.l)}`} · ${money(pk.pay)}</span>` : co.est ? `<span class="pk miss">按同类估 ${money(co.pay)}</span>` : ""}
      ${kp.how && !stockRow ? `<span class="keep">${esc(kp.how)}</span>` : ""}
      <span class="for">${[...x.from].slice(0, 3).map(esc).join("、")}${x.from.size > 3 ? " 等" : ""}</span>
      ${stockRow ? `<button class="have" data-act="have" data-n="${esc(x.n)}" aria-pressed="${has}">${has ? "家里还有 ✓" : "家里还有"}</button>` : ""}
    </span>
    <span class="q">${has ? "不用买" : qty(x)}</span></div>`;
}

export function renderShop(el) {
  if (!sel) { const n = nextTrip(); sel = { key: n.key, k: n.trip.k }; }
  const { key, k } = sel;
  const r = buildShop(key, k), sh = S();
  const pre = `${key}:${k}:`;
  const done = r.buy.filter(x => sh.bought[pre + x.n]).length;
  const rc = sh.receipts[`${key}:${k}`];
  const food = L().S.cats.find(c => c.id === "food");
  const gLeft = (food ? catBudget(food) : 0) - (calc().byC.food || 0);
  const days = r.trip.days.map(d => ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][d]).join("、");
  const weeks = [thisWeek(), addDays(thisWeek(), 7)];
  el.innerHTML = `<div class="pagehead"><h1>采购</h1>
    <div class="seg2 big">${weeks.map((w, i) => `<button data-act="swk" data-w="${w}" aria-pressed="${key === w}">${i ? "下周" : "本周"}<small>${fmtMD(w)} 起</small></button>`).join("")}</div>
    <div class="seg2 big">${TRIPS.map(t => `<button data-act="trip" data-v="${t.k}" aria-pressed="${k === t.k}">${t.name}<small>${fmtMD(addDays(key, t.day))}</small></button>`).join("")}</div>
  </div>
  ${!week(key) ? `<div class="notice">这周菜单还没排，清单是空的。先去菜单页点「随机生成」。</div>` : ""}
  <div class="shoptop">
    <div class="card">
      <h3>这一趟买 ${days} 吃的</h3>
      <div class="bignum num">${money(r.pay + r.stockPay)}</div>
      <div class="hint">新鲜的 ${r.buy.length} 样约 ${money(r.pay)}${r.stockNeed.length ? `，囤货 ${r.stockNeed.length} 样约 ${money(r.stockPay)}（家里有的点「家里还有」就不算）` : ""}。${r.est ? `有 ${r.est} 样没查到具体商品，按同类价格估的。` : ""}</div>
      <div class="hint mtop">吃饭这个月还剩 <b class="num ${gLeft < 0 ? "up" : ""}">${money(gLeft)}</b>。</div>
      ${rc ? `<div class="paidbox">已记账 ${money(rc.total)} <button class="linkbtn" data-act="unreceipt">撤销</button></div>`
        : `<button class="go mtop" data-act="receipt">买完了，按小票记账</button>`}
    </div>
    <div class="card">
      <h3>怎么买<small class="hint"> · 已勾 ${done} / ${r.buy.length}</small></h3>
      <p class="hint">冰箱小，一周去三次：周一买周一二的，周三买周三四的，周五买周五到周日的。肉和鱼买回来直接冷藏，两三天内吃完。米、燕麦、调料、蛋白粉这类常温放的只在周一那趟看一眼，家里还有就点「家里还有」。</p>
      <button class="btn" data-act="clearbought">清空这趟的勾选</button>
    </div>
  </div>
  <div class="shopgrid">${r.groups.map(g => `
    <section class="card group"><h3>${g.name}<small>${g.items.length} 样</small></h3>${g.items.map(x => itemRow(x, pre, false)).join("")}</section>`).join("")}
    ${r.stock.length ? `<section class="card group"><details ${r.stockNeed.length ? "" : ""}><summary><h3>囤货和调料<small>${r.stock.length} 样 · 家里有就不用买</small></h3></summary>${r.stock.sort((p, q) => (PACKS[q.n] ? 1 : 0) - (PACKS[p.n] ? 1 : 0)).map(x => itemRow(x, pre, true)).join("")}</details></section>` : ""}
    ${!r.groups.length && !r.stock.length ? `<div class="empty">这趟不用买东西。</div>` : ""}
  </div>`;
}
actions.swk = el => { sel = { ...(sel || {}), key: el.dataset.w, k: sel?.k || "mon" }; ui.rerender(); };
actions.trip = el => { sel = { ...(sel || nextTripSel()), k: el.dataset.v }; ui.rerender(); };
const nextTripSel = () => { const n = nextTrip(); return { key: n.key, k: n.trip.k }; };
changes.buy = el => { const b = S().bought; if (el.checked) b[el.dataset.k] = 1; else delete b[el.dataset.k]; save(); ui.rerender(); };
actions.have = el => { const p = S().pantry; if (p[el.dataset.n]) delete p[el.dataset.n]; else p[el.dataset.n] = 1; save(); ui.rerender(); };
actions.clearbought = () => {
  const pre = `${sel.key}:${sel.k}:`, b = S().bought;
  for (const k of Object.keys(b)) if (k.startsWith(pre)) delete b[k];
  const old = addDays(thisWeek(), -14);
  for (const k of Object.keys(b)) if (k.slice(0, 10) < old) delete b[k];
  save(); ui.rerender();
};

/* ---------- 小票记账：总额里扣掉零食和补剂，剩下都算吃饭 ---------- */
actions.receipt = () => {
  const { key, k } = sel, name = buildShop(key, k).trip.name;
  modal(`<form class="rcpt"><p class="mt">小票记账 · ${name}</p>
    <label>小票总额 £<input name="total" type="number" step="0.01" min="0" inputmode="decimal" class="num big" placeholder="0.00"></label>
    <div class="flab">里面有这些的话填一下，没有就空着</div>
    <div class="grid3">
      <label>囤货 £<input name="x_stock" type="number" step="0.01" min="0" inputmode="decimal" title="米、油、燕麦、大瓶调料"></label>
      <label>零食 £<input name="x_snack" type="number" step="0.01" min="0" inputmode="decimal"></label>
      <label>补剂 £<input name="x_supp" type="number" step="0.01" min="0" inputmode="decimal"></label>
    </div>
    <div class="hint">囤货是米、油、燕麦、大瓶调料这种一买吃很久的，不占每月吃饭预算。</div>
    <div class="hint" id="rcHint"></div>
    <div class="two mtop"><button type="button" class="btn" data-close>取消</button><button class="go" type="submit">记下</button></div></form>`,
    (box, close) => {
      const f = box.querySelector("form"), val = n => parseFloat(f[n].value) || 0;
      const food = () => round2(val("total") - val("x_snack") - val("x_supp") - val("x_stock"));
      f.addEventListener("input", () => {
        const v = food();
        $("#rcHint").innerHTML = val("total") ? (v < 0 ? `<span class="up">分出去的加起来比总额还多</span>` : `吃饭记 ${money(v)}`) : "";
      });
      f.onsubmit = e => {
        e.preventDefault();
        const total = val("total"); if (!(total > 0)) { toast("先填小票总额"); return; }
        if (food() < 0) { toast("分出去的加起来比总额还多"); return; }
        const note = "Tesco " + name, meta = { receipt: `${key}:${k}` }, eids = [];
        const mk = (cat, v, nt) => { if (v > 0) eids.push(addEntry({ amount: v, cat, note: nt || note, meta }).id); };
        mk("food", food()); mk("__stock", val("x_stock"), note + " · 囤货"); mk("snack", val("x_snack")); mk("other", val("x_supp"), note + " · 补剂");
        S().receipts[`${key}:${k}`] = { total, eids };
        save(); close(); ui.rerender(); toast(`记下了 ${money(total)}`);
      };
    });
};
actions.unreceipt = () => {
  const rk = `${sel.key}:${sel.k}`, rc = S().receipts[rk]; if (!rc) return;
  for (const id of rc.eids) removeEntry(id, true);
  saveDoc("ledger"); delete S().receipts[rk]; save(); ui.rerender(); toast("撤销了");
};
