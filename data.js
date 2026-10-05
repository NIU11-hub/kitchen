// 固定数据：饮食目标、餐次、记账分类、Tesco 价格、保存天数

export const DAY = { kcal: 2900, pLo: 155, pHi: 190, c: 390, f: 80 };

export const SLOTS = [
  { k: "b", name: "早餐", t: { kcal: 750, p: 40 } },
  { k: "l", name: "午餐", t: { kcal: 870, p: 60 }, rice: true },
  { k: "s", name: "练后", hint: "休息日下午吃", t: { kcal: 260, p: 25 } },
  { k: "d", name: "晚餐", t: { kcal: 850, p: 48 }, rice: true },
  { k: "n", name: "睡前", t: { kcal: 170, p: 15 } },
  { k: "x", name: "甜品", opt: true, hint: "想吃了再加", t: { kcal: 0, p: 0 } },   // 自动排菜不碰，空着时首页不显示
];
export const SLOT_BY_NAME = Object.fromEntries(SLOTS.map(s => [s.name, s]));
export const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export const CATS = ["早餐", "平日备餐", "家常菜", "面食", "配菜", "加餐", "甜品"];
export const PROS = ["鸡", "牛", "猪", "鱼虾", "蛋"];
export const DIFFS = ["简单", "中等", "费事"];
export const RICE = { n: "熟米饭", kcal: 130, p: 2.7, c: 28.2, f: 0.3 };
// 早餐热量不够时配面包，不配米饭（Aldi Ciabatta Rolls 每 100g 的数）
export const BREAD = { n: "恰巴塔", kcal: 267, p: 10.4, c: 49.4, f: 2.4 };

// 早餐怎么排（2026-10-05 子俊定的）：
// 工作日基本吃英式早餐，焗豆一罐吃两顿所以排相邻两天，其余是面包版；
// 牛油果鸡蛋沙拉一次做两份，排在相邻两天；周末从三明治、北非蛋里挑。
export const BF = {
  bread: "en-breakfast-bread",
  beans: "en-breakfast-beans",
  pair: ["dy-avocado-egg-salad"],
  weekend: ["dy-chicken-ciabatta", "dy-beef-egg-ciabatta", "dy-chipotle-sandwich", "shakshuka"],
};

// 菜单里的特殊格子。聚餐的钱吃完再填；Meal Deal 固定 £4
export const SPECIAL = {
  eatout: { label: "出去聚餐", cat: "social", presets: [
    { name: "中餐聚餐（几个菜配米饭）", kcal: 1100, p: 50, c: 110, f: 50 },
    { name: "火锅", kcal: 1300, p: 60, c: 80, f: 80 },
    { name: "烤肉（韩式或日式）", kcal: 1200, p: 70, c: 70, f: 65 },
    { name: "日料寿司", kcal: 900, p: 45, c: 120, f: 25 },
    { name: "汉堡加薯条", kcal: 1200, p: 40, c: 120, f: 60 },
    { name: "披萨（半个大号）", kcal: 1100, p: 45, c: 130, f: 45 },
  ] },
  mealdeal: { label: "Tesco Meal Deal", cat: "food", cost: 4, presets: [
    { name: "鸡肉三明治 + 蛋白小盒 + 无糖饮料", kcal: 550, p: 43, c: 41, f: 22 },
    { name: "鸡肉卷饼 + 薯片 + 零度可乐", kcal: 620, p: 30, c: 62, f: 26 },
    { name: "鸡肉意面沙拉 + 水果杯 + 奶昔", kcal: 760, p: 34, c: 96, f: 24 },
  ] },
  custom: { label: "外卖 / 其他", cat: "food", presets: [{ name: "自己填", kcal: 600, p: 30, c: 60, f: 20 }] },
};

// 记账分类（2026-09-29 起只分五类）。id 固定，采购记账和菜单外食靠这些 id 对上
export const LEDGER_CATS = [
  { id: "food", n: "吃饭" },    // 超市正经食材、水、日用品、Meal Deal、外卖正餐
  { id: "snack", n: "零食" },   // 糖、巧克力、奶昔、可乐、奶茶、咖啡
  { id: "social", n: "人情" },  // 请客、礼物、聚餐、跟朋友出去玩：可以不花的
  { id: "trans", n: "交通" },
  { id: "phone", n: "话费" },
  { id: "other", n: "其他" },   // 补剂、衣服护肤、药
];

