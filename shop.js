// 采购：按菜单算清单、两次采购、勾选同步、小票拆账
import { store, saveDoc } from "./store.js";
import { SLOTS, PACKS, EST_PER_KG, BULK, KEEP, TRIPS, SHOP_GROUPS, ingSub, shopName } from "./data.js";
import { $, $$, esc, r1, f2, money, round2, today, addDays, fmtMD, toast, modal } from "./util.js";
import { actions, changes, ui } from "./ui.js";
import { week, thisWeek } from "./menu.js";
import { L, catBudget, calc, addEntry, removeEntry } from "./ledger.js";

const S = () => store.docs.shop;
const save = () => saveDoc("shop");
const _d = (new Date().getDay() + 6) % 7;
// 周六周日默认看下周一的采购，周四周五看周四补货
let wkSel = _d >= 5 ? 1 : 0, trip = _d >= 3 && _d <= 4 ? "thu" : "mon";

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
// 没查到价格的按同类每公斤估
function cost(x) {
  const p = pick(x); if (p) return { pay: p.pay, use: p.use, p };
  const rate = EST_PER_KG[x.sub] || 0; const v = x.g / 1000 * rate;
  return { pay: v, use: v, est: rate > 0 };
}
export function keepOf(n) {
  if (n === "牛奶") return { days: 7, how: KEEP["牛奶"][1] };
  if (/鸡胸|鸡腿|鸡翅|牛肉|牛排|牛肋|牛腩|牛腱|牛肩|牛胸|梅花|猪|五花|排骨|虾|三文鱼|鳕|白鱼|鱿鱼/.test(n)) return { freeze: true, how: "买回来按每顿分装冷冻，吃的前一晚放冷藏解冻" };
  if (/欧包|酸面包|面包|恰巴塔|饺子皮|卷饼/.test(n)) return { freeze: true, how: "分成小份冷冻，要用时直接拿出来" };
  if (KEEP[n]) return { days: KEEP[n][0], how: KEEP[n][1] };
  return { days: 60, how: "" };
}

export function buildShop(key, which) {
  const map = new Map(), w = week(key);
  const put = (i, k, from, di) => {
    const s = shopName(i.n); if (!s) return;
    const sub = ingSub(s.n) || ingSub(i.n) || "veg";
    const x = map.get(s.n) || { n: s.n, g: 0, cnt: 0, unit: i.unit, note: s.note, sub, from: new Set(), days: new Map() };
    const g = (i.g || 0) * k * s.f, c = i.cnt ? i.cnt * k : 0;
    x.g += g; x.cnt += c; if (i.cnt) x.unit = i.unit; x.from.add(from);
    const dd = x.days.get(di) || { g: 0, cnt: 0 }; dd.g += g; dd.cnt += c; x.days.set(di, dd);
    map.set(s.n, x);
  };
  (w?.days || []).forEach((d, di) => { for (const s of SLOTS) {
    const e = d?.[s.k]; if (!e || e.custom) continue;
    const r = store.byId[e.r];
    if (r) for (const i of r.ing || []) put(i, 1 / (r.base || 1), r.name, di);
    if (e.rice) put({ n: "熟米饭", g: e.rice }, 1, "配米饭", di);
  } });
  const out = { mon: [], thu: [] };
  for (const x of map.values()) {
    const kp = keepOf(x.n); x.keep = kp; x.week = x.g;
    if (kp.freeze || kp.days >= 7 || x.sub === "pantry" || x.sub === "supp" || BULK.test(x.n)) { out.mon.push(x); continue; }
    const a = { ...x, g: 0, cnt: 0 }, b = { ...x, g: 0, cnt: 0 };
    for (const [di, v] of x.days) { const t = di < kp.days ? a : b; t.g += v.g; t.cnt += v.cnt; }
    if (a.g > 0) out.mon.push(a);
    if (b.g > 0) out.thu.push(b);
  }
  const pantry = S().pantry || {};
  const money4 = list => {
    const bySub = {}, useBySub = {}; let use = 0, pay = 0, est = 0;
    for (const x of list) {
      const c = cost(x);
      useBySub[x.sub] = (useBySub[x.sub] || 0) + c.use;
      if (x.sub !== "supp") use += c.use;
      if (!pantry[x.n]) { pay += c.pay; bySub[x.sub] = (bySub[x.sub] || 0) + c.pay; }
      if (c.est) est++;
    }
    return { use, pay, bySub, useBySub, est };
  };
  const list = out[which];
  const groups = SHOP_GROUPS.map(g => ({ ...g, items: list.filter(x => x.sub === g.id).sort((p, q) => q.g - p.g) })).filter(g => g.items.length);
  return { groups, list, mon: money4(out.mon), thu: money4(out.thu), cur: money4(list) };
}

