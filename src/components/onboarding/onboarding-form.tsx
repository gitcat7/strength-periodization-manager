"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Dumbbell, Loader2, Save } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { trackEvent } from "@/lib/analytics";
import {
  calculateTrainingMax,
  estimateOneRepMax,
  roundToNearestPlate
} from "@/domain/strength";

type ExperienceLevel = "beginner" | "novice" | "intermediate";
type Goal = "strength" | "hypertrophy_strength";

type ExerciseRow = {
  id: string;
  slug: string;
  name: string;
  default_increment: number;
};

const weekdays = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 0, label: "周日" }
];

const mainLiftSlugs = ["back_squat", "bench_press", "deadlift", "overhead_press", "barbell_row"];

const defaultLiftInputs: Record<string, { weight: string; reps: string }> = {
  back_squat: { weight: "", reps: "5" },
  bench_press: { weight: "", reps: "5" },
  deadlift: { weight: "", reps: "5" },
  overhead_press: { weight: "", reps: "5" },
  barbell_row: { weight: "", reps: "5" }
};

export function OnboardingForm() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>("beginner");
  const [goal, setGoal] = useState<Goal>("strength");
  const [trainingDays, setTrainingDays] = useState(7);
  const [availableWeekdays, setAvailableWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]);
  const [sessionDuration, setSessionDuration] = useState(60);
  const [injuryNotes, setInjuryNotes] = useState("");
  const [liftInputs, setLiftInputs] = useState<Record<string, { weight: string; reps: string }>>(defaultLiftInputs);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [hasSavedProfile, setHasSavedProfile] = useState(false);
  const [message, setMessage] = useState("");

  const mainLifts = useMemo(
    () => mainLiftSlugs.map((slug) => exercises.find((exercise) => exercise.slug === slug)).filter(Boolean) as ExerciseRow[],
    [exercises]
  );

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      const supabase = createBrowserSupabaseClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        router.replace("/login?next=/onboarding");
        return;
      }

      const { data: profile } = await supabase
        .from("athlete_profiles")
        .select("experience_level,goal,training_days_per_week,available_weekdays,session_duration_minutes,injury_notes")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      const { data: exerciseData, error: exerciseError } = await supabase
        .from("exercises")
        .select("id,slug,name,default_increment")
        .in("slug", mainLiftSlugs)
        .order("created_at", { ascending: true });

      if (!active) return;

      if (exerciseError) {
        setStatus("error");
        setMessage(exerciseError.message);
        return;
      }

      setUserId(userData.user.id);
      setExercises(exerciseData ?? []);

      if (profile) {
        setHasSavedProfile(true);
        setExperienceLevel(profile.experience_level as ExperienceLevel);
        setGoal(profile.goal as Goal);
        setTrainingDays(profile.training_days_per_week);
        setAvailableWeekdays(profile.available_weekdays ?? []);
        setSessionDuration(profile.session_duration_minutes);
        setInjuryNotes(profile.injury_notes ?? "");

        const mainExerciseIds = (exerciseData ?? []).map((exercise) => exercise.id);
        const { data: liftProfileData, error: liftProfileError } = await supabase
          .from("lift_profiles")
          .select("exercise_id,estimated_1rm")
          .eq("user_id", userData.user.id)
          .in("exercise_id", mainExerciseIds);

        if (!active) return;

        if (liftProfileError) {
          setStatus("error");
          setMessage(liftProfileError.message);
          return;
        }

        const nextLiftInputs = { ...defaultLiftInputs };
        for (const liftProfile of liftProfileData ?? []) {
          const exercise = (exerciseData ?? []).find((item) => item.id === liftProfile.exercise_id);
          if (!exercise) continue;

          const reps = 5;
          const estimatedOneRepMax = Number(liftProfile.estimated_1rm);
          const estimatedWorkingWeight = roundToNearestPlate(
            estimatedOneRepMax / (1 + reps / 30),
            Number(exercise.default_increment) || 2.5
          );

          nextLiftInputs[exercise.slug] = {
            weight: String(estimatedWorkingWeight),
            reps: String(reps)
          };
        }

        setLiftInputs(nextLiftInputs);
        setMessage("你已经创建过训练画像。可以继续下一步，或修改后重新保存。");
      }

      setStatus("ready");
    }

    loadInitialData();

    return () => {
      active = false;
    };
  }, [router]);

  function toggleWeekday(day: number) {
    setAvailableWeekdays((current) => {
      if (current.includes(day)) {
        return current.filter((item) => item !== day);
      }

      return [...current, day].sort();
    });
  }

  function updateLiftInput(slug: string, field: "weight" | "reps", value: string) {
    setLiftInputs((current) => ({
      ...current,
      [slug]: {
        ...current[slug],
        [field]: value
      }
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    if (!userId) {
      setStatus("error");
      setMessage("登录状态失效，请重新登录。");
      return;
    }

    if (availableWeekdays.length !== trainingDays) {
      setStatus("error");
      setMessage(`请刚好选择 ${trainingDays} 个可训练日。`);
      return;
    }

    const liftPayload = mainLifts.map((exercise) => {
      const input = liftInputs[exercise.slug];
      const weight = Number(input.weight);
      const reps = Number(input.reps);
      const estimatedOneRepMax = estimateOneRepMax(weight, reps);
      const trainingMax = roundToNearestPlate(
        calculateTrainingMax(estimatedOneRepMax, experienceLevel),
        Number(exercise.default_increment) || 2.5
      );

      return {
        user_id: userId,
        exercise_id: exercise.id,
        estimated_1rm: Number(estimatedOneRepMax.toFixed(2)),
        training_max: trainingMax,
        source_type: "working_set"
      };
    });

    if (liftPayload.some((lift) => lift.estimated_1rm <= 0 || lift.training_max <= 0)) {
      setStatus("error");
      setMessage("请填写四个主项的最近工作组重量和次数。");
      return;
    }

    const supabase = createBrowserSupabaseClient();
    const { error: profileError } = await supabase.from("athlete_profiles").upsert(
      {
        user_id: userId,
        experience_level: experienceLevel,
        goal,
        training_days_per_week: trainingDays,
        available_weekdays: availableWeekdays,
        session_duration_minutes: sessionDuration,
        injury_notes: injuryNotes || null,
        unit: "kg",
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );

    if (profileError) {
      setStatus("error");
      setMessage(profileError.message);
      return;
    }

    const { error: liftError } = await supabase
      .from("lift_profiles")
      .upsert(liftPayload, { onConflict: "user_id,exercise_id" });

    if (liftError) {
      setStatus("error");
      setMessage(liftError.message);
      return;
    }

    setHasSavedProfile(true);
    await trackEvent({
      eventName: "profile_saved",
      properties: {
        experience_level: experienceLevel,
        goal,
        training_days_per_week: trainingDays
      },
      supabase,
      userId
    });
    setStatus("ready");
    setMessage("训练画像已保存。可以继续生成训练计划。");
    router.replace("/plan");
  }

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line p-4 text-muted">
        <Loader2 className="animate-spin" size={18} />
        正在读取登录状态和动作数据
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {message ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${status === "error" ? "border-red-200 text-red-600" : "border-line text-muted"}`}>
          {message}
        </p>
      ) : null}

      {hasSavedProfile ? (
        <button
          className="flex h-12 w-full items-center justify-center rounded-lg border border-action bg-action/5 px-4 font-semibold text-action"
          type="button"
          onClick={() => router.push("/plan")}
        >
          继续生成训练计划
        </button>
      ) : null}

      <section className="rounded-xl border border-line p-4">
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays size={18} className="text-action" />
          <h2 className="font-semibold">训练画像</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="训练经验">
            <select className="h-11 w-full rounded-lg border border-line bg-white px-3" value={experienceLevel} onChange={(event) => setExperienceLevel(event.target.value as ExperienceLevel)}>
              <option value="beginner">新手，0-6 个月</option>
              <option value="novice">初级，6-18 个月</option>
              <option value="intermediate">中级，18 个月以上</option>
            </select>
          </Field>

          <Field label="主要目标">
            <select className="h-11 w-full rounded-lg border border-line bg-white px-3" value={goal} onChange={(event) => setGoal(event.target.value as Goal)}>
              <option value="strength">力量增长</option>
              <option value="hypertrophy_strength">增肌兼力量</option>
            </select>
          </Field>

          <Field label="每周训练">
            <select className="h-11 w-full rounded-lg border border-line bg-white px-3" value={trainingDays} onChange={(event) => {
              const days = Number(event.target.value);
              setTrainingDays(days);
              if (days === 7) {
                setAvailableWeekdays([1, 2, 3, 4, 5, 6, 0]);
              } else {
                setAvailableWeekdays(days === 3 ? [1, 3, 5] : [1, 2, 4, 5]);
              }
            }}>
              <option value={7}>推/拉/蹲 A-B 格式</option>
              <option value={3}>3 天推/拉/蹲基础</option>
              <option value={4}>4 天推/拉/蹲过渡</option>
            </select>
          </Field>

          <Field label="单次时长">
            <select className="h-11 w-full rounded-lg border border-line bg-white px-3" value={sessionDuration} onChange={(event) => setSessionDuration(Number(event.target.value))}>
              <option value={45}>45 分钟</option>
              <option value={60}>60 分钟</option>
              <option value={75}>75 分钟</option>
              <option value={90}>90 分钟</option>
            </select>
          </Field>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-muted">可训练日，需选择 {trainingDays} 天</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {weekdays.map((day) => (
              <button
                className={`h-10 rounded-lg border text-sm font-semibold ${availableWeekdays.includes(day.value) ? "border-action bg-action text-white" : "border-line bg-white text-ink"}`}
                key={day.value}
                type="button"
                onClick={() => toggleWeekday(day.value)}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-medium text-muted">伤痛或禁忌动作，可选</span>
          <textarea
            className="min-h-20 w-full rounded-lg border border-line bg-white px-3 py-2"
            value={injuryNotes}
            onChange={(event) => setInjuryNotes(event.target.value)}
            placeholder="例如：右肩不适，暂时不做过顶推"
          />
        </label>
      </section>

      <section className="rounded-xl border border-line p-4">
        <div className="mb-4 flex items-center gap-2">
          <Dumbbell size={18} className="text-action" />
        <h2 className="font-semibold">关键动作最近工作组</h2>
      </div>
      <p className="mb-4 text-sm leading-6 text-muted">
          填最近稳定完成的一组，比如深蹲 100kg x 5。系统会以这个工作重量作为第一版计划基准。
      </p>

        <div className="space-y-3">
          {mainLifts.map((exercise) => (
            <div className="grid grid-cols-[1fr_96px_80px] items-end gap-3" key={exercise.slug}>
              <p className="pb-2 font-semibold">{exercise.name}</p>
              <Field label="重量 kg">
                <input
                  className="h-11 w-full rounded-lg border border-line px-3"
                  inputMode="decimal"
                  min="0"
                  required
                  type="number"
                  value={liftInputs[exercise.slug]?.weight ?? ""}
                  onChange={(event) => updateLiftInput(exercise.slug, "weight", event.target.value)}
                />
              </Field>
              <Field label="次数">
                <input
                  className="h-11 w-full rounded-lg border border-line px-3"
                  inputMode="numeric"
                  min="1"
                  required
                  type="number"
                  value={liftInputs[exercise.slug]?.reps ?? "5"}
                  onChange={(event) => updateLiftInput(exercise.slug, "reps", event.target.value)}
                />
              </Field>
            </div>
          ))}
        </div>
      </section>

      <button
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={status === "saving"}
        type="submit"
      >
        {status === "saving" ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
        保存训练画像
      </button>
    </form>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
