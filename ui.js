// 页面之间共用的：动作注册、重绘、路由状态
export const actions = {};      // data-act="xxx" -> fn(el, event)
export const changes = {};      // data-chg="xxx" -> fn(el, event)（change/input 事件）
export const ui = {
  tab: "today",
  sel: null,           // 食谱详情 id
  rerender: () => {},
  go: () => {},
};
