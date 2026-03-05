import { NextResponse } from 'next/server';
import { Pool, type PoolClient } from 'pg';

const DEFAULT_COLOR = '#ec4899';
const SCHEDULE_ITEMS_TABLE = 'schedule_items';
const MAX_BULK_ITEMS = 30;

// Initialize connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

type ScheduleItem = {
  id: number;
  memo: string;
  color: string;
  sortOrder: number;
};

type ScheduleResponse = Record<string, ScheduleItem[]>;

type CreatePayload = {
  action?: 'create';
  date?: string;
  memo?: string;
  color?: string;
};

type DeletePayload = {
  action: 'delete';
  id?: number;
};

type ClearDatePayload = {
  action: 'clearDate';
  date?: string;
};

type UpdatePayload = {
  action: 'update';
  id?: number;
  memo?: string;
  color?: string;
};

type ReorderPayload = {
  action: 'reorder';
  date?: string;
  orderedIds?: number[];
};

type CreateManyItem = {
  memo?: string;
  color?: string;
};

type CreateManyPayload = {
  action: 'createMany';
  date?: string;
  items?: CreateManyItem[];
};

type SchedulePostPayload =
  | CreatePayload
  | DeletePayload
  | ClearDatePayload
  | UpdatePayload
  | ReorderPayload
  | CreateManyPayload;

let initPromise: Promise<void> | null = null;

const parseDate = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const date = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
};

const parsePositiveId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const normalizeColor = (value: unknown): string => {
  if (typeof value !== 'string') return DEFAULT_COLOR;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_COLOR;
};

const getNextSortOrder = async (client: PoolClient, date: string): Promise<number> => {
  const orderResult = await client.query<{ next_order: number }>(
    `
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
      FROM ${SCHEDULE_ITEMS_TABLE}
      WHERE date = $1;
    `,
    [date]
  );
  return Number(orderResult.rows[0]?.next_order ?? 0);
};

