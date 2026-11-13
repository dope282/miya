'use strict';
// Өгөгдлийн сан: Vercel дээр DATABASE_URL-аар Postgres (Neon), компьютер дээр data/pg хавтсанд PGlite.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const URL_ = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products(
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL, old_price INTEGER,
  material TEXT NOT NULL DEFAULT '', model_info TEXT NOT NULL DEFAULT '',
  sizes TEXT NOT NULL DEFAULT '{}', image TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders(
  id TEXT PRIMARY KEY, token TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  name TEXT NOT NULL, phone TEXT NOT NULL, district TEXT NOT NULL, khoroo INTEGER NOT NULL,
  address TEXT NOT NULL, pay TEXT NOT NULL,
  subtotal INTEGER NOT NULL, discount INTEGER NOT NULL, shipping INTEGER NOT NULL, total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', paid INTEGER NOT NULL DEFAULT 0,
  courier_status TEXT NOT NULL DEFAULT '', courier_note TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS images(name TEXT PRIMARY KEY, mime TEXT NOT NULL, data BYTEA NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts(ip TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at TEXT NOT NULL);
`;

const db = { local: !URL_, q: null, tx: null, ready };
let pending;
function ready() { return (pending ||= init().catch((e) => { pending = null; throw e; })); }

async function init() {
  let exec;
  if (URL_) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: URL_, max: 3, idleTimeoutMillis: 10000 });
    db.q = (t, p) => pool.query(t, p).then((r) => r.rows);
    exec = (t) => pool.query(t);
    db.tx = async (fn) => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn((t, p) => c.query(t, p).then((x) => x.rows));
        await c.query('COMMIT');
        return r;
      } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
    };
  } else {
    fs.mkdirSync(DATA, { recursive: true });
    const mod = '@electric-sql/pglite'; // зөвхөн дотоод хөгжүүлэлтэд (devDependency)
    const { PGlite } = await import(mod);
    const pg = new PGlite(path.join(DATA, 'pg'));
    db.q = (t, p) => pg.query(t, p).then((r) => r.rows);
    exec = (t) => pg.exec(t);
    db.tx = (fn) => pg.transaction((t) => fn((s, p) => t.query(s, p).then((r) => r.rows)));
  }
  await exec(SCHEMA);
  await db.tx(async (q) => {
    await q('SELECT pg_advisory_xact_lock(74610)'); // зэрэг ассан хоёр функц давхар бөглөхөөс сэргийлнэ
    if ((await q('SELECT COUNT(*)::int AS c FROM products'))[0].c > 0) return;
    const old = path.join(DATA, 'miya.db');
    if (fs.existsSync(old)) await importSqlite(q, old); else await seed(q);
  });
}

const INS_PRODUCT = `INSERT INTO products(name,category,brand,color,price,old_price,material,model_info,sizes,image,active,created_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`;

async function seed(q) {
  const cl = { XS: 0, S: 3, M: 2, L: 4, XL: 0 }, now = new Date().toISOString();
  const rows = [
    ['Арьсан куртик', 'Куртик', 'Хар', 459000, 559000, '100% хонины арьс', cl],
    ['Үслэг пальто', 'Пальто', 'Шаргал', 689000, null, 'Ноос 80%, кашемир 20%', { S: 2, M: 3, L: 1 }],
    ['Цагаан пиджак', 'Пиджак', 'Цагаан', 329000, null, 'Полиэстер 65%, вискоз 35%', { S: 4, M: 4, L: 2 }],
    ['Трикотаж цамц', 'Цамц', 'Саарал', 149000, 189000, 'Хөвөн 60%, акрил 40%', { S: 5, M: 6, L: 3 }],
    ['Өргөн өмд', 'Өмд', 'Хар', 189000, null, 'Полиэстер 70%, вискоз 30%', { S: 3, M: 5, L: 2 }],
    ['Гинжин цүнх', 'Цүнх', 'Хар', 259000, 319000, 'Хиймэл арьс', { 'Нэг хэмжээ': 6 }],
    ['Өндөр түрийтэй гутал', 'Гутал', 'Хар', 389000, null, 'Жинхэнэ арьс', { 36: 2, 37: 3, 38: 2, 39: 1 }],
    ['Костюм пиджак', 'Пиджак', 'Саарал', 359000, 429000, 'Ноос 50%, полиэстер 50%', { S: 2, M: 3, L: 2 }],
  ];
  for (const [name, cat, color, price, old, mat, sizes] of rows)
    await q(INS_PRODUCT, [name, cat, 'Солонгос брэнд', color, price, old, mat, '172 см · M', JSON.stringify(sizes), '', 1, now]);
}

// Өмнөх хувилбарын SQLite сан (data/miya.db) байвал бараа, захиалга, зургийг нэг удаа хуулна
async function importSqlite(q, file) {
  const { DatabaseSync } = require('node:sqlite');
  const s = new DatabaseSync(file, { readOnly: true });
  try {
    for (const p of s.prepare('SELECT * FROM products ORDER BY id').all())
      await q(`INSERT INTO products(id,name,category,brand,color,price,old_price,material,model_info,sizes,image,active,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [p.id, p.name, p.category, p.brand, p.color, p.price, p.old_price, p.material, p.model_info, p.sizes, p.image, p.active, p.created_at]);
    await q("SELECT setval(pg_get_serial_sequence('products','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM products), 1))");
    for (const o of s.prepare('SELECT * FROM orders').all())
      await q(`INSERT INTO orders(id,token,created_at,updated_at,name,phone,district,khoroo,address,pay,subtotal,discount,shipping,total,status,paid,courier_status,courier_note,items)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [o.id, o.token, o.created_at, o.updated_at, o.name, o.phone, o.district, o.khoroo, o.address, o.pay, o.subtotal, o.discount, o.shipping, o.total, o.status, o.paid, o.courier_status, o.courier_note, o.items]);
    for (const m of s.prepare("SELECT * FROM meta WHERE k IN ('order_seq','banner')").all())
      await q('INSERT INTO meta(k,v) VALUES($1,$2) ON CONFLICT(k) DO NOTHING', [m.k, m.v]);
  } finally { s.close(); }
  const dir = path.join(DATA, 'uploads'), mime = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
    const m = mime[path.extname(f).toLowerCase()];
    if (m) await q('INSERT INTO images(name,mime,data) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING', [f, m, fs.readFileSync(path.join(dir, f))]);
  }
  console.log('Өмнөх SQLite сангаас өгөгдлийг хууллаа.');
}

module.exports = db;
