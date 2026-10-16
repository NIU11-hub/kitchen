// 素日的训练计划。4 周一个周期：第 1、3 周是单周，第 2 周是双周，第 4 周减量（按双周练，重量九折、每个动作少一组）。
// 一个位置写成 [单周, 双周] 就是隔周轮换；只写一个就每周都一样（主项固定，方便看进步）。
// w 起始重量（kg，哑铃写单只），r 次数，s 组数；step 做满两次后加多少，drop 连续两次没做满退多少。
// main: 主项，带热身组（按目标重量的比例算，0 表示空杆 20kg）。from: 只看这天之后的记录算进度（换计划时重新起步）。
// bw: 自重或计时动作，做满了加 inc（默认 1），最多到 max（默认 12）。u: 次数的单位（米、秒）；each: 每侧。
// 辅助动作同一个 id 共用记录：上周实际练到多少，这次就接着多少。
export const START = "2026-10-19";   // 新计划第 1 周的周一
export const SWITCH = "2026-10-16";  // 从这天起按新计划练（10-16 到 10-18 按单周先练）

const UP = 2.5, LOW = 5, DB = 2;
const RAMP = [[0,10],[.5,5],[.7,3],[.85,1]];

// 腿日两天共用的附项
const legext  = { id:"legext", n:"腿屈伸", w:45, r:12, s:2, rest:60, step:LOW, drop:5, alt:[["单腿腿屈伸",20,12,2]] };
const legcurl = { id:"legcurl", n:"坐姿腿弯举", w:45, r:12, s:2, rest:60, step:LOW, drop:5, alt:[["俯卧腿弯举",40,12,2]] };
const deadbug = { id:"deadbug", n:"死虫", w:0, r:10, s:2, rest:45, step:0, drop:0, bw:true, max:15, each:true, alt:[["鸟狗",0,10,2]] };

