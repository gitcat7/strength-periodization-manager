export function estimateOneRepMax(weight: number, reps: number) {
  if (weight <= 0 || reps <= 0) {
    return 0;
  }

  return weight * (1 + reps / 30);
}

export function calculateTrainingMax(estimatedOneRepMax: number, experienceLevel: string) {
  const baseTrainingMax = estimatedOneRepMax * 0.9;
  const conservativeFactor = experienceLevel === "beginner" ? 0.95 : 1;

  return baseTrainingMax * conservativeFactor;
}

export function roundToNearestPlate(weight: number, increment = 2.5) {
  if (weight <= 0) {
    return 0;
  }

  return Math.round(weight / increment) * increment;
}

