/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkoutPrescriptionExerciseCard, type WorkoutPrescriptionCatalogExercise } from "./workout-prescription-exercise-card";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const exercise = {
  exerciseId: "squat-1",
  slug: "back_squat",
  name: "深蹲",
  direction: "squat" as const,
  orderIndex: 1,
  targetSets: 3,
  targetReps: 5,
  targetWeight: 100,
  provider: "local"
};

const catalog: WorkoutPrescriptionCatalogExercise[] = [
  { id: "squat-1", slug: "back_squat", name: "深蹲", training_direction: "squat" },
  { id: "squat-2", slug: "front_squat", name: "前蹲", training_direction: "squat" },
  { id: "squat-3", slug: "leg_press", name: "腿举", training_direction: "squat" },
  { id: "push-1", slug: "bench_press", name: "卧推", training_direction: "push" }
];

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

function renderCard(overrides: Partial<React.ComponentProps<typeof WorkoutPrescriptionExerciseCard>> = {}) {
  const props: React.ComponentProps<typeof WorkoutPrescriptionExerciseCard> = {
    catalog,
    direction: "squat",
    exercise,
    index: 0,
    onChange: vi.fn(),
    onInsertAfter: vi.fn(),
    onMove: vi.fn(),
    onRemove: vi.fn(),
    totalExercises: 3,
    usedExerciseIds: ["squat-1", "squat-3"],
    ...overrides
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<WorkoutPrescriptionExerciseCard {...props} />));
  return props;
}

function findButton(text: string) {
  const button = [...container!.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(text));
  if (!button) throw new Error(`missing button: ${text}`);
  return button;
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("WorkoutPrescriptionExerciseCard", () => {
  it("shows a readable action card and opens replace or position-specific insert controls on demand", () => {
    const props = renderCard();
    expect(container?.textContent).toContain("深蹲");
    expect(container?.textContent).toContain("3 组 x 5 次 @ 100kg");
    expect(container?.querySelector('select[aria-label="第 1 个动作"]')).toBeNull();
    expect(findButton("更换动作").className).toContain("h-11");
    expect(findButton("删除动作").className).toContain("h-11");
    expect(findButton("在此动作后新增").className).toContain("h-11");

    act(() => findButton("更换动作").click());
    const replacement = container?.querySelector<HTMLSelectElement>('select[aria-label="更换深蹲"]');
    expect([...replacement!.options].map((option) => option.value)).toEqual(["", "squat-1", "squat-2"]);
    act(() => setSelectValue(replacement!, "squat-2"));
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ exerciseId: "squat-2", name: "前蹲" }));

    act(() => findButton("在此动作后新增").click());
    const insertion = container?.querySelector<HTMLSelectElement>('select[aria-label="在深蹲后新增动作"]');
    expect([...insertion!.options].map((option) => option.value)).toEqual(["", "squat-2"]);
    act(() => setSelectValue(insertion!, "squat-2"));
    expect(props.onInsertAfter).toHaveBeenCalledWith(catalog[1]);
  });

  it("protects the final action and the twelve-action maximum", () => {
    renderCard({ totalExercises: 1 });
    expect(findButton("删除动作").getAttribute("title")).toBe("至少保留一个动作");
    expect((findButton("删除动作") as HTMLButtonElement).disabled).toBe(true);

    act(() => root?.unmount());
    container!.innerHTML = "";
    root = createRoot(container!);
    act(() => root?.render(<WorkoutPrescriptionExerciseCard
      catalog={catalog}
      direction="squat"
      exercise={exercise}
      index={0}
      onChange={vi.fn()}
      onInsertAfter={vi.fn()}
      onMove={vi.fn()}
      onRemove={vi.fn()}
      totalExercises={12}
      usedExerciseIds={["squat-1"]}
    />));
    expect(findButton("在此动作后新增").getAttribute("title")).toBe("每个训练日最多 12 个动作");
    expect((findButton("在此动作后新增") as HTMLButtonElement).disabled).toBe(true);
  });
});
