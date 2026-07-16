const retiredCatalogVerificationKey = "strength-training-exercise-catalog:last-verified";

// Kept temporarily for the settings screen so upgrades clear the obsolete static
// catalog verification record. It does not fetch, cache, or expose a catalog.
export function clearExerciseCatalogVerificationState() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(retiredCatalogVerificationKey);
  } catch {
    // Storage availability must not affect the app.
  }
}
