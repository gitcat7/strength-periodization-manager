export type ExternalExerciseReference = {
  provider: "wger";
  externalId: string;
  name: string;
  muscles: string[];
  equipment: string[];
  category: string | null;
  sourceUrl: string;
};

export type ExternalExerciseSnapshot = Pick<
  ExternalExerciseReference,
  "muscles" | "equipment" | "category" | "sourceUrl"
>;

export const isWgerExternalId = (value: string) => /^[1-9]\d{0,8}$/.test(value);

export const toExternalExerciseSnapshot = ({
  muscles,
  equipment,
  category,
  sourceUrl
}: ExternalExerciseReference): ExternalExerciseSnapshot => ({
  muscles,
  equipment,
  category,
  sourceUrl
});