// 采购清单分组 = 超市小类（列表里能自动算的那几类）
export const SHOP_GROUPS = [
  { id: "meat", name: "肉蛋鱼虾" }, { id: "veg", name: "蔬菜水果" }, { id: "staple", name: "米面主食" },
  { id: "dairy", name: "奶和蛋白" }, { id: "snack", name: "坚果零食" }, { id: "pantry", name: "调料罐头（家里有就不用买）" },
  { id: "supp", name: "补剂（不算超市预算）" },
];

const SKIP = /^(清水|水|冰水|开水|温水|热水|热油|无菌蛋黄)$/;
export function ingSub(n) {
  if (SKIP.test(n)) return null;
  if (/蛋白粉/.test(n)) return "supp";
  if (/淡奶油|鲜奶油|奶油奶酪/.test(n)) return "dairy";   // 名字以「油」结尾但是冷藏的奶
  if (/面粉|玉米粉|河粉/.test(n)) return "staple";
  if (/抽$|腌料|酒酿|罐头|高汤|鸡汤|蛋黄酱|沙拉酱|酱$|酱油|酱黄芥末|豆瓣|味噌|味淋|鱼露|豉|腐乳|南乳|调料包|咖喱|醋|料酒|清酒|米酒|酒$|葡萄酒|白兰地|啤酒|可乐|淀粉|粉$|粉\/|粉和|粉孜然|粉蒜粉|糖|蜂蜜|桂花蜜|盐|胡椒|孜然|花椒|八角|桂皮|香叶|香草|迷迭香|百里香|罗勒|薄荷|莳萝|芝麻|油$|香料|酵母|泡打粉|小苏打|吉利丁|辣椒面|辣皮子|干辣椒|番茄膏|番茄泥|番茄沙司|番茄酱|椰浆|陈皮|五指毛桃|芥末|紫菜|海带芽|虾皮|干香菇|木耳|奇亚籽|代糖/.test(n)) return "pantry";
  if (/巧克|黑巧|奥利奥|坚果|核桃|花生米|蔓越莓/.test(n)) return "snack";
  if (/奶|酸奶|芝士|奶酪|马苏里拉|帕玛森|切达|格吕耶尔|黄油|菲达|酒酿/.test(n)) return "dairy";
  if (/鸡(?!汤)|鸭|牛|猪|五花|排骨|肋排|梅花|培根|腊肉|火腿|烤肠|叉烧|虾|三文鱼|鳕|白鱼|鱿鱼|鱼|蛋|鹌鹑/.test(n)) return "meat";
  if (/焗豆|米$|大米|米饭|燕麦|面$|面条|面粉|乌冬|意面|河粉|粉丝|面包|欧包|恰巴塔|法棍|卷饼|塔饼|饺子皮|藜麦|土豆|红薯|紫薯|玉米粉|小米|黑米|红豆|拉面|方便面|面饼/.test(n)) return "staple";
  return "veg";
}

