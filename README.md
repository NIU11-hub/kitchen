# 子俊的厨房账本

菜单、食谱、采购、记账放在一起的自用网站。纯静态网页，放在 GitHub Pages 上；数据存在 Supabase。

- `index.html`、`app.css`、`*.js`：网站本身，入口是 `app.js`
- `config.js`：Supabase 地址和 publishable key（留空时是本地模式，数据只存在浏览器里）
- `seed-recipes.json`：食谱种子。某道菜的 `v` 调大，网站下次打开会用这里的版本覆盖云端那道
- `seed-docs.json`：第一次打开时的记账、菜单、采购初始数据
- `schema.sql`：Supabase 建表和权限

改完推到 main 分支，GitHub Pages 一两分钟后自动更新。

## 粘贴小票

记一笔 → 粘贴小票。Claude 识别小票后给一段导入码，粘进去预览、确认后一次记好，可以撤销。一次可粘多张。

```
{"d":"2026-09-28","s":"Tesco","p":"card","l":[["eat","mealdeal",3.85,"三明治 水"],["grocery","meat",8.40,"鸡胸肉"]]}
```

- `d` 日期，`s` 店名，`p` 付款（card / cash）
- `l` 每行 = [分类, 小类, 金额, 备注]，同一小类合并成一行；分类和小类写 id 或中文名都行
- 分类 id：grocery 超市（meat 肉蛋鱼虾 / veg 蔬菜水果 / staple 米面主食 / dairy 奶和蛋白 / pantry 调料罐头 / snack 零食饮料 / home 日用品）、eat 外食（party 聚餐 / mealdeal Meal Deal / coffee 咖啡外卖）、supp 补剂、trans 交通、phone 话费、fun 出门玩、other 其他
- 规则：即食的算外食·Meal Deal；折扣按实付摊到对应东西；袋子钱算超市·日用品；超市买的蛋白粉维生素算补剂
- 同一家店、同一天、同样总额的小票再粘会提醒可能重复

## Claude 直接记（inbox.json）

Claude 把识别好的账写进 `inbox.json` 推上来，网站打开（或切回页面）时自动记进账本，每批按 `id` 只记一次，记完弹提示可以撤销。

- `receipts`：和上面粘贴小票同样的格式
- `pay`：待付大额的名字（包含即可），标成已付；`payDate` 是付款日期
- 新的一批就在 `batches` 里加一项、换一个新 `id`，旧的批次留着也不会重复记
