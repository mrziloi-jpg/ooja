// Fills glossary fields from the design content. Safe to re-run: only empty fields are filled,
// new ingredients are inserted, and admin edits are left alone.  npm run db:seed-ingredients
import postgres from 'postgres';
import { INGREDIENT_CONTENT } from './ingredient-content';

const sql = postgres(process.env.DATABASE_URL || 'postgres://lumiere:lumiere@localhost:5432/lumiere', { max: 1 });

for (const [i, g] of INGREDIENT_CONTENT.entries()) {
  await sql`
    INSERT INTO ingredients (slug, name_en, name_fa, does, pct, sym, functions, good_for, when_to_use, pregnancy, sort)
    VALUES (${g.slug}, ${g.nameEn}, ${g.nameFa}, ${g.does}, ${g.pct}, ${g.sym}, ${g.functions}, ${g.goodFor}, ${g.whenToUse}, ${g.pregnancy}, ${i})
    ON CONFLICT (slug) DO UPDATE SET
      sym = coalesce(ingredients.sym, excluded.sym),
      functions = CASE WHEN cardinality(ingredients.functions) = 0 THEN excluded.functions ELSE ingredients.functions END,
      good_for = coalesce(ingredients.good_for, excluded.good_for),
      when_to_use = coalesce(ingredients.when_to_use, excluded.when_to_use),
      pregnancy = coalesce(ingredients.pregnancy, excluded.pregnancy),
      pct = coalesce(ingredients.pct, excluded.pct),
      sort = CASE WHEN ingredients.sort = 0 THEN excluded.sort ELSE ingredients.sort END,
      -- The design's fuller Persian names (e.g. "نیاسینامید (ویتامین B3)") replace the short seed name it extends.
      name_fa = CASE WHEN position('(' in ingredients.name_fa) = 0 AND excluded.name_fa LIKE ingredients.name_fa || ' (%' THEN excluded.name_fa ELSE ingredients.name_fa END`;
  for (const slug of g.products ?? []) {
    await sql`
      INSERT INTO product_ingredients (product_id, ingredient_id)
      SELECT p.id, i.id FROM products p, ingredients i WHERE p.slug = ${slug} AND i.slug = ${g.slug}
      ON CONFLICT DO NOTHING`;
  }
}
console.log(`glossary content applied to ${INGREDIENT_CONTENT.length} ingredients`);
await sql.end();
