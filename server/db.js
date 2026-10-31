import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config, ROOT_DIR } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

const txStorage = new AsyncLocalStorage();

function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function getClient() {
  return txStorage.getStore() || pool;
}

export const query = {
  async all(sql, params = []) {
    sql = convertPlaceholders(sql);
    const client = getClient();
    const { rows } = await client.query(sql, params);
    return rows;
  },

  async get(sql, params = []) {
    sql = convertPlaceholders(sql);
    const client = getClient();
    const { rows } = await client.query(sql, params);
    return rows[0] || null;
  },

  async run(sql, params = []) {
    sql = convertPlaceholders(sql);

    let isInsertIgnore = false;
    if (/^INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql)) {
      isInsertIgnore = true;
      sql = sql.replace(/^INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO');
    }

    const hasReturning = /\bRETURNING\b/i.test(sql);

    if (isInsertIgnore && !hasReturning) {
      sql += ' ON CONFLICT DO NOTHING';
    } else if (isInsertIgnore && hasReturning) {
      sql = sql.replace(/\bRETURNING\b/i, 'ON CONFLICT DO NOTHING RETURNING');
    }

    if (/^INSERT\b/i.test(sql) && !/\bRETURNING\b/i.test(sql)) {
      sql += ' RETURNING *';
    }

    const client = getClient();
    const { rows, rowCount } = await client.query(sql, params);
    return { lastInsertRowid: rows[0]?.id, rows, rowCount };
  },

  async exec(sql) {
    const client = getClient();
    await client.query(sql);
  },
};

export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await txStorage.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function isSeeded() {
  const row = await query.get('SELECT COUNT(*) AS count FROM listings');
  return Boolean(row && Number(row.count) > 0);
}

export async function initDb() {
  const schemaPath = path.join(ROOT_DIR, 'db', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
  }
}