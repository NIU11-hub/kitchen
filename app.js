import { store, initStore, onChange } from "./store.js";
import { $, $$, bindToast } from "./util.js";
import { actions, changes, ui } from "./ui.js";
import { renderToday } from "./today.js";
import { renderMenu, migrateMenu, migrateWeek } from "./menu.js";
import { renderRecipes, submitRecipe } from "./recipes.js";
import { renderShop } from "./shop.js";
import { renderLedger, submitAdd, submitReceipt, migrateLedger, applyInbox } from "./ledger.js";

const PAGES = { today: renderToday, menu: renderMenu, recipes: renderRecipes, shop: renderShop, ledger: renderLedger };
const NAV = [["today", "今天"], ["menu", "菜单"], ["recipes", "食谱"], ["shop", "采购"], ["ledger", "记账"]];

function render() {
  $$("[data-nav]").forEach(b => b.setAttribute("aria-current", b.dataset.nav === ui.tab ? "page" : "false"));
  const y = window.scrollY;
  try { PAGES[ui.tab]($("#view")); }
  catch (e) { console.error(e); $("#view").innerHTML = `<div class="notice bad">这个页面出错了：${e.message}。刷新一下试试，还不行截图发给 Claude。</div>`; }
  window.scrollTo(0, y);
}
ui.rerender = render;
ui.go = (tab, sel = null) => {
  ui.tab = tab; ui.sel = sel;
  try { history.replaceState(null, "", "#" + (sel ? "r-" + sel : tab)); } catch (e) {}
  render(); window.scrollTo(0, 0);
};
function fromHash() {
  const h = (location.hash || "").slice(1);
  if (h.startsWith("r-")) { ui.tab = "recipes"; ui.sel = h.slice(2); }
  else if (PAGES[h]) { ui.tab = h; ui.sel = null; }
}

function status() {
  $$(".sync").forEach(el => { el.textContent = store.status; el.className = "sync " + (store.statusCls || ""); });
}

document.addEventListener("click", e => {
  const nav = e.target.closest("[data-nav]");
  if (nav) { e.preventDefault(); ui.go(nav.dataset.nav); return; }
  const a = e.target.closest("[data-act]");
  if (a && actions[a.dataset.act]) { if (a.tagName === "A") e.preventDefault(); actions[a.dataset.act](a, e); }
});
document.addEventListener("change", e => { const el = e.target.closest("[data-chg]"); if (el && el.dataset.chg !== "q" && changes[el.dataset.chg]) changes[el.dataset.chg](el, e); });
// 中文输入法拼字的时候不刷新页面，选好字（compositionend）再搜，不然拼音会被打断
document.addEventListener("input", e => { const el = e.target.closest("[data-chg=q]"); if (el && !e.isComposing) changes.q(el, e); });
document.addEventListener("compositionend", e => { const el = e.target.closest?.("[data-chg=q]"); if (el) changes.q(el, e); });
document.addEventListener("submit", e => {
  const f = e.target;
  if (f.dataset.form === "add") { e.preventDefault(); submitAdd(f); }
  if (f.dataset.form === "rc") { e.preventDefault(); submitReceipt(); }
  if (f.dataset.form === "recipe") { e.preventDefault(); submitRecipe(f); }
});
window.addEventListener("hashchange", () => { fromHash(); render(); });

const ICON = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  menu: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  recipes: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  shop: '<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  ledger: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
};
$("#nav").innerHTML = NAV.map(([k, n]) => `<a href="#${k}" data-nav="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg><span>${n}</span></a>`).join("");
bindToast();
document.body.insertAdjacentHTML("beforeend", `<button class="fab" data-act="openadd" aria-label="记一笔"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>记一笔</span></button>`);
onChange(what => {
  if (what === "status") { status(); return; }
  if (what === "ledger" || what === "all") migrateLedger();
  if (what === "menu" || what === "all") { migrateMenu(); migrateWeek(); }
  // 正在打字的时候别把输入框刷掉
  const ae = document.activeElement;
  if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) && ae.closest("#view") && what !== "all") return;
  render();
});

(async () => {
  fromHash();
  try { await initStore(); }
  catch (e) { console.error(e); $("#view").innerHTML = `<div class="notice bad">数据没加载出来：${e.message}</div>`; return; }
  migrateLedger(); migrateMenu(); migrateWeek();
  status(); render();
  applyInbox();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") applyInbox(); });
})();
