import { roundToNearestPlate } from "./strength";

export function applyRecommendationWeight({
  currentWeight,
  previousWeight,
  appliedWeight,
  increment
}: {
  currentWeight: number;
  previousWeight: number;
  appliedWeight: number;
  increment: number;
}) {
  if (currentWeight <= 0 || previousWeight <= 0 || appliedWeight <= 0) return currentWeight;
  return roundToNearestPlate(currentWeight * (appliedWeight / previousWeight), increment);
}
