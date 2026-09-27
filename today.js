// 今天：三餐、钱、快速记一笔
import { store } from "./store.js";
import { SLOTS, DAYS, DAY, SPECIAL, TRIPS } from "./data.js";
import { esc, r0, f2, money, today, addDays, dow, fmtDay } from "./util.js";
import { actions, ui } from "./ui.js";
import { M, week, thisWeek, entryN, dayN, specialBox, generate } from "./menu.js";
import { L, calc, heroCard, addForm } from "./ledger.js";
import { buildShop } from "./shop.js";

export function renderToday(el) {
  const t = today(), di = dow(t), key = thisWeek(), m = M(), w = week(key);
  const d = w?.days[di] || {}, n = dayN(d);
  const train = (m.train || [0, 1, 3, 4]).includes(di);
  const h = new Date().getHours();
  const hi = h < 5 ? "夜深了" : h < 11 ? "早上好" : h < 13 ? "中午好" : h < 18 ? "下午好" : "晚上好";
  const cls = m.classes?.[di] || [], note = m.dayNotes?.[di];
  const c = calc();
  const mon = addDays(key, 0);
  let wk = 0; for (const x of L().E) if (x.date >= mon && x.date <= t && x.cat !== "__save" && x.cat !== "__take" && x.cat !== "__one") wk += +x.amount || 0;
  const nextTrip = TRIPS.find(tr => tr.day >= di) || TRIPS[0];
  const tripKey = nextTrip.day >= di ? key : addDays(key, 7);
  const shop = buildShop(tripKey, nextTrip.k);
  const rc = store.docs.shop?.receipts?.[tripKey + ":" + nextTrip.k];
  const unpaid = L().S.ones.filter(o => !o.paid);

  el.innerHTML = `<div class="pagehead"><div><h1>${hi}，子俊</h1><div class="subh">${fmtDay(t)} · ${train ? "训练日" : di === 5 ? "有氧日" : "休息日"}${cls.length ? " · " + cls.map(esc).join("、") : ""}</div>${note ? `<div class="subh">${esc(note)}</div>` : ""}</div></div>
  <div class="cols2">
    <div>
      <section class="card">
        <div class="cardh"><h3>今天吃什么</h3><button class="linkbtn" data-act="gomenu">去菜单改</button></div>
        ${w ? `<div class="todaymeals">${SLOTS.map(s => {
          const e = d[s.k], r = e && store.byId[e.r], en = entryN(e);
          return `<div class="tm"><span class="slot">${s.name}</span>
            <span class="dish">${e?.custom ? `<span class="sp-tag">${esc(SPECIAL[e.custom.kind]?.label)}</span> ${esc(e.custom.name)} ${specialBox(key, di, s.k, e.custom, true)}`
              : r ? `<a href="#r-${esc(r.id)}" data-act="open" data-id="${esc(r.id)}"><span class="dot cat-${esc(r.cat)}"></span>${esc(r.name)}</a>${e.rice ? `<small>+米饭 ${e.rice}g</small>` : ""}` : `<span class="hint">没排</span>`}</span>
            <span class="num-r">${en.kcal ? `${r0(en.kcal)} kcal · P ${r0(en.p)}` : ""}</span></div>`; }).join("")}</div>
          <div class="daysum num">合计 <b>${r0(n.kcal)}</b> / ${DAY.kcal} kcal · 蛋白 <b>${r0(n.p)}</b> / ${DAY.pLo}–${DAY.pHi} g</div>`
        : `<div class="notice">这周菜单还没排。<button class="go sm" data-act="genhome">随机生成这周</button></div>`}
      </section>
      <section class="card mtop">
        <div class="cardh"><h3>下次采购：${nextTrip.name}</h3><button class="linkbtn" data-act="goshop">看清单</button></div>
        ${shop && !week(tripKey) ? `<p class="hint">${tripKey === key ? "这周" : "下周"}菜单还没排，排好才有清单。</p><button class="go sm" data-act="gentrip" data-w="${tripKey}">随机生成${tripKey === key ? "这周" : "下周"}菜单</button>` : shop ? `<p>大概 <b class="num">${money(shop.cur.pay)}</b>，${shop.list.length} 样。${rc ? `已记账 ${money(rc.total)}。` : "买完在采购页按小票记账。"}</p>` : `<p class="hint">排好菜单才有清单。</p>`}
        ${unpaid.length ? `<p class="hint">还有 ${unpaid.length} 笔大额没付：${unpaid.map(o => esc(o.n) + " £" + f2(o.a)).join("、")}</p>` : ""}
      </section>
    </div>
    <div>
      <section class="card">${heroCard(c, false)}<div class="hint mtop">这周花了 <b class="num">£${f2(wk)}</b></div></section>
      <h2>记一笔</h2>
      <section class="card">${addForm(true)}</section>
    </div>
  </div>`;
}
actions.gomenu = () => ui.go("menu");
actions.goshop = () => ui.go("shop");
actions.genhome = () => { generate(thisWeek()); ui.rerender(); };
actions.gentrip = el => { generate(el.dataset.w); ui.rerender(); };