// 名字不同但买的是同一样东西，统一到有价格的那个名字
const NORM = [
  [/^熟米饭$|^隔夜米饭$/, "大米（生）", 1 / 2.5, "按熟重 ÷ 2.5 换算"],
  [/^熟藜麦$/, "藜麦（生）", 1 / 3, "按熟重 ÷ 3 换算"],
  [/^大米$/, "大米（生）"],
  [/^(三色)?藜麦(\(生\))?$/, "藜麦（生）"],
  [/鸡胸/, "鸡胸肉"],
  [/^(去皮|去骨|去皮去骨)?鸡腿(肉|排|块)?$|^去骨鸡腿(肉|排)$/, "去皮鸡腿肉"],
  [/^(炖)?牛肉块$|^牛肉丁$/, "炖牛肉块（diced beef）"],
  [/^整块炖牛肉/, "整块炖牛肉（braising steak）"],
  [/^牛肉末|^牛肉馅/, "牛肉末（5% 脂肪）"],
  [/^牛排$|西冷/, "牛排（西冷）"],
  [/^瘦牛肉|^牛肉丝$|^牛肉薄片$|^生牛里脊片$|^牛里脊$/, "瘦牛肉"],
  [/^(瘦)?猪肉末$|^五花肉末$/, "瘦猪肉末"],
  [/^排骨$|^猪小排$|^精肋排$/, "猪小排"],
  [/^梅花肉$/, "梅花肉"],
  [/^(生)?虾仁$|^大虾$|^基围虾$/, "生虾仁"],
  [/^三文鱼/, "三文鱼"],
  [/鳕鱼|^白鱼/, "白鱼（鳕鱼）"],
  [/^鸡蛋$|^(水煮|煮鸡|白煮|溏心|温泉|煎)蛋$/, "鸡蛋"],
  [/^(热)?牛奶$/, "牛奶"],
  [/^燕麦(片)?$/, "燕麦"],
  [/^欧包$|酸面包$/, "欧包"],
  [/^乌冬面$/, "乌冬面"],
  [/^紫薯$|^红薯$/, "紫薯"],
  [/^土豆$/, "土豆"],
  [/^西兰花$/, "西兰花"],
  [/^洋葱$|^白洋葱$|^洋葱碎$|^洋葱或大葱$/, "洋葱"],
  [/^红洋葱$|^紫洋葱$|^红葱头$|^洋葱或红葱头$/, "洋葱或红葱头"],
  [/^羽衣甘蓝/, "羽衣甘蓝"],
  [/^紫甘蓝$/, "紫甘蓝"],
  [/^大白菜$|^白菜$|^娃娃菜$/, "大白菜"],
  [/^小番茄$|^圣女果$/, "小番茄"],
  [/^黄瓜$/, "黄瓜"],
  [/^彩椒$|^红甜椒$|^红黄彩椒$/, "红甜椒"],
  [/^青椒|^青红椒|^青红辣椒$/, "青椒"],
  [/^生菜/, "生菜"],
  [/^苹果$/, "苹果"],
  [/香蕉/, "香蕉"],
  [/蓝莓|莓果/, "蓝莓"],
  [/^牛油果$/, "牛油果"],
  [/^南瓜$/, "南瓜"],
  [/^蒜$|^大蒜$|^蒜(末|泥|片|瓣|蓉)$/, "蒜"],
  [/^(小)?葱(花|段|丝)?$|^大葱(花)?$/, "葱"],
  [/^番茄罐头/, "番茄罐头（切块）"],
  [/^鹰嘴豆/, "鹰嘴豆（罐头沥干）"],
  [/^菲达/, "菲达奶酪"],
  [/^坚果/, "坚果"],
  [/黑巧/, "黑巧克力"],
  [/^蛋白粉$/, "蛋白粉"],
];
export function shopName(n) {
  if (SKIP.test(n)) return null;
  for (const [re, to, f, note] of NORM) if (re.test(n)) return { n: to, f: f || 1, note: note || "" };
  return { n, f: 1, note: "" };
}

