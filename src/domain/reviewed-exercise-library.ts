export const reviewedExerciseSections = ["全部", "胸", "背", "腿", "肩", "手臂", "核心", "全身"] as const;

export type ReviewedExerciseSection = (typeof reviewedExerciseSections)[number];
export type ExerciseLoadType = "weighted" | "bodyweight" | "assisted";

export type ReviewedExercise = {
  aliasesZh: readonly string[];
  equipment: readonly string[];
  id: string;
  loadType: ExerciseLoadType;
  movementPattern: string;
  nameEn: string;
  nameZh: string;
  primaryMuscles: readonly string[];
  riskLevel: "standard" | "technical";
  secondaryMuscles: readonly string[];
  section: Exclude<ReviewedExerciseSection, "全部">;
};

const exercise = (
  id: string, nameZh: string, aliasesZh: string[], nameEn: string, equipment: string[], primaryMuscles: string[],
  secondaryMuscles: string[], movementPattern: string, riskLevel: ReviewedExercise["riskLevel"],
  loadType: ExerciseLoadType, section: ReviewedExercise["section"]
): ReviewedExercise => ({ id, nameZh, aliasesZh, nameEn, equipment, primaryMuscles, secondaryMuscles, movementPattern, riskLevel, loadType, section });

// Product-owned, finite beginner/intermediate definitions. These are not copied
// from wger and intentionally stay small enough to review as a training product.
export const reviewedExercises: readonly ReviewedExercise[] = [
  exercise("barbell-bench-press", "杠铃卧推", ["卧推", "平板卧推"], "Barbell bench press", ["杠铃", "训练凳"], ["胸大肌"], ["肱三头肌", "前三角肌"], "水平推", "technical", "weighted", "胸"),
  exercise("dumbbell-bench-press", "哑铃卧推", ["哑铃平板卧推"], "Dumbbell bench press", ["哑铃", "训练凳"], ["胸大肌"], ["肱三头肌", "前三角肌"], "水平推", "standard", "weighted", "胸"),
  exercise("incline-barbell-bench", "上斜杠铃卧推", ["上斜卧推"], "Incline barbell bench press", ["杠铃", "可调训练凳"], ["胸大肌上束"], ["肱三头肌", "前三角肌"], "水平推", "technical", "weighted", "胸"),
  exercise("incline-dumbbell-bench", "上斜哑铃卧推", ["上斜哑铃推"], "Incline dumbbell bench press", ["哑铃", "可调训练凳"], ["胸大肌上束"], ["肱三头肌", "前三角肌"], "水平推", "standard", "weighted", "胸"),
  exercise("push-up", "俯卧撑", ["标准俯卧撑"], "Push-up", ["徒手"], ["胸大肌"], ["肱三头肌", "核心"], "水平推", "standard", "bodyweight", "胸"),
  exercise("incline-push-up", "上斜俯卧撑", ["高位俯卧撑"], "Incline push-up", ["训练凳", "徒手"], ["胸大肌"], ["肱三头肌"], "水平推", "standard", "bodyweight", "胸"),
  exercise("chest-press-machine", "坐姿推胸机", ["器械推胸"], "Machine chest press", ["固定器械"], ["胸大肌"], ["肱三头肌"], "水平推", "standard", "weighted", "胸"),
  exercise("cable-fly", "绳索夹胸", ["龙门架夹胸"], "Cable fly", ["绳索器械"], ["胸大肌"], ["前三角肌"], "水平内收", "standard", "weighted", "胸"),
  exercise("pec-deck", "蝴蝶机夹胸", ["夹胸机"], "Pec deck fly", ["固定器械"], ["胸大肌"], ["前三角肌"], "水平内收", "standard", "weighted", "胸"),
  exercise("parallel-bar-dip", "双杠臂屈伸", ["双杠撑体"], "Parallel bar dip", ["双杠"], ["胸大肌", "肱三头肌"], ["前三角肌"], "垂直推", "technical", "bodyweight", "胸"),

  exercise("pull-up", "引体向上", ["正握引体"], "Pull-up", ["单杠"], ["背阔肌"], ["肱二头肌", "前臂"], "垂直拉", "technical", "bodyweight", "背"),
  exercise("assisted-pull-up", "辅助引体向上", ["助力引体"], "Assisted pull-up", ["辅助引体器械"], ["背阔肌"], ["肱二头肌"], "垂直拉", "standard", "assisted", "背"),
  exercise("lat-pulldown", "高位下拉", ["下拉"], "Lat pulldown", ["高位下拉器"], ["背阔肌"], ["肱二头肌"], "垂直拉", "standard", "weighted", "背"),
  exercise("close-grip-pulldown", "窄握高位下拉", ["窄距下拉"], "Close-grip lat pulldown", ["高位下拉器"], ["背阔肌"], ["肱二头肌"], "垂直拉", "standard", "weighted", "背"),
  exercise("seated-cable-row", "坐姿绳索划船", ["坐姿划船"], "Seated cable row", ["绳索器械"], ["背阔肌", "菱形肌"], ["肱二头肌"], "水平拉", "standard", "weighted", "背"),
  exercise("barbell-row", "杠铃划船", ["俯身杠铃划船"], "Barbell row", ["杠铃"], ["背阔肌", "菱形肌"], ["竖脊肌", "肱二头肌"], "水平拉", "technical", "weighted", "背"),
  exercise("one-arm-dumbbell-row", "单臂哑铃划船", ["哑铃划船"], "One-arm dumbbell row", ["哑铃", "训练凳"], ["背阔肌"], ["肱二头肌", "后束三角肌"], "水平拉", "standard", "weighted", "背"),
  exercise("chest-supported-row", "胸托划船", ["支撑划船"], "Chest-supported row", ["固定器械"], ["背阔肌", "菱形肌"], ["后束三角肌"], "水平拉", "standard", "weighted", "背"),
  exercise("straight-arm-pulldown", "直臂下拉", ["直臂下压"], "Straight-arm pulldown", ["绳索器械"], ["背阔肌"], ["核心"], "肩伸", "standard", "weighted", "背"),
  exercise("face-pull", "面拉", ["绳索面拉"], "Face pull", ["绳索器械"], ["后束三角肌", "斜方肌"], ["菱形肌"], "水平拉", "standard", "weighted", "背"),
  exercise("reverse-fly", "反向飞鸟", ["俯身飞鸟"], "Reverse fly", ["哑铃"], ["后束三角肌"], ["菱形肌"], "肩外展", "standard", "weighted", "背"),
  exercise("t-bar-row", "T杠划船", ["T杠"], "T-bar row", ["T杠器械"], ["背阔肌", "菱形肌"], ["肱二头肌"], "水平拉", "technical", "weighted", "背"),

  exercise("barbell-back-squat", "杠铃深蹲", ["深蹲", "后蹲"], "Barbell back squat", ["杠铃", "深蹲架"], ["股四头肌", "臀大肌"], ["核心", "腘绳肌"], "深蹲", "technical", "weighted", "腿"),
  exercise("front-squat", "前蹲", ["杠铃前蹲"], "Front squat", ["杠铃", "深蹲架"], ["股四头肌"], ["臀大肌", "核心"], "深蹲", "technical", "weighted", "腿"),
  exercise("goblet-squat", "高脚杯深蹲", ["哑铃深蹲"], "Goblet squat", ["哑铃"], ["股四头肌", "臀大肌"], ["核心"], "深蹲", "standard", "weighted", "腿"),
  exercise("leg-press", "腿举", ["坐姿腿举"], "Leg press", ["腿举机"], ["股四头肌", "臀大肌"], ["腘绳肌"], "深蹲", "standard", "weighted", "腿"),
  exercise("hack-squat", "哈克深蹲", ["哈克机深蹲"], "Hack squat", ["哈克深蹲机"], ["股四头肌"], ["臀大肌"], "深蹲", "standard", "weighted", "腿"),
  exercise("bulgarian-split-squat", "保加利亚分腿蹲", ["保加利亚蹲"], "Bulgarian split squat", ["哑铃", "训练凳"], ["股四头肌", "臀大肌"], ["核心"], "单腿深蹲", "technical", "weighted", "腿"),
  exercise("walking-lunge", "行走箭步蹲", ["箭步蹲"], "Walking lunge", ["哑铃", "徒手"], ["股四头肌", "臀大肌"], ["核心"], "单腿深蹲", "standard", "weighted", "腿"),
  exercise("step-up", "登台阶", ["台阶上步"], "Step-up", ["训练凳", "哑铃"], ["股四头肌", "臀大肌"], ["核心"], "单腿深蹲", "standard", "weighted", "腿"),
  exercise("leg-extension", "腿屈伸", ["坐姿腿屈伸"], "Leg extension", ["腿屈伸机"], ["股四头肌"], [], "膝伸", "standard", "weighted", "腿"),
  exercise("romanian-deadlift", "罗马尼亚硬拉", ["RDL", "罗马尼亚拉"], "Romanian deadlift", ["杠铃"], ["腘绳肌", "臀大肌"], ["竖脊肌"], "髋铰链", "technical", "weighted", "腿"),
  exercise("conventional-deadlift", "传统硬拉", ["硬拉"], "Conventional deadlift", ["杠铃"], ["臀大肌", "腘绳肌"], ["背阔肌", "竖脊肌"], "髋铰链", "technical", "weighted", "腿"),
  exercise("hip-thrust", "杠铃臀推", ["臀推"], "Barbell hip thrust", ["杠铃", "训练凳"], ["臀大肌"], ["腘绳肌"], "髋伸", "technical", "weighted", "腿"),
  exercise("glute-bridge", "臀桥", ["自重臀桥"], "Glute bridge", ["徒手"], ["臀大肌"], ["腘绳肌"], "髋伸", "standard", "bodyweight", "腿"),
  exercise("lying-leg-curl", "俯卧腿弯举", ["腿弯举"], "Lying leg curl", ["腿弯举机"], ["腘绳肌"], [], "膝屈", "standard", "weighted", "腿"),
  exercise("seated-leg-curl", "坐姿腿弯举", ["坐姿腿屈"], "Seated leg curl", ["腿弯举机"], ["腘绳肌"], [], "膝屈", "standard", "weighted", "腿"),
  exercise("standing-calf-raise", "站姿提踵", ["小腿提踵"], "Standing calf raise", ["提踵机"], ["腓肠肌"], ["比目鱼肌"], "踝跖屈", "standard", "weighted", "腿"),
  exercise("seated-calf-raise", "坐姿提踵", ["坐姿小腿"], "Seated calf raise", ["提踵机"], ["比目鱼肌"], ["腓肠肌"], "踝跖屈", "standard", "weighted", "腿"),

  exercise("barbell-overhead-press", "杠铃推举", ["肩推", "站姿推举"], "Barbell overhead press", ["杠铃"], ["前三角肌", "中束三角肌"], ["肱三头肌"], "垂直推", "technical", "weighted", "肩"),
  exercise("dumbbell-shoulder-press", "哑铃肩推", ["坐姿哑铃推举"], "Dumbbell shoulder press", ["哑铃", "训练凳"], ["前三角肌", "中束三角肌"], ["肱三头肌"], "垂直推", "standard", "weighted", "肩"),
  exercise("arnold-press", "阿诺德推举", ["阿诺德肩推"], "Arnold press", ["哑铃", "训练凳"], ["前三角肌", "中束三角肌"], ["肱三头肌"], "垂直推", "standard", "weighted", "肩"),
  exercise("dumbbell-lateral-raise", "哑铃侧平举", ["侧平举"], "Dumbbell lateral raise", ["哑铃"], ["中束三角肌"], ["斜方肌"], "肩外展", "standard", "weighted", "肩"),
  exercise("cable-lateral-raise", "绳索侧平举", ["拉力器侧平举"], "Cable lateral raise", ["绳索器械"], ["中束三角肌"], [], "肩外展", "standard", "weighted", "肩"),
  exercise("front-raise", "前平举", ["哑铃前平举"], "Dumbbell front raise", ["哑铃"], ["前三角肌"], ["胸大肌上束"], "肩屈", "standard", "weighted", "肩"),
  exercise("rear-delt-machine", "反向蝴蝶机", ["后束飞鸟机"], "Rear delt machine fly", ["固定器械"], ["后束三角肌"], ["菱形肌"], "肩外展", "standard", "weighted", "肩"),
  exercise("landmine-press", "地雷管推举", ["地雷管肩推"], "Landmine press", ["杠铃", "地雷管"], ["前三角肌"], ["胸大肌", "肱三头肌"], "斜向推", "standard", "weighted", "肩"),

  exercise("barbell-curl", "杠铃弯举", ["二头弯举"], "Barbell curl", ["杠铃"], ["肱二头肌"], ["前臂"], "肘屈", "standard", "weighted", "手臂"),
  exercise("dumbbell-curl", "哑铃弯举", ["交替哑铃弯举"], "Dumbbell curl", ["哑铃"], ["肱二头肌"], ["前臂"], "肘屈", "standard", "weighted", "手臂"),
  exercise("hammer-curl", "锤式弯举", ["锤式"], "Hammer curl", ["哑铃"], ["肱肌", "肱桡肌"], ["肱二头肌"], "肘屈", "standard", "weighted", "手臂"),
  exercise("cable-curl", "绳索弯举", ["拉力器弯举"], "Cable curl", ["绳索器械"], ["肱二头肌"], ["前臂"], "肘屈", "standard", "weighted", "手臂"),
  exercise("preacher-curl", "牧师凳弯举", ["托臂弯举"], "Preacher curl", ["牧师凳", "杠铃"], ["肱二头肌"], [], "肘屈", "standard", "weighted", "手臂"),
  exercise("triceps-pushdown", "绳索下压", ["三头下压"], "Cable triceps pushdown", ["绳索器械"], ["肱三头肌"], [], "肘伸", "standard", "weighted", "手臂"),
  exercise("overhead-triceps-extension", "过顶臂屈伸", ["过顶三头"], "Overhead triceps extension", ["哑铃"], ["肱三头肌"], [], "肘伸", "standard", "weighted", "手臂"),
  exercise("skull-crusher", "仰卧臂屈伸", ["法式卧推"], "Lying triceps extension", ["杠铃", "训练凳"], ["肱三头肌"], [], "肘伸", "technical", "weighted", "手臂"),
  exercise("bench-dip", "凳上臂屈伸", ["凳上双杠"], "Bench dip", ["训练凳"], ["肱三头肌"], ["前三角肌"], "肘伸", "standard", "bodyweight", "手臂"),
  exercise("reverse-curl", "反握弯举", ["反手弯举"], "Reverse curl", ["杠铃"], ["肱桡肌", "前臂"], ["肱二头肌"], "肘屈", "standard", "weighted", "手臂"),

  exercise("plank", "平板支撑", ["平板"], "Plank", ["徒手"], ["核心"], ["肩部"], "抗伸展", "standard", "bodyweight", "核心"),
  exercise("side-plank", "侧平板支撑", ["侧桥"], "Side plank", ["徒手"], ["腹斜肌"], ["臀中肌"], "抗侧屈", "standard", "bodyweight", "核心"),
  exercise("dead-bug", "死虫", ["死虫式"], "Dead bug", ["徒手"], ["核心"], ["髋屈肌"], "抗伸展", "standard", "bodyweight", "核心"),
  exercise("bird-dog", "鸟狗式", ["鸟狗"], "Bird dog", ["徒手"], ["核心"], ["臀大肌"], "抗旋转", "standard", "bodyweight", "核心"),
  exercise("crunch", "卷腹", ["仰卧卷腹"], "Crunch", ["徒手"], ["腹直肌"], [], "躯干屈曲", "standard", "bodyweight", "核心"),
  exercise("cable-crunch", "绳索卷腹", ["跪姿绳索卷腹"], "Cable crunch", ["绳索器械"], ["腹直肌"], [], "躯干屈曲", "standard", "weighted", "核心"),
  exercise("hanging-knee-raise", "悬垂举膝", ["吊杠举膝"], "Hanging knee raise", ["单杠"], ["腹直肌"], ["髋屈肌"], "髋屈", "standard", "bodyweight", "核心"),
  exercise("pallof-press", "帕洛夫推", ["抗旋转推"], "Pallof press", ["绳索器械"], ["腹斜肌"], ["核心"], "抗旋转", "standard", "weighted", "核心"),
  exercise("ab-wheel-rollout", "健腹轮", ["腹轮"], "Ab wheel rollout", ["健腹轮"], ["腹直肌"], ["肩部"], "抗伸展", "technical", "bodyweight", "核心"),
  exercise("lying-leg-raise", "仰卧举腿", ["举腿"], "Lying leg raise", ["徒手"], ["腹直肌"], ["髋屈肌"], "髋屈", "standard", "bodyweight", "核心"),

  exercise("kettlebell-swing", "壶铃摆动", ["壶铃摇摆"], "Kettlebell swing", ["壶铃"], ["臀大肌", "腘绳肌"], ["核心"], "髋铰链", "technical", "weighted", "全身"),
  exercise("burpee", "波比跳", ["波比"], "Burpee", ["徒手"], ["全身"], ["胸大肌", "股四头肌"], "全身循环", "standard", "bodyweight", "全身"),
  exercise("farmer-carry", "农夫行走", ["农夫走"], "Farmer carry", ["哑铃"], ["前臂", "斜方肌"], ["核心"], "负重行走", "standard", "weighted", "全身"),
  exercise("sled-push", "雪橇推", ["雪橇车推"], "Sled push", ["雪橇"], ["股四头肌", "臀大肌"], ["核心"], "全身推进", "standard", "weighted", "全身"),
  exercise("battle-rope", "战绳", ["甩大绳"], "Battle rope", ["战绳"], ["肩部", "核心"], ["前臂"], "全身循环", "standard", "weighted", "全身"),
  exercise("rowing-erg", "划船机", ["划船器"], "Rowing ergometer", ["划船机"], ["背阔肌", "股四头肌"], ["核心"], "有氧划船", "standard", "assisted", "全身"),
  exercise("stationary-bike", "动感单车", ["健身单车"], "Stationary bike", ["单车"], ["股四头肌"], ["心肺"], "有氧骑行", "standard", "assisted", "全身"),
  exercise("treadmill-run", "跑步机跑步", ["跑步"], "Treadmill run", ["跑步机"], ["股四头肌", "小腿"], ["心肺"], "有氧跑步", "standard", "bodyweight", "全身"),
  exercise("medicine-ball-slam", "药球砸地", ["砸球"], "Medicine ball slam", ["药球"], ["背阔肌", "核心"], ["肩部"], "全身爆发", "standard", "weighted", "全身"),
  exercise("turkish-get-up", "土耳其起立", ["土耳其起身"], "Turkish get-up", ["壶铃"], ["全身"], ["核心", "肩部"], "全身稳定", "technical", "weighted", "全身"),
  exercise("machine-shoulder-press", "坐姿推肩机", ["器械肩推"], "Machine shoulder press", ["固定器械"], ["前三角肌", "中束三角肌"], ["肱三头肌"], "垂直推", "standard", "weighted", "肩"),
  exercise("cable-pull-through", "绳索拉臀", ["拉力器拉臀"], "Cable pull-through", ["绳索器械"], ["臀大肌", "腘绳肌"], ["核心"], "髋铰链", "standard", "weighted", "腿"),
  exercise("cable-woodchop", "绳索伐木", ["伐木式"], "Cable woodchop", ["绳索器械"], ["腹斜肌"], ["核心"], "旋转", "standard", "weighted", "核心")
];

const normalize = (value: string) => value.toLocaleLowerCase("zh-CN").replace(/[\s\-_/，,。.]/g, "");

export function searchReviewedExercises(query: string, section: ReviewedExerciseSection): ReviewedExercise[] {
  const needle = normalize(query.trim());
  const filtered = reviewedExercises.filter((item) => {
    if (!needle) return section === "全部" || item.section === section;
    return [item.nameZh, ...item.aliasesZh, item.nameEn, ...item.primaryMuscles]
      .some((value) => normalize(value).includes(needle));
  });

  return [...filtered].sort((left, right) => matchScore(left, needle) - matchScore(right, needle) || left.nameZh.localeCompare(right.nameZh, "zh-CN"));
}

function matchScore(item: ReviewedExercise, needle: string) {
  if (!needle) return 0;
  if (normalize(item.nameZh) === needle) return 0;
  if (item.aliasesZh.some((alias) => normalize(alias) === needle)) return 1;
  if (normalize(item.nameEn).includes(needle)) return 2;
  if (item.primaryMuscles.some((muscle) => normalize(muscle).includes(needle))) return 3;
  return 4;
}
