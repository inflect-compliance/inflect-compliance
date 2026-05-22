/* eslint-disable @typescript-eslint/no-explicit-any -- Dub-ported utility code; preserves upstream shape. */
export const randomValue = (values: any[]) => {
  return values[Math.floor(Math.random() * values.length)];
};
