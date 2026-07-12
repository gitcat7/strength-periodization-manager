export function createLatestExerciseDetailRequest() {
  let disposed = false;
  let latestRequest = 0;

  return {
    dispose() {
      disposed = true;
    },
    isCurrent(request: number) {
      return !disposed && request === latestRequest;
    },
    start() {
      latestRequest += 1;
      return latestRequest;
    }
  };
}
