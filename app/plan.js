// 素日的训练计划。4 周一个周期，第 4 周减量。
// w 是起始重量（kg，哑铃写单只），r 次数，s 组数；step 每次做满后加多少，drop 连续两次没做满退多少。
// main: 主项，带热身组（按目标重量的比例算，0 表示空杆 20kg）。bw: 自重动作，做满了加次数，最多到 12。
// 辅助动作的起始重量是估的，第一次练的时候改成实际的，之后按实际的往上加。
export const START = "2026-10-12";   // 第 1 周的周一

const UP = 2.5, LOW = 5, DB = 2;

export const PLAN = {
  push: {
    name: "上肢推", mins: 70,
    warm: ["划船机　5 分钟", "弹力带肩外旋　2 × 15"],
    ex: [
      { id:"bench", n:"卧推", w:95, r:5, s:3, rest:180, step:UP, drop:5, main:true, ramp:[[0,10],[.5,5],[.7,3],[.85,1]],
        alt:[["史密斯卧推",85,6,3],["哑铃卧推",36,8,3]] },
      { id:"incdb", n:"上斜哑铃卧推", w:30, r:8, s:3, rest:120, step:DB, drop:DB*2,
        alt:[["上斜史密斯卧推",70,8,3],["器械上斜推胸",50,10,3]] },
      { id:"ohpdb", n:"坐姿哑铃推肩", w:24, r:8, s:3, rest:120, step:DB, drop:DB*2,
        alt:[["器械推肩",45,10,3]] },
      { id:"latraise", n:"哑铃侧平举", w:10, r:15, s:3, rest:90, step:DB, drop:DB,
        alt:[["绳索侧平举",7.5,15,3]] },
      { id:"pushdown", n:"绳索下压", w:30, r:12, s:3, rest:90, step:UP, drop:5,
        alt:[["绳索过头臂屈伸",25,12,3]] }
    ]
  },
  knee: {
    name: "下肢膝主导", mins: 70,
    warm: ["单车　5 分钟", "徒手深蹲　2 × 10"],
    ex: [
      { id:"squat", n:"深蹲", w:125, r:5, s:3, rest:180, step:LOW, drop:5, main:true, ramp:[[0,10],[.5,5],[.7,3],[.85,1]],
        alt:[["史密斯深蹲",110,6,3],["哈克深蹲",100,8,3]] },
      { id:"legpress", n:"腿举", w:180, r:10, s:3, rest:120, step:10, drop:10,
        alt:[["哈克深蹲",100,10,3]] },
      { id:"bss", n:"保加利亚分腿蹲", w:16, r:8, s:3, rest:90, step:DB, drop:DB*2,
        alt:[["哑铃箭步蹲",16,10,3]] },
      { id:"legext", n:"腿屈伸", w:50, r:12, s:3, rest:90, step:LOW, drop:5,
        alt:[["单腿腿屈伸",25,12,3]] },
      { id:"calf", n:"站姿提踵", w:80, r:12, s:3, rest:60, step:LOW, drop:5,
        alt:[["坐姿提踵",50,15,3]] }
    ]
  },
  pull: {
    name: "上肢拉", mins: 65,
    warm: ["划船机　5 分钟", "弹力带面拉　2 × 15"],
    ex: [
      { id:"bbrow", n:"杠铃划船", w:70, r:8, s:3, rest:150, step:UP, drop:5, main:true, ramp:[[.55,8],[.75,5]],
        alt:[["器械划船",70,10,3],["T 杠划船",50,8,3]] },
      { id:"pullup", n:"引体向上", w:0, r:8, s:3, rest:120, step:0, drop:0, bw:true,
        alt:[["高位下拉",65,10,3]] },
      { id:"cablerow", n:"坐姿绳索划船", w:60, r:10, s:3, rest:90, step:LOW, drop:5,
        alt:[["单臂哑铃划船",32,10,3]] },
      { id:"facepull", n:"绳索面拉", w:25, r:15, s:3, rest:60, step:UP, drop:5,
        alt:[["器械反向飞鸟",40,15,3]] },
      { id:"curl", n:"哑铃弯举", w:14, r:10, s:3, rest:90, step:DB, drop:DB,
        alt:[["绳索弯举",25,12,3]] }
    ]
  },
  hip: {
    name: "下肢髋主导", mins: 70,
    warm: ["单车　5 分钟", "臀桥　2 × 12"],
    ex: [
      { id:"dead", n:"硬拉", w:125, r:5, s:3, rest:180, step:LOW, drop:5, main:true, ramp:[[.5,5],[.7,3],[.85,1]],
        alt:[["六角杠硬拉",130,5,3]] },
      { id:"rdl", n:"罗马尼亚硬拉", w:90, r:8, s:3, rest:150, step:LOW, drop:5,
        alt:[["哑铃罗马尼亚硬拉",30,10,3]] },
      { id:"hipthrust", n:"杠铃臀推", w:100, r:10, s:3, rest:120, step:LOW, drop:5,
        alt:[["器械臀推",80,12,3]] },
      { id:"legcurl", n:"坐姿腿弯举", w:45, r:12, s:3, rest:90, step:LOW, drop:5,
        alt:[["俯卧腿弯举",40,12,3]] },
      { id:"legraise", n:"悬垂举腿", w:0, r:12, s:3, rest:60, step:0, drop:0, bw:true,
        alt:[["绳索卷腹",40,15,3]] }
    ]
  },
  easy:   { name: "低强度有氧", cardio: "低强度有氧　30–40 分钟" },
  cardio: { name: "有氧", cardio: "跑步或单车　30–40 分钟" },
  rest:   { name: "休息" }
};

// 周日 0 … 周六 6
export const BY_DAY = { 0:"rest", 1:"push", 2:"knee", 3:"easy", 4:"pull", 5:"hip", 6:"cardio" };
export const PICK = ["push", "knee", "pull", "hip", "cardio"];