function qty(x) {
  if (x.cnt) { const c = Math.ceil(x.cnt); return `${c} ${x.unit || "个"}<small>约 ${fmtG(x.g)}</small>`; }
  return fmtG(x.g) + (x.note ? `<small>${x.note}</small>` : "");
}
function fmtG(g) { return g >= 1000 ? `${r1(g / 1000)} kg` : `${g < 10 ? r1(g) : Math.ceil(g / 5) * 5} g`; }

export function renderShop(el) {
  const key = addDays(thisWeek(), 7 * wkSel);
  const { groups, list, mon, thu, cur } = buildShop(key, trip);
  const sh = S(); sh.bought = sh.bought || {}; sh.pantry = sh.pantry || {}; sh.receipts = sh.receipts || {};
  const k = x => `${key}:${trip}:${x.n}`;
  const buyable = list.filter(x => !sh.pantry[x.n] && !(x.sub === "pantry" && !PACKS[x.n]));
  const done = buyable.filter(x => sh.bought[k(x)]).length;
  const rc = sh.receipts[key + ":" + trip];
  const grocery = L().S.cats.find(c => c.id === "grocery");
  const gb = grocery ? catBudget(grocery) : 0, wkB = gb * 12 / 52;
  const c = calc(), gLeft = gb - (c.byC.grocery || 0);
  const tripDate = addDays(key, TRIPS.find(t => t.k === trip).day);
  el.innerHTML = `<div class="pagehead"><h1>采购</h1>
    <div class="seg2 big">${["本周", "下周"].map((t, i) => `<button data-act="swk" data-i="${i}" aria-pressed="${wkSel === i}">${t}<small>${fmtMD(addDays(thisWeek(), 7 * i))} 起</small></button>`).join("")}</div>
    <div class="seg2 big">${TRIPS.map(t => `<button data-act="trip" data-v="${t.k}" aria-pressed="${trip === t.k}">${t.name}<small>${fmtMD(addDays(key, t.day))}</small></button>`).join("")}</div>
  </div>
  ${!week(key) ? `<div class="notice">这周菜单还没排，清单是空的。先去菜单页点「随机生成」。</div>` : ""}
  <div class="shoptop">
    <div class="card">
      <h3>这次大概花多少</h3>
      <div class="bignum num">${money(cur.pay)}</div>
      <div class="hint">这周两次一共约 ${money(mon.pay + thu.pay)}（周一 ${money(mon.pay)} · 周四 ${money(thu.pay)}），按吃掉的量折算约 ${money(mon.use + thu.use)}，周预算 ${money(wkB)}。${cur.est ? ` 有 ${cur.est} 样没查到具体商品，按同类价格估的。` : ""}</div>
      <div class="hint mtop">超市这个月还剩 <b class="num ${gLeft < 0 ? "up" : ""}">${money(gLeft)}</b>。</div>
      ${rc ? `<div class="paidbox">已记账 ${money(rc.total)} <button class="linkbtn" data-act="unreceipt">撤销</button></div>`
        : `<button class="go mtop" data-act="receipt">买完了，按小票记账</button>`}
    </div>
    <div class="card">
      <h3>${trip === "mon" ? "周一买什么" : "周四补什么"}<small class="hint"> · 已勾 ${done} / ${buyable.length}</small></h3>
      <p class="hint">${trip === "mon"
        ? "耐放的一次买齐，米、燕麦这类整包买，家里还有就点「家里还有」。肉和鱼周一买，回家分装冷冻。放不到周末的蔬菜水果只买前几天的量。"
        : "只补放不到周末的新鲜东西：叶子菜、莓果、香蕉、牛油果这类。"}</p>
      <button class="btn" data-act="clearbought">清空勾选</button>
    </div>
  </div>
  <div class="shopgrid">${groups.length ? groups.map(g => `
    <section class="card group">${g.id === "pantry" ? `<details><summary><h3>${g.name}<small>${g.items.length} 样 · 点开看</small></h3></summary>` : `<h3>${g.name}<small>${g.items.length} 样</small></h3>`}
      ${g.items.map(x => {
        const kp = x.keep || keepOf(x.n), co = cost(x), pk = co.p, has = !!sh.pantry[x.n], isBulk = BULK.test(x.n) || x.sub === "supp";
        const canHave = isBulk || x.sub === "pantry";
        const weeks = pk && isBulk && !pk.o.cnt ? pk.o.size / Math.max(x.week, 1) : 0;
        return `<div class="item ${sh.bought[k(x)] || has ? "done" : ""}">
          <input type="checkbox" id="b-${esc(k(x))}" data-chg="buy" data-k="${esc(k(x))}" ${sh.bought[k(x)] ? "checked" : ""} ${has ? "disabled" : ""} aria-label="买了${esc(x.n)}">
          <span class="nm"><label for="b-${esc(k(x))}">${esc(x.n)}</label>
            ${pk ? `<span class="pk">${pk.o.loose ? esc(pk.o.l) : `${pk.n} × ${esc(pk.o.l)}`} · ${money(pk.pay)}</span>` : co.est ? `<span class="pk miss">按同类估 ${money(co.pay)}</span>` : ""}
            ${weeks ? `<span class="keep">一包够吃大约 ${weeks >= 10 ? Math.round(weeks) : r1(weeks)} 周</span>` : ""}
            ${kp.how && !isBulk && x.sub !== "pantry" ? `<span class="keep ${kp.freeze ? "frz" : ""}">${kp.freeze ? "冷冻 · " : kp.days < 60 ? `能放 ${kp.days} 天 · ` : ""}${esc(kp.how)}</span>` : ""}
            <span class="for">${[...x.from].slice(0, 3).map(esc).join("、")}${x.from.size > 3 ? " 等" : ""}</span>
            ${canHave ? `<button class="have" data-act="have" data-n="${esc(x.n)}" aria-pressed="${has}">${has ? "家里还有 ✓" : "家里还有"}</button>` : ""}
          </span>
          <span class="q">${has ? "这周不用买" : qty(x)}</span></div>`; }).join("")}
    ${g.id === "pantry" ? "</details>" : ""}</section>`).join("") : `<div class="empty">这次不用买东西。</div>`}</div>`;
}
actions.swk = el => { wkSel = +el.dataset.i; ui.rerender(); };
actions.trip = el => { trip = el.dataset.v; ui.rerender(); };
changes.buy = el => { const b = S().bought = S().bought || {}; if (el.checked) b[el.dataset.k] = 1; else delete b[el.dataset.k]; save(); ui.rerender(); };
actions.have = el => { const p = S().pantry = S().pantry || {}; if (p[el.dataset.n]) delete p[el.dataset.n]; else p[el.dataset.n] = 1; save(); ui.rerender(); };
actions.clearbought = () => {
  const key = addDays(thisWeek(), 7 * wkSel), pre = `${key}:${trip}:`, b = S().bought || {};
  for (const k of Object.keys(b)) if (k.startsWith(pre)) delete b[k];
  // 顺手清掉两周以前的勾选
  const old = addDays(thisWeek(), -14);
  for (const k of Object.keys(b)) if (k.slice(0, 10) < old) delete b[k];
  save(); ui.rerender();
};

