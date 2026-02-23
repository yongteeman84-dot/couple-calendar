import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Initialize connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Auto-create table on first load
async function ensureTableExists() {
    const client = await pool.connect();
    try {
        await client.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        date VARCHAR(10) PRIMARY KEY,
        memo TEXT,
        color VARCHAR(20)
      );
    `);
    } finally {
        client.release();
    }
}

export async function GET() {
    try {
        await ensureTableExists();
        const client = await pool.connect();

        try {
            const result = await client.query('SELECT * FROM schedules');

            // Transform from row array to the expected JSON Object format { "YYYY-MM-DD": { memo, color } }
            const schedules = result.rows.reduce((acc, row) => {
                acc[row.date] = { memo: row.memo, color: row.color };
                return acc;
            }, {} as Record<string, { memo: string, color: string }>);

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
        const { date, memo, color } = await request.json();

        if (!date) {
            return NextResponse.json({ error: 'Date is required' }, { status: 400 });
        }

        const client = await pool.connect();
        try {
            // Delete if empty, otherwise Upsert
            if (!memo && !color) {
                await client.query('DELETE FROM schedules WHERE date = $1', [date]);
            } else {
                await client.query(`
          INSERT INTO schedules (date, memo, color) 
          VALUES ($1, $2, $3)
          ON CONFLICT (date) DO UPDATE 
          SET memo = EXCLUDED.memo, color = EXCLUDED.color;
        `, [date, memo || '', color || '#ffffff']);
            }

            return NextResponse.json({ success: true });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Failed to update schedule in DB:', error);
        return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
    }
}
