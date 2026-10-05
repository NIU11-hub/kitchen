// 今天：三餐、钱、下一趟采购
import { store } from "./store.js";
import { SLOTS, DAY, SPECIAL } from "./data.js";
import { esc, r0, f2, money, today, addDays, dow, fmtDay, fmtMD } from "./util.js";
import { actions, ui } from "./ui.js";
import { M, week, thisWeek, entryN, dayN, specialBox, generate, dayKindOf, noteOf, offOf, tonightTodo } from "./menu.js";
import { calc, heroCard, potHtml, monthEndBanner } from "./ledger.js";
import { buildShop, nextTrip } from "./shop.js";

export function renderToday(el) {
  const t = today(), di = dow(t), key = thisWeek(), m = M(), w = week(key);
  const d = w?.days[di] || {}, n = dayN(d);
  const kind = dayKindOf(key, di);
  const h = new Date().getHours();
  const hi = h < 5 ? "夜深了" : h < 11 ? "早上好" : h < 13 ? "中午好" : h < 18 ? "下午好" : "晚上好";
  const cls = m.classes?.[di] || [], note = noteOf(key, di);
  const c = calc();
  const nt = nextTrip(), shop = buildShop(nt.key, nt.trip.k), rc = store.docs.shop?.receipts?.[`${nt.key}:${nt.trip.k}`];
  const tripDate = addDays(nt.key, nt.trip.day), tripWhen = tripDate === t ? "今天" : tripDate === addDays(t, 1) ? "明天" : fmtMD(tripDate);
  const hasPot = store.docs.ledger.S.goals.some(g => !g.open);

  el.innerHTML = `<div class="pagehead"><div><h1>${hi}，子俊</h1><div class="subh">${fmtDay(t)} · ${kind === "不排" ? "今天不排菜单" : kind + "日"}${cls.length ? " · " + cls.map(esc).join("、") : ""}</div>${note ? `<div class="subh">${esc(note)}</div>` : ""}</div></div>
  ${monthEndBanner()}
  <div class="cols2">
    <div>
      <section class="card">
        <div class="cardh"><h3>今天吃什么</h3><button class="linkbtn" data-act="gomenu">去菜单改</button></div>
        ${w && !offOf(key, di) ? `<div class="todaymeals">${SLOTS.filter(s => !s.opt || d[s.k]).map(s => {
          const e = d[s.k], r = e && store.byId[e.r], en = entryN(e);
          const cu = e?.custom;
          return `<div class="tm"><span class="slot">${s.name}</span>
            <span class="dish">${cu ? `<span class="sp-tag">${esc(SPECIAL[cu.kind]?.label)}</span> ${esc(cu.name)} ${specialBox(key, di, s.k, cu, true)}`
              : r ? `<a href="#r-${esc(r.id)}" data-act="open" data-id="${esc(r.id)}"><span class="dot cat-${esc(r.cat)}"></span>${esc(r.name)}</a>${e.rice ? `<small>+米饭 ${e.rice}g</small>` : ""}${e.bread ? `<small>+恰巴塔 ${e.bread}g</small>` : ""}` : `<span class="hint">没排</span>`}</span>
            <span class="tmr-r"><span class="num-r">${en.kcal ? `${r0(en.kcal)} kcal · P ${r0(en.p)}` : ""}</span>
              ${!cu && e?.r && !s.opt && s.k !== "s" && s.k !== "n" ? `<button class="mini" data-act="eatout" data-w="${key}" data-d="${di}" data-k="${s.k}">改吃外面</button>` : ""}</span></div>`; }).join("")}</div>
          <div class="daysum num">合计 <b>${r0(n.kcal)}</b> / ${DAY.kcal} kcal · 蛋白 <b>${r0(n.p)}</b> / ${DAY.pLo}–${DAY.pHi} g</div>`
        : offOf(key, di) ? `<p class="hint">今天不排，自己看着吃。</p>` : `<div class="notice">今天还没排。<button class="go sm" data-act="gentrip" data-w="${key}">${di === 6 ? "随机排今天" : "随机排今天到周日"}</button></div>`}
      </section>
      ${tonightCard(t)}
      <section class="card mtop">
        <div class="cardh"><h3>下一趟采购：${tripWhen}（${nt.trip.name}）</h3><button class="linkbtn" data-act="goshop">看清单</button></div>
        ${!week(nt.key) ? `<p class="hint">${nt.key === key ? "这周" : "下周"}菜单还没排，排好才有清单。</p><button class="go sm" data-act="gentrip" data-w="${nt.key}">随机生成${nt.key === key ? "这周剩下几天的" : "下周"}菜单</button>`
          : rc ? `<p>这趟已经记账 <b class="num">${money(rc.total)}</b>。</p>`
          : `<p>要买 <b>${shop.buy.length}</b> 样新鲜的，大概 <b class="num">${money(shop.pay)}</b>。</p>
             ${shop.stockNeed.length ? `<p class="hint">这周要用的囤货：${shop.stockNeed.map(x => esc(x.n)).join("、")}。家里有的在采购页点「家里还有」。</p>` : ""}`}
      </section>
    </div>
    <div>
      <section class="card">${heroCard(c, false)}</section>
      ${hasPot ? `<h2>储蓄罐</h2><section class="card">${potHtml(true)}<button class="linkbtn mtop" data-act="goledger">去记账页存钱</button></section>` : ""}
    </div>
  </div>`;
}
// 今晚要做：今晚做好的午饭、要提前腌/泡的
function tonightCard(t) {
  const { cook, prep, morning } = tonightTodo(t);
  if (!cook.length && !prep.length && !morning.length) return "";
  const SN = Object.fromEntries(SLOTS.map(s => [s.k, s.name]));
  const when = d => d === addDays(t, 1) ? "明天" : d === addDays(t, 2) ? "后天" : fmtMD(d);
  const link = r => `<a href="#r-${esc(r.id)}" data-act="open" data-id="${esc(r.id)}"><span class="dot cat-${esc(r.cat)}"></span>${esc(r.name)}</a>`;
  const li = [
    ...cook.map(x => `<li>做好${when(x.eat)}起的午饭：${link(x.r)}，做 ${x.n} 份${x.n > 1 ? "，分盒冷藏" : ""}</li>`),
    ...prep.map(x => `<li>${link(x.r)}（${when(x.eat)}${SN[x.k]}${x.batch ? "，明晚做" : ""}）：${esc(x.r.prep.t)}${x.r.prep.mins ? `，约 ${x.r.prep.mins} 分钟` : ""}</li>`),
    ...morning.map(x => `<li>明早出门前：${link(x.r)}（${when(x.eat)}${SN[x.k]}）：${esc(x.r.prep.t)}</li>`),
  ];
  return `<section class="card mtop"><div class="cardh"><h3>今晚要做</h3></div><ul class="todo">${li.join("")}</ul></section>`;
}
actions.gomenu = () => ui.go("menu");
actions.goshop = () => ui.go("shop");
actions.goledger = () => ui.go("ledger");
actions.gentrip = el => { generate(el.dataset.w); ui.rerender(); };