// Auto-create table on first load and migrate legacy one-row-per-day data.
async function ensureTableExists() {
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEDULE_ITEMS_TABLE} (
          id BIGSERIAL PRIMARY KEY,
          date VARCHAR(10) NOT NULL,
          memo TEXT NOT NULL,
          color VARCHAR(20) NOT NULL DEFAULT '${DEFAULT_COLOR}',
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${SCHEDULE_ITEMS_TABLE}_date
          ON ${SCHEDULE_ITEMS_TABLE}(date);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${SCHEDULE_ITEMS_TABLE}_date_sort_order
          ON ${SCHEDULE_ITEMS_TABLE}(date, sort_order);
      `);
      await client.query(`
        ALTER TABLE ${SCHEDULE_ITEMS_TABLE}
        ADD COLUMN IF NOT EXISTS sort_order INTEGER;
      `);
      await client.query(`
        WITH ranked AS (
          SELECT
            id,
            ROW_NUMBER() OVER (PARTITION BY date ORDER BY created_at ASC, id ASC) - 1 AS seq
          FROM ${SCHEDULE_ITEMS_TABLE}
        )
        UPDATE ${SCHEDULE_ITEMS_TABLE} si
        SET sort_order = ranked.seq
        FROM ranked
        WHERE si.id = ranked.id
          AND (si.sort_order IS NULL OR si.sort_order <> ranked.seq);
      `);
      await client.query(`
        UPDATE ${SCHEDULE_ITEMS_TABLE}
        SET sort_order = 0
        WHERE sort_order IS NULL;
      `);
      await client.query(`
        ALTER TABLE ${SCHEDULE_ITEMS_TABLE}
        ALTER COLUMN sort_order SET DEFAULT 0;
      `);
      await client.query(`
        ALTER TABLE ${SCHEDULE_ITEMS_TABLE}
        ALTER COLUMN sort_order SET NOT NULL;
      `);

      const legacyTable = await client.query<{ exists: boolean }>(
        `SELECT to_regclass('public.schedules') IS NOT NULL AS exists;`
      );
      const hasLegacyTable = legacyTable.rows[0]?.exists === true;

      if (hasLegacyTable) {
        await client.query(
          `
            INSERT INTO ${SCHEDULE_ITEMS_TABLE} (date, memo, color, sort_order)
            SELECT
              s.date,
              COALESCE(s.memo, ''),
              COALESCE(NULLIF(s.color, ''), $1),
              0
            FROM schedules s
            WHERE s.date IS NOT NULL
              AND s.date <> ''
              AND NOT EXISTS (
                SELECT 1
                FROM ${SCHEDULE_ITEMS_TABLE} si
                WHERE si.date = s.date
                  AND si.memo = COALESCE(s.memo, '')
                  AND si.color = COALESCE(NULLIF(s.color, ''), $1)
              );
          `,
          [DEFAULT_COLOR]
        );
      }
    } finally {
      client.release();
    }
  })();

  try {
    await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

export async function GET() {
  try {
    await ensureTableExists();
    const client = await pool.connect();

    try {
      const result = await client.query<{
        id: number;
        date: string;
        memo: string;
        color: string;
        sort_order: number;
      }>(`
        SELECT id::int AS id, date, memo, color, sort_order::int AS sort_order
        FROM ${SCHEDULE_ITEMS_TABLE}
        ORDER BY date ASC, sort_order ASC, created_at ASC, id ASC;
      `);

      const schedules: ScheduleResponse = {};
      for (const row of result.rows) {
        const dateKey = row.date;
        if (!schedules[dateKey]) {
          schedules[dateKey] = [];
        }
        schedules[dateKey].push({
          id: row.id,
          memo: row.memo,
          color: row.color || DEFAULT_COLOR,
          sortOrder: Number(row.sort_order) || 0
        });
      }

      return NextResponse.json(schedules);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to read schedules from DB:', error);
    return NextResponse.json({ error: 'Failed to read schedules' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureTableExists();
    const payload = (await request.json()) as SchedulePostPayload;
    const action = payload.action ?? 'create';
    const client = await pool.connect();

    try {
      if (action === 'createMany') {
        const createManyPayload = payload as CreateManyPayload;
        const date = parseDate(createManyPayload.date);
        if (!date) {
          return NextResponse.json({ error: 'Valid date (YYYY-MM-DD) is required' }, { status: 400 });
        }

        const items = Array.isArray(createManyPayload.items) ? createManyPayload.items : [];
        const sanitizedItems = items
          .map((item) => ({
            memo: typeof item?.memo === 'string' ? item.memo.trim() : '',
            color: normalizeColor(item?.color)
          }))
          .filter((item) => item.memo.length > 0);

        if (sanitizedItems.length === 0) {
          return NextResponse.json({ error: 'At least one memo is required' }, { status: 400 });
        }
        if (sanitizedItems.length > MAX_BULK_ITEMS) {
          return NextResponse.json(
            { error: `You can add up to ${MAX_BULK_ITEMS} schedules at once` },
            { status: 400 }
          );
        }

        await client.query('BEGIN');
        try {
          let sortOrder = await getNextSortOrder(client, date);
          const createdItems: Array<{
            id: number;
            date: string;
            memo: string;
            color: string;
            sort_order: number;
          }> = [];

          for (const item of sanitizedItems) {
            const insert = await client.query<{
              id: number;
              date: string;
              memo: string;
              color: string;
              sort_order: number;
            }>(
              `
                INSERT INTO ${SCHEDULE_ITEMS_TABLE} (date, memo, color, sort_order)
                VALUES ($1, $2, $3, $4)
                RETURNING id::int AS id, date, memo, color, sort_order::int AS sort_order;
              `,
              [date, item.memo, item.color, sortOrder]
            );
            createdItems.push(insert.rows[0]);
            sortOrder += 1;
          }

          await client.query('COMMIT');
          return NextResponse.json({
            success: true,
            action: 'createMany',
            items: createdItems
          });
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }

      if (action === 'delete') {
        const deletePayload = payload as DeletePayload;
        const id = parsePositiveId(deletePayload.id);
        if (!id) {
          return NextResponse.json({ error: 'Valid schedule id is required' }, { status: 400 });
        }

        const result = await client.query(
          `DELETE FROM ${SCHEDULE_ITEMS_TABLE} WHERE id = $1`,
          [id]
        );
        if ((result.rowCount ?? 0) === 0) {
          return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, action: 'delete', id });
      }

      if (action === 'update') {
        const updatePayload = payload as UpdatePayload;
        const id = parsePositiveId(updatePayload.id);
        if (!id) {
          return NextResponse.json({ error: 'Valid schedule id is required' }, { status: 400 });
        }

        const memo =
          typeof updatePayload.memo === 'string' ? updatePayload.memo.trim() : null;
        if (memo !== null && memo.length === 0) {
          return NextResponse.json({ error: 'Memo cannot be empty' }, { status: 400 });
        }
        const color =
          typeof updatePayload.color === 'string' ? updatePayload.color.trim() : '';

        if (memo === null && color.length === 0) {
          return NextResponse.json({ error: 'Memo or color is required' }, { status: 400 });
        }

        const result = await client.query<{
          id: number;
          date: string;
          memo: string;
          color: string;
          sort_order: number;
        }>(
          `
            UPDATE ${SCHEDULE_ITEMS_TABLE}
            SET
              memo = COALESCE(NULLIF($2::text, ''), memo),
              color = COALESCE(NULLIF($3::text, ''), color)
            WHERE id = $1
            RETURNING id::int AS id, date, memo, color, sort_order::int AS sort_order;
          `,
          [id, memo, color]
        );

        if ((result.rowCount ?? 0) === 0) {
          return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
        }

        return NextResponse.json({
          success: true,
          action: 'update',
          item: result.rows[0]
        });
      }

      const payloadWithDate = payload as CreatePayload | ClearDatePayload | ReorderPayload;
      const date = parseDate(payloadWithDate.date);
      if (!date) {
        return NextResponse.json({ error: 'Valid date (YYYY-MM-DD) is required' }, { status: 400 });
      }

      if (action === 'reorder') {
        const reorderPayload = payload as ReorderPayload;
        const orderedIdsRaw = Array.isArray(reorderPayload.orderedIds)
          ? reorderPayload.orderedIds
          : [];
        const orderedIds = orderedIdsRaw
          .map((id) => parsePositiveId(id))
          .filter((id): id is number => id !== null);
        const uniqueIds = Array.from(new Set(orderedIds));

        if (orderedIds.length === 0 || uniqueIds.length !== orderedIds.length) {
          return NextResponse.json({ error: 'orderedIds must be a unique id list' }, { status: 400 });
        }

        const existing = await client.query<{ id: number }>(
          `
            SELECT id::int AS id
            FROM ${SCHEDULE_ITEMS_TABLE}
            WHERE date = $1
            ORDER BY sort_order ASC, created_at ASC, id ASC;
          `,
          [date]
        );
        const existingIds = existing.rows.map((row) => row.id);
        if (existingIds.length !== orderedIds.length) {
          return NextResponse.json({ error: 'orderedIds does not match date schedules' }, { status: 400 });
        }

        const existingSet = new Set(existingIds);
        for (const id of orderedIds) {
          if (!existingSet.has(id)) {
            return NextResponse.json({ error: 'orderedIds contains invalid schedule id' }, { status: 400 });
          }
        }

        await client.query('BEGIN');
        try {
          for (const [index, id] of orderedIds.entries()) {
            await client.query(
              `
                UPDATE ${SCHEDULE_ITEMS_TABLE}
                SET sort_order = $1
                WHERE id = $2 AND date = $3;
              `,
              [index, id, date]
            );
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }

        return NextResponse.json({ success: true, action: 'reorder', date });
      }

      if (action === 'clearDate') {
        await client.query(
          `DELETE FROM ${SCHEDULE_ITEMS_TABLE} WHERE date = $1`,
          [date]
        );
        return NextResponse.json({ success: true, action: 'clearDate', date });
      }

      const createPayload = payload as CreatePayload;
      const memo = typeof createPayload.memo === 'string' ? createPayload.memo.trim() : '';
      if (!memo) {
        return NextResponse.json({ error: 'Memo is required' }, { status: 400 });
      }
      const color = normalizeColor(createPayload.color);
      const sortOrder = await getNextSortOrder(client, date);

      const insert = await client.query<{
        id: number;
        date: string;
        memo: string;
        color: string;
        sort_order: number;
      }>(
        `
          INSERT INTO ${SCHEDULE_ITEMS_TABLE} (date, memo, color, sort_order)
          VALUES ($1, $2, $3, $4)
          RETURNING id::int AS id, date, memo, color, sort_order::int AS sort_order;
        `,
        [date, memo, color, sortOrder]
      );

      const created = insert.rows[0];
      return NextResponse.json({
        success: true,
        action: 'create',
        item: created
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to update schedule in DB:', error);
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
  }
}