/* ---------- 小票拆账 ---------- */
const SPLIT = [["meat", "肉蛋鱼虾"], ["veg", "蔬菜水果"], ["staple", "米面主食"], ["dairy", "奶和蛋白"], ["pantry", "调料罐头"], ["snack", "零食饮料"]];
actions.receipt = () => {
  const key = addDays(thisWeek(), 7 * wkSel);
  const { cur } = buildShop(key, trip);
  const est = cur.bySub;
  modal(`<form class="rcpt"><p class="mt">小票记账 · ${trip === "mon" ? "周一采购" : "周四补货"}</p>
    <label>小票总额 £<input name="total" type="number" step="0.01" min="0" inputmode="decimal" class="num big" placeholder="0.00"></label>
    <div class="flab mtop">清单上没有的，先单独填（没有就空着）</div>
    <div class="grid3">
      <label>零食饮料 £<input name="x_snack" type="number" step="0.01" min="0" inputmode="decimal"></label>
      <label>日用品 £<input name="x_home" type="number" step="0.01" min="0" inputmode="decimal"></label>
      <label>补剂 £<input name="x_supp" type="number" step="0.01" min="0" inputmode="decimal"></label>
    </div>
    <div class="flab mtop">剩下的按清单估价拆开，不对可以直接改</div>
    <div class="splits">${SPLIT.map(([id, n]) => `<label><span>${n}<small class="num">估 ${money(est[id] || 0)}</small></span><input name="s_${id}" type="number" step="0.01" min="0" inputmode="decimal" class="num"></label>`).join("")}</div>
    <div class="hint" id="rcHint"></div>
    <div class="two mtop"><button type="button" class="btn" data-close>取消</button><button class="go" type="submit">记下</button></div></form>`,
    (box, close) => {
      const f = box.querySelector("form");
      let touched = new Set();
      const val = n => parseFloat(f[n].value) || 0;
      const recompute = () => {
        const total = val("total"), extra = val("x_snack") + val("x_home") + val("x_supp");
        let rest = round2(total - extra);
        const fixed = SPLIT.filter(([id]) => touched.has(id));
        const free = SPLIT.filter(([id]) => !touched.has(id));
        rest = round2(rest - fixed.reduce((a, [id]) => a + val("s_" + id), 0));
        const w = free.reduce((a, [id]) => a + (est[id] || 0), 0);
        let acc = 0;
        free.forEach(([id], i) => {
          let v = w > 0 ? round2(rest * (est[id] || 0) / w) : (i === 0 ? rest : 0);
          if (i === free.length - 1) v = round2(rest - acc);
          acc = round2(acc + v);
          f["s_" + id].value = total ? Math.max(0, v).toFixed(2) : "";
        });
        const sum = SPLIT.reduce((a, [id]) => a + val("s_" + id), 0) + extra;
        const diff = round2(total - sum);
        $("#rcHint").innerHTML = total ? (Math.abs(diff) < 0.01 ? `合计对得上 ${money(total)}` : `<span class="up">还差 ${money(diff)} 没分出去</span>`) : "";
      };
      f.addEventListener("input", e => { const n = e.target.name; if (n.startsWith("s_")) touched.add(n.slice(2)); recompute(); });
      f.onsubmit = e => {
        e.preventDefault();
        const total = val("total"); if (!(total > 0)) { toast("先填小票总额"); return; }
        const note = `Tesco ${trip === "mon" ? "周一采购" : "周四补货"}`, meta = { receipt: key + ":" + trip }, eids = [];
        const mk = (cat, sub, v) => { if (v > 0) eids.push(addEntry({ amount: v, cat, sub, note, meta }).id); };
        for (const [id] of SPLIT) mk("grocery", id, val("s_" + id) + (id === "snack" ? val("x_snack") : 0));
        mk("grocery", "home", val("x_home"));
        mk("supp", "", val("x_supp"));
        S().receipts = S().receipts || {};
        S().receipts[key + ":" + trip] = { total, eids };
        save(); close(); ui.rerender(); toast(`记下了 ${money(total)}，拆成 ${eids.length} 笔`);
      };
    });
};
actions.unreceipt = () => {
  const key = addDays(thisWeek(), 7 * wkSel), rk = key + ":" + trip, rc = S().receipts?.[rk]; if (!rc) return;
  for (const id of rc.eids) removeEntry(id, true);
  saveDoc("ledger"); delete S().receipts[rk]; save(); ui.rerender(); toast("撤销了");
};