export const PLAN = {
  upA: {
    name: "上肢 A", mins: 60,
    warm: ["划船机　5 分钟", "弹力带肩外旋　2 × 15"],
    ex: [
      { id:"bench", n:"卧推", w:90, r:5, s:3, rest:180, step:UP, drop:5, main:true, ramp:RAMP, from:SWITCH,
        alt:[["史密斯卧推",80,6,3],["哑铃卧推",34,8,3]] },
      [ { id:"csdbrow", n:"胸托哑铃划船", w:26, r:10, s:3, rest:120, step:DB, drop:DB*2, alt:[["器械划船",70,10,3],["单臂哑铃划船",30,10,3]] },
        { id:"pulldown", n:"高位下拉", w:60, r:10, s:3, rest:120, step:LOW, drop:5, alt:[["器械下拉",60,10,3]] } ],
      [ { id:"latraise", n:"哑铃侧平举", w:10, r:15, s:2, rest:60, step:DB, drop:DB, alt:[["绳索侧平举",7.5,15,2]] },
        { id:"cablelat", n:"绳索侧平举", w:7.5, r:15, s:2, rest:60, step:UP, drop:UP, alt:[["哑铃侧平举",10,15,2]] } ],
      [ { id:"pushdown", n:"绳索下压", w:30, r:12, s:2, rest:60, step:UP, drop:5, alt:[["绳索过头臂屈伸",25,12,2]] },
        { id:"ohext", n:"绳索过头臂屈伸", w:25, r:12, s:2, rest:60, step:UP, drop:5, alt:[["绳索下压",30,12,2]] } ],
      [ { id:"farmer", n:"农夫行走", w:32, r:30, s:2, rest:90, step:DB, drop:DB*2, u:"米", rs:5, alt:[["六角杠行走",80,30,2]] },
        { id:"suitcase", n:"手提箱行走（单手）", w:28, r:30, s:2, rest:60, step:DB, drop:DB*2, u:"米", rs:5, each:true, alt:[["单手壶铃行走",24,30,2]] } ]
    ]
  },
  lowA: {
    name: "下肢 A　深蹲", mins: 60,
    warm: ["单车　5 分钟", "徒手深蹲　2 × 10"],
    ex: [
      { id:"squat", n:"深蹲", w:115, r:5, s:3, rest:180, step:LOW, drop:5, main:true, ramp:RAMP, from:SWITCH,
        alt:[["史密斯深蹲",100,6,3],["哈克深蹲",90,8,3]] },
      [ { id:"legpress", n:"腿举", w:160, r:10, s:3, rest:120, step:10, drop:10, alt:[["哈克深蹲",90,10,3]] },
        { id:"rdl", n:"罗马尼亚硬拉", w:80, r:8, s:3, rest:150, step:LOW, drop:5, alt:[["哑铃罗马尼亚硬拉",28,10,3]] } ],
      [ legext, legcurl ],
      [ { id:"calf", n:"站姿提踵", w:80, r:12, s:2, rest:60, step:LOW, drop:5, alt:[["腿举机提踵",100,15,2]] },
        { id:"scalf", n:"坐姿提踵", w:50, r:15, s:2, rest:60, step:LOW, drop:5, alt:[["站姿提踵",80,12,2]] } ],
      [ { id:"slrdl", n:"单腿罗马尼亚硬拉", w:20, r:8, s:2, rest:60, step:DB, drop:DB*2, each:true, alt:[["单腿臀桥",0,12,2]] },
        { id:"copen", n:"哥本哈根侧桥", w:0, r:20, s:2, rest:45, step:0, drop:0, bw:true, inc:5, max:40, u:"秒", rs:5, each:true, alt:[["侧桥",0,30,2]] } ]
    ]
  },
  upB: {
    name: "上肢 B", mins: 60,
    warm: ["划船机　5 分钟", "弹力带面拉　2 × 15"],
    ex: [
      { id:"ohpdb", n:"坐姿哑铃推肩", w:24, r:8, s:3, rest:150, step:DB, drop:DB*2,
        alt:[["器械推肩",45,10,3]] },
      [ { id:"macrow", n:"器械划船", w:70, r:10, s:3, rest:120, step:LOW, drop:5, alt:[["胸托 T 杠划船",50,10,3]] },
        { id:"pullup", n:"引体向上", w:0, r:8, s:3, rest:120, step:0, drop:0, bw:true, alt:[["高位下拉",60,10,3]] } ],
      [ { id:"incdb", n:"上斜哑铃卧推", w:28, r:10, s:2, rest:90, step:DB, drop:DB*2, alt:[["上斜史密斯卧推",70,8,2]] },
        { id:"incmac", n:"器械上斜推胸", w:50, r:10, s:2, rest:90, step:LOW, drop:5, alt:[["上斜哑铃卧推",28,10,2]] } ],
      [ { id:"curl", n:"哑铃弯举", w:14, r:10, s:2, rest:60, step:DB, drop:DB, alt:[["绳索弯举",25,12,2]] },
        { id:"cablecurl", n:"绳索弯举", w:25, r:12, s:2, rest:60, step:UP, drop:5, alt:[["哑铃弯举",14,10,2]] } ],
      [ { id:"pallof", n:"Pallof 推", w:15, r:10, s:2, rest:45, step:UP, drop:UP, each:true, alt:[["弹力带 Pallof 推",0,12,2]] },
        deadbug ]
    ]
  },
  lowB: {
    name: "下肢 B　硬拉", mins: 60,
    warm: ["单车　5 分钟", "臀桥　2 × 12"],
    ex: [
      { id:"dead", n:"硬拉", w:120, r:5, s:3, rest:180, step:LOW, drop:5, main:true, ramp:[[.5,5],[.7,3],[.85,1]], from:SWITCH,
        alt:[["六角杠硬拉",125,5,3]] },
      [ { id:"bss", n:"保加利亚分腿蹲", w:14, r:8, s:3, rest:90, step:DB, drop:DB*2, alt:[["哑铃箭步蹲",14,10,3]] },
        { id:"hipthrust", n:"杠铃臀推", w:90, r:10, s:3, rest:120, step:LOW, drop:5, alt:[["器械臀推",80,12,3]] } ],
      [ legcurl, legext ],
      [ { id:"legraise", n:"悬垂举腿", w:0, r:12, s:2, rest:60, step:0, drop:0, bw:true, max:15, alt:[["绳索卷腹",40,15,2]] },
        { id:"cablecrunch", n:"绳索卷腹", w:40, r:15, s:2, rest:60, step:LOW, drop:5, alt:[["悬垂举腿",0,12,2]] } ],
      [ deadbug,
        { id:"goblet", n:"高脚杯持握行走", w:24, r:30, s:2, rest:60, step:DB, drop:DB*2, u:"米", rs:5, alt:[["壶铃前抱行走",24,30,2]] } ]
    ]
  },
  easy:   { name: "低强度有氧", cardio: "低强度有氧　30–40 分钟" },
  cardio: { name: "有氧", cardio: "跑步或单车　30–40 分钟" },
  rest:   { name: "休息" },

  // 旧计划（10-12 那一周用的），新计划开始前还按它显示，之后不再用
  push: {
    name: "上肢推", mins: 70,
    warm: ["划船机　5 分钟", "弹力带肩外旋　2 × 15"],
    ex: [
      { id:"bench", n:"卧推", w:95, r:5, s:3, rest:180, step:UP, drop:5, main:true, ramp:RAMP, alt:[["史密斯卧推",85,6,3],["哑铃卧推",36,8,3]] },
      { id:"incdb", n:"上斜哑铃卧推", w:30, r:8, s:3, rest:120, step:DB, drop:DB*2, alt:[["上斜史密斯卧推",70,8,3],["器械上斜推胸",50,10,3]] },
      { id:"ohpdb", n:"坐姿哑铃推肩", w:24, r:8, s:3, rest:120, step:DB, drop:DB*2, alt:[["器械推肩",45,10,3]] },
      { id:"latraise", n:"哑铃侧平举", w:10, r:15, s:3, rest:90, step:DB, drop:DB, alt:[["绳索侧平举",7.5,15,3]] },
      { id:"pushdown", n:"绳索下压", w:30, r:12, s:3, rest:90, step:UP, drop:5, alt:[["绳索过头臂屈伸",25,12,3]] }
    ]
  },
  knee: {
    name: "下肢膝主导", mins: 70,
    warm: ["单车　5 分钟", "徒手深蹲　2 × 10"],
    ex: [
      { id:"squat", n:"深蹲", w:125, r:5, s:3, rest:180, step:LOW, drop:5, main:true, ramp:RAMP, alt:[["史密斯深蹲",110,6,3],["哈克深蹲",100,8,3]] },
      { id:"legpress", n:"腿举", w:180, r:10, s:3, rest:120, step:10, drop:10, alt:[["哈克深蹲",100,10,3]] },
      { id:"bss", n:"保加利亚分腿蹲", w:16, r:8, s:3, rest:90, step:DB, drop:DB*2, alt:[["哑铃箭步蹲",16,10,3]] },
      { id:"legext", n:"腿屈伸", w:50, r:12, s:3, rest:90, step:LOW, drop:5, alt:[["单腿腿屈伸",25,12,3]] },
      { id:"calf", n:"站姿提踵", w:80, r:12, s:3, rest:60, step:LOW, drop:5, alt:[["坐姿提踵",50,15,3]] }
    ]
  },
  pull: {
    name: "上肢拉", mins: 65,
    warm: ["划船机　5 分钟", "弹力带面拉　2 × 15"],
    ex: [
      { id:"bbrow", n:"杠铃划船", w:70, r:8, s:3, rest:150, step:UP, drop:5, main:true, ramp:[[.55,8],[.75,5]], alt:[["器械划船",70,10,3],["T 杠划船",50,8,3]] },
      { id:"pullup", n:"引体向上", w:0, r:8, s:3, rest:120, step:0, drop:0, bw:true, alt:[["高位下拉",65,10,3]] },
      { id:"cablerow", n:"坐姿绳索划船", w:60, r:10, s:3, rest:90, step:LOW, drop:5, alt:[["单臂哑铃划船",32,10,3]] },
      { id:"facepull", n:"绳索面拉", w:25, r:15, s:3, rest:60, step:UP, drop:5, alt:[["器械反向飞鸟",40,15,3]] },
      { id:"curl", n:"哑铃弯举", w:14, r:10, s:3, rest:90, step:DB, drop:DB, alt:[["绳索弯举",25,12,3]] }
    ]
  },
  hip: {
    name: "下肢髋主导", mins: 70,
    warm: ["单车　5 分钟", "臀桥　2 × 12"],
    ex: [
      { id:"dead", n:"硬拉", w:125, r:5, s:3, rest:180, step:LOW, drop:5, main:true, ramp:[[.5,5],[.7,3],[.85,1]], alt:[["六角杠硬拉",130,5,3]] },
      { id:"rdl", n:"罗马尼亚硬拉", w:90, r:8, s:3, rest:150, step:LOW, drop:5, alt:[["哑铃罗马尼亚硬拉",30,10,3]] },
      { id:"hipthrust", n:"杠铃臀推", w:100, r:10, s:3, rest:120, step:LOW, drop:5, alt:[["器械臀推",80,12,3]] },
      { id:"legcurl", n:"坐姿腿弯举", w:45, r:12, s:3, rest:90, step:LOW, drop:5, alt:[["俯卧腿弯举",40,12,3]] },
      { id:"legraise", n:"悬垂举腿", w:0, r:12, s:3, rest:60, step:0, drop:0, bw:true, alt:[["绳索卷腹",40,15,3]] }
    ]
  }
};

// 周日 0 … 周六 6
export const BY_DAY  = { 0:"rest", 1:"upA", 2:"lowA", 3:"easy", 4:"upB", 5:"lowB", 6:"cardio" };
export const PICK    = ["upA", "lowA", "upB", "lowB", "cardio"];
export const OLD_DAY = { 0:"rest", 1:"push", 2:"knee", 3:"easy", 4:"pull", 5:"hip", 6:"cardio" };
export const OLD_PICK = ["push", "knee", "pull", "hip", "cardio"];
