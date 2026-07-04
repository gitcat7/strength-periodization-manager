import Link from "next/link";
import { Activity, ArrowLeft, Dumbbell, Flame, HeartPulse } from "lucide-react";

const week = [
  { label: "推 A", intent: "强度", focus: "胸 / 肩 / 三头", active: true },
  { label: "拉 B", intent: "容量", focus: "背 / 后束 / 二头" },
  { label: "蹲 A", intent: "强度", focus: "下肢 / 后链" },
  { label: "有氧", intent: "恢复", focus: "Zone 2" },
  { label: "推 B", intent: "容量", focus: "胸肩容量" },
  { label: "拉 A", intent: "强度", focus: "背部力量" },
  { label: "蹲 B", intent: "容量", focus: "腿部容量" }
];

const today = [
  { name: "杠铃卧推", prescription: "4 组 x 5 次 @ 75kg", note: "主项，保留 1-2 次余量" },
  { name: "站姿推举", prescription: "3 组 x 5 次 @ 40kg", note: "次主项，控制动作速度" },
  { name: "上斜哑铃卧推", prescription: "3 组 x 8 次 @ 30kg", note: "上胸容量，稳定肩胛" },
  { name: "侧平举", prescription: "3 组 x 12 次 @ 8kg", note: "肩中束，动作干净" },
  { name: "绳索下压", prescription: "3 组 x 12 次 @ 22.5kg", note: "三头收尾，不力竭" }
];

export default function PreviewPage() {
  return (
    <main className="min-h-screen px-4 py-6">
      <section className="mx-auto max-w-5xl space-y-5">
        <Link className="inline-flex items-center gap-1 text-sm text-muted" href="/">
          <ArrowLeft size={16} />
          返回首页
        </Link>

        <header className="rounded-[20px] border border-line bg-white p-5 shadow-sm">
          <p className="text-sm text-muted">新版计划格式预览</p>
          <h1 className="mt-1 text-3xl font-semibold">推 / 拉 / 蹲 · A/B 周期</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            这不是复制某个人的训练表，而是把计划按方向拆分：推、拉、蹲；A 是强度日，B 是容量日。具体动作和重量由系统根据用户画像生成。
          </p>
        </header>

        <section className="grid gap-3 md:grid-cols-7">
          {week.map((day) => (
            <article
              className={`rounded-xl border p-4 ${day.active ? "border-action bg-action text-white" : "border-line bg-white"}`}
              key={day.label}
            >
              <p className={`text-xs ${day.active ? "text-white/75" : "text-muted"}`}>{day.intent}</p>
              <h2 className="mt-1 text-xl font-semibold">{day.label}</h2>
              <p className={`mt-3 text-xs leading-5 ${day.active ? "text-white/80" : "text-muted"}`}>{day.focus}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="rounded-[20px] border border-line bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-action text-white">
                <Dumbbell size={24} />
              </span>
              <div>
                <p className="text-sm text-muted">今日训练方向：推，胸/肩/三头为主</p>
                <h2 className="text-2xl font-semibold">第 1 周 · 推 A · 强度</h2>
              </div>
            </div>

            <div className="space-y-3">
              {today.map((item, index) => (
                <article className="rounded-xl border border-line p-4" key={item.name}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-action text-sm font-semibold text-white">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="font-semibold">{item.name}</h3>
                        <p className="font-semibold text-action">{item.prescription}</p>
                      </div>
                      <p className="mt-2 text-sm text-muted">{item.note}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="space-y-3">
            <InfoCard icon={<Flame size={18} />} title="A = 强度" text="主项低到中等次数，重量更高，重点是力量和技术质量。" />
            <InfoCard icon={<Activity size={18} />} title="B = 容量" text="中高次数和更多总量，重点是肌肥大、技术巩固和局部容量。" />
            <InfoCard icon={<HeartPulse size={18} />} title="有氧日" text="不塞重力量训练，作为 Zone 2 恢复和心肺基础。" />
          </aside>
        </section>
      </section>
    </main>
  );
}

function InfoCard({
  icon,
  title,
  text
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-action">
        {icon}
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-sm leading-6 text-muted">{text}</p>
    </article>
  );
}

