// Pure module: imported by browser islands, so it must not import the database.
export const GOALS = [
  { id: 'acne', label: 'آکنه', serum: 'niacinamide-10-zinc-1', pm: 'niacinamide-10-zinc-1' },
  { id: 'aging', label: 'پیری پوست', serum: 'vitamin-c-15-ferulic', pm: 'retinal-0-1-emulsion' },
  { id: 'tone', label: 'لک', serum: 'vitamin-c-15-ferulic', pm: 'azelaic-acid-10-suspension' },
  { id: 'dryness', label: 'خشکی', serum: 'hyaluronic-acid-2-b5', pm: 'hyaluronic-acid-2-b5' },
  { id: 'redness', label: 'قرمزی', serum: 'hyaluronic-acid-2-b5', pm: 'azelaic-acid-10-suspension' },
];

export function buildRoutine(skin: string, goalId: string) {
  const goal = GOALS.find((g) => g.id === goalId) ?? GOALS[0];
  const cleanser = (skin === 'oily' || skin === 'combination') && goal.id !== 'redness' ? 'salicylic-acid-2-gel-cleanser' : 'ceramide-oat-cleanser';
  const moist = goal.id === 'aging' && skin !== 'sensitive' ? 'copper-peptides-1-cream' : 'ceramide-barrier-cream-5';
  const spf = skin === 'sensitive' || goal.id === 'redness' ? 'mineral-uv-filters-spf-40' : 'niacinamide-spf-50-fluid';
  let pm = goal.pm;
  if (skin === 'sensitive' && pm === 'retinal-0-1-emulsion') pm = 'azelaic-acid-10-suspension';
  return { goal, am: [cleanser, goal.serum, moist, spf], pm: [cleanser, pm, moist] };
}