// Tesco 官网 2026-09-26 查的原价（不含 Clubcard 价）。size 单位是克，cnt 表示按个数卖
export const PACKS = {
  "鸡胸肉": [{ l: "Tesco British Chicken Breast Fillets 1kg", size: 1000, price: 6.69 }, { l: "Tesco British Chicken Breast Fillets 650g", size: 650, price: 4.90 }, { l: "Tesco British Chicken Breast Fillets 350g", size: 350, price: 2.67 }],
  "去皮鸡腿肉": [{ l: "Tesco British Chicken Thigh Fillets 1kg", size: 1000, price: 7.25 }, { l: "Tesco British Chicken Thigh Fillets 600g", size: 600, price: 5.75 }],
  "瘦牛肉": [{ l: "Tesco Beef Stir Fry Strips 357g", size: 357, price: 6.40 }],
  "瘦牛肉片": [{ l: "Tesco Beef Stir Fry Strips 357g", size: 357, price: 6.40 }],
  "牛排（西冷）": [{ l: "Tesco Beef Rump Steak 255g", size: 255, price: 4.39 }],
  "牛肉末（5% 脂肪）": [{ l: "Tesco Lean Beef Steak Mince 5% 750g", size: 750, price: 7.09 }, { l: "Tesco Lean Beef Steak Mince 5% 500g", size: 500, price: 5.05 }, { l: "Tesco Lean Beef Steak Mince 5% 250g", size: 250, price: 2.55 }],
  "牛排骨和牛肋条": [{ l: "Tesco Finest Short Ribs 1.1kg", size: 1100, price: 20.02 }],
  "梅花肉": [{ l: "Tesco Pork Shoulder Steaks 1kg", size: 1000, price: 8.50 }, { l: "Tesco Pork Shoulder Steaks 700g", size: 700, price: 6.15 }],
  "猪小排": [{ l: "Tesco Pork Ribs 700g", size: 700, price: 5.75 }],
  "瘦猪肉末": [{ l: "Tesco Lean Pork Mince 5% Fat 500g", size: 500, price: 2.49 }],
  "生虾仁": [{ l: "Tesco Raw King Prawns 170g", size: 170, price: 3.40 }],
  "三文鱼": [{ l: "Tesco 2 Boneless Salmon Fillets 260g", size: 260, price: 4.90 }, { l: "Tesco Boneless Salmon Fillet 130g", size: 130, price: 3.00 }],
  "白鱼（鳕鱼）": [{ l: "Bay Fishmongers White Fish Fillets 520g（冷冻）", size: 520, price: 2.30 }],
  "鸡蛋": [{ l: "Tesco Mixed Sized Free Range Eggs 15 Pack", cnt: 15, price: 2.85 }, { l: "Tesco Medium Free Range Eggs 12 Pack", cnt: 12, price: 2.85 }],
  "牛奶": [{ l: "Tesco British Whole Milk 4 Pints 2.272L", size: 2272, price: 1.65 }, { l: "Tesco British Whole Milk 2 Pints 1.13L", size: 1130, price: 1.20 }],
  "大米（生）": [{ l: "Tesco Easy Cook Long Grain Rice 4kg", size: 4000, price: 4.75 }, { l: "Tesco Easy Cook Long Grain Rice 2kg", size: 2000, price: 2.50 }],
  "燕麦": [{ l: "Grower's Harvest Porridge Oats 1kg", size: 1000, price: 0.85 }],
  "欧包": [{ l: "Tesco Finest White Sourdough Loaf 400g", size: 400, price: 2.00 }],
  "乌冬面": [{ l: "Tesco Straight To Wok Udon Noodles 300g", size: 300, price: 1.00 }],
  "藜麦（生）": [{ l: "Tesco Quinoa 300g", size: 300, price: 3.10 }],
  "紫薯": [{ l: "Tesco Sweet Potatoes 1kg（Tesco 没有紫薯，用红薯）", size: 1000, price: 1.19 }],
  "土豆": [{ l: "Tesco All Rounder Potatoes 2kg", size: 2000, price: 1.32 }],
  "西兰花": [{ l: "Tesco Broccoli 375g", size: 375, price: 0.90 }, { l: "Tesco Large Broccoli Pack 500g", size: 500, price: 1.20 }, { l: "Tesco Frozen Broccoli Florets 900g", size: 900, price: 1.07 }],
  "洋葱": [{ l: "Tesco Brown Onions 1kg", size: 1000, price: 0.95 }, { l: "Tesco Brown Onions 3 Pack", size: 450, price: 0.95 }],
  "洋葱或红葱头": [{ l: "Tesco Red Onions 1kg", size: 1000, price: 0.95 }],
  "羽衣甘蓝": [{ l: "Tesco Curly Kale 180g", size: 180, price: 0.80 }],
  "紫甘蓝": [{ l: "Tesco Red Cabbage 1 个（约 900g）", size: 900, price: 0.89 }],
  "大白菜": [{ l: "Tesco Chinese Leaf 1 颗（约 800g）", size: 800, price: 1.45 }],
  "小番茄": [{ l: "Nightingale Farms Cherry Tomatoes 250g", size: 250, price: 0.62 }],
  "黄瓜": [{ l: "Tesco Whole Cucumber 1 根（约 350g）", size: 350, price: 0.99 }],
  "红甜椒": [{ l: "Tesco Red Pepper 1 个（约 160g）", size: 160, price: 0.70 }],
  "青椒": [{ l: "Tesco Green Pepper 1 个（约 160g）", size: 160, price: 0.70 }],
  "生菜": [{ l: "Tesco Iceberg Lettuce 1 颗（约 500g）", size: 500, price: 0.89 }, { l: "Tesco Little Gem Twin Pack（约 200g）", size: 200, price: 0.77 }],
  "苹果": [{ l: "Rosedene Farms Gala Apples 6 Pack（约 900g）", size: 900, price: 1.59 }],
  "香蕉": [{ l: "Tesco Bananas Loose（按重量买）", loose: true, size: 1000, price: 0.90 }],
  "蓝莓": [{ l: "Rosedene Farms Blueberries 150g", size: 150, price: 1.55 }, { l: "Tesco Blueberries 500g", size: 500, price: 4.30 }],
  "牛油果": [{ l: "Tesco Ripe & Ready Avocado 1 个（约 170g）", size: 170, price: 0.69 }],
  "南瓜": [{ l: "Tesco Butternut Squash 1 个（约 1kg）", size: 1000, price: 1.50 }],
  "蒜": [{ l: "Tesco Garlic 4 Pack（约 200g）", size: 200, price: 0.87 }],
  "葱": [{ l: "Tesco Bunched Spring Onions 100g", size: 100, price: 0.69 }],
  "番茄罐头（切块）": [{ l: "Grower's Harvest Chopped Tomatoes 400g", size: 400, price: 0.43 }],
  "鹰嘴豆（罐头沥干）": [{ l: "Tesco Chickpeas In Water 400g（沥干约 240g）", size: 240, price: 0.41 }],
  "菲达奶酪": [{ l: "Tranos Greek Feta 200g", size: 200, price: 1.69 }],
  "坚果": [{ l: "Tesco Mixed Nuts 500g", size: 500, price: 5.25 }, { l: "Tesco Unsalted Mixed Nuts 200g", size: 200, price: 2.50 }],
  "黑巧克力": [{ l: "Lindt Excellence 70% Dark Chocolate 100g", size: 100, price: 3.50 }],
  "蛋白粉": [{ l: "Applied Nutrition Critical Whey 825g", size: 825, price: 25.00 }],
  "食用油": [{ l: "Tesco Pure Vegetable Oil 1L", size: 920, price: 1.45 }],
  // 下面三样是 2026-10-05 查的 Aldi 官网价
  "培根": [{ l: "Aldi Everyday Essentials Smoked Back Bacon 288g", size: 288, price: 1.25 }],
  "焗豆": [{ l: "Aldi Everyday Essentials Baked Beans 410g", size: 410, price: 0.27 }],
  "恰巴塔": [{ l: "Aldi Inspired Cuisine Ciabatta Rolls 4 个（每个按 80g 估）", size: 320, price: 1.29 }],
};
// 没查到具体商品时按同类大致每公斤价格估算（不是查来的，只用来拆账和估预算）
export const EST_PER_KG = { meat: 9, veg: 2.5, staple: 2, dairy: 5, snack: 8, pantry: 0, supp: 30 };

