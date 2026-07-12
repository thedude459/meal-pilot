export const QUANTITY_DECIMAL_PLACES = 3;

export function roundQuantity(n: number): number {
  const factor = 10 ** QUANTITY_DECIMAL_PLACES;
  return Math.round(n * factor) / factor;
}
