import 'server-only';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import {
  pgTable, text, numeric, integer, timestamp, pgEnum, serial
} from 'drizzle-orm/pg-core';
import { count, eq, ilike } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';

/** ใช้ได้ทั้ง DATABASE_URL และ POSTGRES_URL */
const DB_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!DB_URL) throw new Error('Missing DATABASE_URL/POSTGRES_URL');

export const sql = neon(DB_URL);          // สำหรับ API ที่ query ด้วย sql (เช่น /api/tasks/*)
export const db  = drizzle(neon(DB_URL)); // สำหรับ Drizzle ORM ของแดชบอร์ดเดิม

/** ====== ของเดิมจากเทมเพลต (Products) ====== */
export const statusEnum = pgEnum('status', ['active', 'inactive', 'archived']);

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  imageUrl: text('image_url').notNull(),
  name: text('name').notNull(),
  status: statusEnum('status').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  stock: integer('stock').notNull(),
  availableAt: timestamp('available_at').notNull()
});

export type SelectProduct = typeof products.$inferSelect;
export const insertProductSchema = createInsertSchema(products);

export async function getProducts(search: string, offset: number): Promise<{
  products: SelectProduct[]; newOffset: number | null; totalProducts: number;
}> {
  if (search) {
    return {
      products: await db.select().from(products)
        .where(ilike(products.name, `%${search}%`))
        .limit(1000),
      newOffset: null,
      totalProducts: 0
    };
  }
  if (offset === null) return { products: [], newOffset: null, totalProducts: 0 };

  const total = await db.select({ count: count() }).from(products);
  const list  = await db.select().from(products).limit(5).offset(offset);
  const next  = list.length >= 5 ? offset + 5 : null;

  return { products: list, newOffset: next, totalProducts: total[0].count };
}

export async function deleteProductById(id: number) {
  await db.delete(products).where(eq(products.id, id));
}