export const BULK = /^(大米（生）|燕麦|蛋白粉|坚果|食用油|藜麦（生）)$/;

export const KEEP = {
  "西兰花": [5, "冷藏"], "生菜": [4, "冷藏，用厨房纸包着"], "羽衣甘蓝": [5, "冷藏"], "紫甘蓝": [14, "冷藏"],
  "大白菜": [10, "冷藏"], "小番茄": [7, "常温"], "黄瓜": [6, "冷藏"], "红甜椒": [7, "冷藏"], "青椒": [7, "冷藏"],
  "洋葱": [30, "常温阴凉处"], "洋葱或红葱头": [30, "常温阴凉处"], "葱": [5, "冷藏"],
  "姜": [21, "冷藏"], "蒜": [30, "常温"], "苹果": [21, "冷藏"], "梨": [10, "冷藏"], "香蕉": [4, "常温，别进冰箱"], "蓝莓": [5, "冷藏，吃前再洗"],
  "牛油果": [4, "常温放熟，熟了进冷藏"], "南瓜": [30, "整个常温放"], "紫薯": [14, "常温阴凉处"], "土豆": [21, "阴凉避光"], "欧芹": [5, "冷藏"],
  "鸡蛋": [21, "冷藏"], "牛奶": [7, "冷藏，开了 3 天内喝完"], "菲达奶酪": [7, "冷藏"], "乌冬面": [30, "常温"],
  "香菜": [5, "冷藏"], "番茄": [6, "常温"], "大番茄": [6, "常温"], "蘑菇": [5, "冷藏"], "西葫芦": [7, "冷藏"], "茄子": [6, "冷藏"],
  "胡萝卜": [21, "冷藏"], "芹菜": [10, "冷藏"], "西芹": [10, "冷藏"], "豆芽": [2, "冷藏，尽快吃"], "黄豆芽": [2, "冷藏，尽快吃"],
  "包菜": [14, "冷藏"], "娃娃菜": [7, "冷藏"], "柠檬": [14, "冷藏"], "希腊酸奶": [10, "冷藏"], "酸奶": [10, "冷藏"],
};
// 小冰箱：一周三次，每次只买两三天的量
export const TRIPS = [
  { k: "mon", name: "周一采购", day: 0, days: [0, 1] },
  { k: "wed", name: "周三采购", day: 2, days: [2, 3] },
  { k: "fri", name: "周五采购", day: 4, days: [4, 5, 6] },
];
export const tripOf = di => TRIPS.find(t => t.days.includes(di));
