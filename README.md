# 子俊的厨房账本

菜单、食谱、采购、记账放在一起的自用网站。纯静态网页，放在 GitHub Pages 上；数据存在 Supabase。

- `index.html`、`app.css`、`*.js`：网站本身，入口是 `app.js`
- `config.js`：Supabase 地址和 publishable key（留空时是本地模式，数据只存在浏览器里）
- `seed-recipes.json`：食谱种子。某道菜的 `v` 调大，网站下次打开会用这里的版本覆盖云端那道
- `seed-docs.json`：第一次打开时的记账、菜单、采购初始数据
- `schema.sql`：Supabase 建表和权限

改完推到 main 分支，GitHub Pages 一两分钟后自动更新。
