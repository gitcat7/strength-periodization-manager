export type ProgramRegenerationOutcome =
  | {
      clearPendingPayload: true;
      dialogAction: "reloadFailed";
      dialogMessage: string;
      focusScheduleRow: false;
      message: string;
      staleData: {
        program: null;
        recommendationWeights: Record<string, string>;
        recommendations: [];
        workoutExercises: [];
        workouts: [];
      };
      type: "reloadFailed";
    }
  | {
      clearPendingPayload: true;
      dialogAction: "requestSucceeded";
      focusScheduleRow: true;
      message: string;
      type: "succeeded";
    };

export function resolveProgramRegenerationOutcome({
  freshProgramLoaded,
  replacementSucceeded
}: {
  freshProgramLoaded: boolean;
  replacementSucceeded: true;
}): ProgramRegenerationOutcome {
  if (!replacementSucceeded || !freshProgramLoaded) {
    return {
      clearPendingPayload: true,
      dialogAction: "reloadFailed",
      dialogMessage: "新计划已生成，但无法加载最新日程。请刷新页面后再继续训练。",
      focusScheduleRow: false,
      message: "新计划已生成，但无法加载最新日程。请刷新页面后再继续训练，当前显示的旧日程已不再有效。",
      staleData: {
        program: null,
        recommendationWeights: {},
        recommendations: [],
        workoutExercises: [],
        workouts: []
      },
      type: "reloadFailed"
    };
  }

  return {
    clearPendingPayload: true,
    dialogAction: "requestSucceeded",
    focusScheduleRow: true,
    message: "新训练计划已生成。",
    type: "succeeded"
  };
}
