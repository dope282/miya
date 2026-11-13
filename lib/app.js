'use strict';
// MIYA Boutique API. Vercel дээр api/index.js, компьютер дээр server.js энэ handler-ийг дуудна.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cfg = require('../config');
const db = require('./db');

// ---------- Туслах функцууд ----------
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (m) => { throw new HttpError(400, m); };
const nowIso = () => new Date().toISOString();

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  const data = isObj ? JSON.stringify(body) : body;
  res.writeHead(status, { 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(data);
}

function readJson(req, limit = 100_000) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').includes('application/json')) return reject(new HttpError(415, 'JSON хүсэлт шаардлагатай'));
    let pre;
    try { pre = req.body; } catch { return reject(new HttpError(400, 'JSON буруу байна')); } // Vercel биеийг урьдчилан задалдаг
    if (pre && typeof pre === 'object' && !Buffer.isBuffer(pre)) return resolve(pre);
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Хүсэлт хэт том байна')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new HttpError(400, 'JSON буруу байна')); } });
    req.on('error', reject);
  });
}

const str = (v, min, max, label) => {
  const s = String(v ?? '').trim();
  if (s.length < min || s.length > max) bad(`${label} буруу байна`);
  return s;
};
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

// Улаанбаатарын цаг (UTC+8)
const ubNow = () => new Date(Date.now() + 8 * 3600e3);
const ubDayStartIso = () => { const d = ubNow(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 8 * 3600e3).toISOString(); };

// ---------- Нууц түлхүүрүүд ----------
// Vercel: ADMIN_PASSWORD орчны хувьсагч заавал. Компьютер дээр: data/secrets.json (автоматаар үүснэ).
let secretsP;
function secrets() { return (secretsP ||= loadSecrets().catch((e) => { secretsP = null; throw e; })); }
async function loadSecrets() {
  let file = {};
  if (db.local) {
    const f = path.join(__dirname, '..', 'data', 'secrets.json');
    try { file = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {
      file = { adminPassword: crypto.randomBytes(9).toString('base64url'), courierKey: crypto.randomBytes(18).toString('base64url') };
      fs.writeFileSync(f, JSON.stringify(file, null, 2));
    }
  }
  for (const k of ['session_secret', 'courier_key'])
    await db.q('INSERT INTO meta(k,v) VALUES($1,$2) ON CONFLICT(k) DO NOTHING', [k, crypto.randomBytes(24).toString('base64url')]);
  const m = Object.fromEntries((await db.q("SELECT k,v FROM meta WHERE k IN ('session_secret','courier_key')")).map((r) => [r.k, r.v]));
  return {
    adminPassword: process.env.ADMIN_PASSWORD || file.adminPassword || '',
    courierKey: process.env.COURIER_KEY || file.courierKey || m.courier_key,
    sessionSecret: m.session_secret,
  };
}

// ---------- Баннер ----------
async function getBanner() {
  const row = (await db.q("SELECT v FROM meta WHERE k='banner'"))[0];
  try { return { ...cfg.sale, ...JSON.parse(row?.v || '{}') }; } catch { return { ...cfg.sale }; }
}

// ---------- Бараа ----------
function productOut(r, admin = false) {
  const p = {
    id: r.id, n: String(r.id).padStart(2, '0'), name: r.name, category: r.category, brand: r.brand, color: r.color,
    price: r.price, old: r.old_price || null,
    sale: r.old_price ? `−${Math.round((1 - r.price / r.old_price) * 100)}%` : null,
    material: r.material, model: r.model_info, sizes: JSON.parse(r.sizes), image: r.image,
  };
  if (admin) p.active = !!r.active;
  return p;
}

function productIn(b) {
  const price = Number(b.price), old = b.old ? Number(b.old) : null;
  if (!Number.isInteger(price) || price <= 0 || price > 5e7) bad('Үнэ буруу байна');
  if (old !== null && (!Number.isInteger(old) || old <= price || old > 5e7)) bad('Хуучин үнэ одоогийн үнээс их байх ёстой');
  const sizes = {};
  const entries = Object.entries(b.sizes && typeof b.sizes === 'object' ? b.sizes : {});
  if (!entries.length || entries.length > 12) bad('Хэмжээ, үлдэгдлээ оруулна уу');
  for (const [k, v] of entries) {
    const key = str(k, 1, 14, 'Хэмжээ'), q = Number(v);
    if (!Number.isInteger(q) || q < 0 || q > 9999) bad('Үлдэгдэл буруу байна');
    sizes[key] = q;
  }
  const image = String(b.image || '');
  if (image && !/^\/uploads\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(image)) bad('Зураг буруу байна');
  return [
    str(b.name, 1, 80, 'Нэр'), str(b.category, 1, 30, 'Ангилал'), str(b.brand, 0, 60, 'Брэнд'), str(b.color, 0, 40, 'Өнгө'),
    price, old, str(b.material, 0, 80, 'Материал'), str(b.model, 0, 60, 'Модель'), JSON.stringify(sizes), image, b.active === false ? 0 : 1,
  ];
}

// ---------- Захиалга ----------
async function nextOrderId(q) {
  const seq = Number((await q("INSERT INTO meta(k,v) VALUES('order_seq','1') ON CONFLICT(k) DO UPDATE SET v=(meta.v::int+1)::text RETURNING v"))[0].v);
  const d = ubNow();
  const dd = String(d.getUTCDate()).padStart(2, '0'), mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `MY-${dd}${mm}-${String(seq).padStart(4, '0')}`;
}

function createOrder(b) {
  const name = str(b.name, 2, 60, 'Нэр');
  const phone = String(b.phone ?? '').replace(/\D/g, '');
  if (!/^[5-9]\d{7}$/.test(phone)) bad('Утасны дугаар 8 оронтой байх ёстой');
  const district = String(b.district ?? '');
  if (!Object.hasOwn(cfg.districts, district)) bad('Дүүргээ сонгоно уу');
  const khoroo = Number(b.khoroo);
  if (!Number.isInteger(khoroo) || khoroo < 1 || khoroo > cfg.districts[district]) bad('Хороогоо сонгоно уу');
  const address = str(b.address, 5, 200, 'Дэлгэрэнгүй хаяг');
  const pay = b.pay === 'cod' ? 'cod' : b.pay === 'bank' ? 'bank' : bad('Төлбөрийн хэлбэрээ сонгоно уу');
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 30) bad('Сагс хоосон байна');

  const merged = new Map();
  for (const it of b.items) {
    const id = Number(it?.id), size = String(it?.size ?? ''), qty = Number(it?.qty);
    if (!Number.isInteger(id) || !size || !Number.isInteger(qty) || qty < 1 || qty > 20) bad('Сагсны мэдээлэл буруу байна');
    const k = `${id}|${size}`;
    merged.set(k, { id, size, qty: (merged.get(k)?.qty || 0) + qty });
  }
  const wanted = [...merged.values()].sort((a, b2) => a.id - b2.id); // түгжих дарааллыг тогтмол байлгана

  return db.tx(async (q) => {
    let subtotal = 0, discount = 0;
    const items = [], stock = new Map();
    for (const it of wanted) {
      let p = stock.get(it.id);
      if (!p) {
        p = (await q('SELECT * FROM products WHERE id=$1 AND active=1 FOR UPDATE', [it.id]))[0];
        if (!p) bad('Сагсан дахь бараа олдсонгүй');
        p.sz = JSON.parse(p.sizes); stock.set(it.id, p);
      }
      const left = Object.hasOwn(p.sz, it.size) ? p.sz[it.size] : 0;
      if (left < it.qty) bad(`«${p.name}» ${it.size} хэмжээ ${left ? `${left} ширхэг л үлдсэн` : 'дууссан'} байна`);
      p.sz[it.size] = left - it.qty;
      const full = p.old_price || p.price;
      subtotal += full * it.qty;
      discount += (full - p.price) * it.qty;
      items.push({ id: p.id, name: p.name, color: p.color, size: it.size, qty: it.qty, price: p.price, old: p.old_price || null, image: p.image });
    }
    for (const p of stock.values()) await q('UPDATE products SET sizes=$1 WHERE id=$2', [JSON.stringify(p.sz), p.id]);
    const goods = subtotal - discount;
    if (subtotal > 2e9) bad('Захиалгын дүн хэт их байна');
    const shipping = goods >= cfg.delivery.freeFrom ? 0 : cfg.delivery.fee;
    const id = await nextOrderId(q), token = crypto.randomBytes(16).toString('hex'), t = nowIso();
    await q(`INSERT INTO orders(id,token,created_at,updated_at,name,phone,district,khoroo,address,pay,subtotal,discount,shipping,total,items)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, token, t, t, name, phone, district, khoroo, address, pay, subtotal, discount, shipping, goods + shipping, JSON.stringify(items)]);
    return { id, token };
  });
}

const orderOut = (o) => ({
  id: o.id, created_at: o.created_at, updated_at: o.updated_at, name: o.name, phone: o.phone,
  district: o.district, khoroo: o.khoroo, address: o.address, pay: o.pay,
  subtotal: o.subtotal, discount: o.discount, shipping: o.shipping, total: o.total,
  status: o.status, paid: !!o.paid, courier_status: o.courier_status, courier_note: o.courier_note,
  items: JSON.parse(o.items),
});
// Хүргэлтийн компанид харагдах хэсэг: зөвхөн хүргэхэд хэрэгтэй мэдээлэл
const courierOut = (o) => ({
  id: o.id, name: o.name, phone: o.phone, district: o.district, khoroo: o.khoroo, address: o.address,
  items: JSON.parse(o.items).map((i) => ({ name: i.name, size: i.size, qty: i.qty })),
  collect: o.pay === 'cod' && !o.paid ? o.total : 0,
  status: o.status, courier_status: o.courier_status, courier_note: o.courier_note,
});

async function getOrder(q, id, lock = false) {
  const o = (await q(`SELECT * FROM orders WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [String(id)]))[0];
  if (!o) throw new HttpError(404, 'Захиалга олдсонгүй');
  return o;
}

async function setOrder(q, id, fields) {
  const keys = Object.keys(fields);
  await q(`UPDATE orders SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')}, updated_at=$${keys.length + 1} WHERE id=$${keys.length + 2}`,
    [...keys.map((k) => fields[k]), nowIso(), id]);
}

async function notifyPartner(o) {
  const url = cfg.delivery.partner.webhookUrl;
  if (!url) return;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(courierOut(o)), signal: AbortSignal.timeout(8000) });
    if (!r.ok) console.error(`[хүргэлт] ${o.id}: webhook ${r.status}`);
  } catch (e) { console.error(`[хүргэлт] ${o.id}: webhook алдаа — ${e.message}`); }
}

function orderAction(id, action) {
  return db.tx(async (q) => {
    const o = await getOrder(q, id, true);
    const need = (...st) => { if (!st.includes(o.status)) bad('Энэ төлөвт уг үйлдлийг хийх боломжгүй'); };
    switch (action) {
      case 'confirm': need('new'); await setOrder(q, id, { status: 'confirmed', paid: o.pay === 'bank' ? 1 : o.paid }); break;
      case 'ship': need('confirmed'); await setOrder(q, id, { status: 'shipping', courier_status: '', courier_note: '' }); break;
      case 'unship': need('shipping'); await setOrder(q, id, { status: 'confirmed', courier_status: '', courier_note: '' }); break;
      case 'deliver': need('shipping'); await setOrder(q, id, { status: 'delivered', paid: 1, courier_status: 'delivered' }); break;
      case 'cancel': {
        need('new', 'confirmed', 'shipping');
        const back = new Map(); // үлдэгдлийг буцаана
        for (const it of JSON.parse(o.items)) back.set(it.id, [...(back.get(it.id) || []), it]);
        for (const pid of [...back.keys()].sort((a, b2) => a - b2)) {
          const p = (await q('SELECT sizes FROM products WHERE id=$1 FOR UPDATE', [pid]))[0];
          if (!p) continue;
          const sizes = JSON.parse(p.sizes);
          for (const it of back.get(pid)) sizes[it.size] = (sizes[it.size] || 0) + it.qty;
          await q('UPDATE products SET sizes=$1 WHERE id=$2', [JSON.stringify(sizes), pid]);
        }
        await setOrder(q, id, { status: 'cancelled' });
        break;
      }
      default: bad('Үйлдэл буруу байна');
    }
    return getOrder(q, id);
  });
}

function courierAction(id, b) {
  return db.tx(async (q) => {
    const o = await getOrder(q, id, true);
    if (o.status !== 'shipping') bad('Энэ захиалга хүргэлтэнд гараагүй байна');
    const note = str(b.note, 0, 200, 'Тэмдэглэл');
    if (b.result === 'picked') await setOrder(q, id, { courier_status: 'picked', courier_note: '' });
    else if (b.result === 'delivered') await setOrder(q, id, { status: 'delivered', paid: 1, courier_status: 'delivered', courier_note: note });
    else if (b.result === 'failed') await setOrder(q, id, { courier_status: 'failed', courier_note: note || 'Хүргэж чадсангүй' });
    else bad('Үр дүн буруу байна');
    return getOrder(q, id);
  });
}

// ---------- Админ нэвтрэлт (сервергүй орчинд тохирсон, гарын үсэгтэй cookie) ----------
const SESSION_MS = 12 * 3600e3;
const sign = (exp, secret) => crypto.createHmac('sha256', secret).update(`admin.${exp}`).digest('base64url');
const cookie = (req, name) => (req.headers.cookie || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1];
const isHttps = (req) => req.headers['x-forwarded-proto'] === 'https';
const cookieStr = (req, value, maxAge) => `miya_admin=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;

async function requireAdmin(req) {
  const [exp, sig] = String(cookie(req, 'miya_admin') || '').split('.');
  const { sessionSecret } = await secrets();
  if (!exp || !sig || !(Number(exp) > Date.now()) || !safeEq(sig, sign(exp, sessionSecret))) throw new HttpError(401, 'Нэвтэрнэ үү');
}
async function requireCourier(req) {
  if (!safeEq(req.headers['x-courier-key'] || '', (await secrets()).courierKey)) throw new HttpError(401, 'Түлхүүр буруу байна');
}

async function login(req, b) {
  const { adminPassword, sessionSecret } = await secrets();
  if (!adminPassword) throw new HttpError(503, 'Админы нууц үг тохируулаагүй байна (ADMIN_PASSWORD)');
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?').split(',')[0].trim().slice(0, 60);
  const now = Date.now();
  const a = (await db.q('SELECT n, reset_at FROM login_attempts WHERE ip=$1', [ip]))[0];
  const live = a && Date.parse(a.reset_at) > now;
  if (live && a.n >= 10) throw new HttpError(429, 'Хэт олон оролдлого. 15 минутын дараа дахин оролдоно уу');
  if (!safeEq(b.password ?? '', adminPassword)) {
    await db.q(`INSERT INTO login_attempts(ip,n,reset_at) VALUES($1,1,$2)
      ON CONFLICT(ip) DO UPDATE SET n=CASE WHEN $3 THEN login_attempts.n+1 ELSE 1 END, reset_at=CASE WHEN $3 THEN login_attempts.reset_at ELSE $2 END`,
    [ip, new Date(now + 15 * 60e3).toISOString(), !!live]);
    throw new HttpError(401, 'Нууц үг буруу байна');
  }
  if (a) await db.q('DELETE FROM login_attempts WHERE ip=$1', [ip]);
  const exp = now + SESSION_MS;
  return `${exp}.${sign(exp, sessionSecret)}`;
}

const csvCell = (v) => `"${String(v).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;

// ---------- Чиглүүлэлт ----------
async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  // Vercel-ийн rewrite жинхэнэ замыг __path-аар дамжуулна
  const p = decodeURIComponent(url.searchParams.get('__path') || url.pathname), M = req.method;
  let m;
  await db.ready();

  if (M === 'GET' && (m = p.match(/^\/uploads\/([a-f0-9]{24}\.(?:jpg|png|webp))$/))) {
    const img = (await db.q('SELECT mime, data FROM images WHERE name=$1', [m[1]]))[0];
    if (!img) return send(res, 404, 'Олдсонгүй');
    return send(res, 200, Buffer.from(img.data), { 'Content-Type': img.mime, 'Cache-Control': 'public, max-age=31536000, immutable' });
  }

  // --- Нээлттэй ---
  if (M === 'GET' && p === '/api/config') {
    const { fee, freeFrom, eta } = cfg.delivery;
    return send(res, 200, { shop: cfg.shop, delivery: { fee, freeFrom, eta }, sale: await getBanner(), bank: cfg.bank, districts: cfg.districts });
  }
  if (M === 'GET' && p === '/api/products')
    return send(res, 200, (await db.q('SELECT * FROM products WHERE active=1 ORDER BY id')).map((r) => productOut(r)));
  if (M === 'POST' && p === '/api/orders') return send(res, 201, await createOrder(await readJson(req)));
  if (M === 'GET' && (m = p.match(/^\/api\/orders\/([\w-]{1,30})$/))) {
    const o = await getOrder(db.q, m[1]);
    if (!safeEq(url.searchParams.get('t') || '', o.token)) throw new HttpError(404, 'Захиалга олдсонгүй');
    return send(res, 200, orderOut(o));
  }

  // --- Хүргэлтийн хамтрагч ---
  if (p.startsWith('/api/courier/')) {
    await requireCourier(req);
    if (M === 'GET' && p === '/api/courier/orders') {
      const rows = await db.q("SELECT * FROM orders WHERE status='shipping' OR (status='delivered' AND courier_status='delivered' AND updated_at>=$1) ORDER BY status DESC, district, khoroo", [ubDayStartIso()]);
      return send(res, 200, { shop: { name: cfg.shop.name, phone: cfg.shop.phone }, orders: rows.map(courierOut) });
    }
    if (M === 'POST' && (m = p.match(/^\/api\/courier\/orders\/([\w-]{1,30})$/)))
      return send(res, 200, courierOut(await courierAction(m[1], await readJson(req))));
    return send(res, 404, { error: 'Олдсонгүй' });
  }

  // --- Админ ---
  if (p.startsWith('/api/admin/')) {
    if (M === 'POST' && p === '/api/admin/login') {
      const token = await login(req, await readJson(req));
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookieStr(req, token, SESSION_MS / 1000) });
    }
    await requireAdmin(req);
    if (M === 'POST' && p === '/api/admin/logout') return send(res, 200, { ok: true }, { 'Set-Cookie': cookieStr(req, '', 0) });
    if (M === 'PUT' && p === '/api/admin/banner') {
      const b = await readJson(req);
      const next = { active: b.active === true, text: str(b.text, b.active === true ? 1 : 0, 80, 'Баннерын бичвэр'), until: str(b.until, 0, 20, 'Дуусах хугацаа') };
      await db.q("INSERT INTO meta(k,v) VALUES('banner',$1) ON CONFLICT(k) DO UPDATE SET v=excluded.v", [JSON.stringify(next)]);
      return send(res, 200, next);
    }
    if (M === 'GET' && p === '/api/admin/orders') {
      const orders = (await db.q('SELECT * FROM orders ORDER BY created_at DESC LIMIT 1000')).map(orderOut);
      const day = ubDayStartIso(), { partner } = cfg.delivery;
      return send(res, 200, {
        orders,
        stats: {
          today: orders.filter((o) => o.created_at >= day && o.status !== 'cancelled').reduce((s, o) => s + o.total, 0),
          awaiting: orders.filter((o) => o.status === 'new' && o.pay === 'bank').length,
          shipping: orders.filter((o) => o.status === 'shipping').length,
        },
        partner: { name: partner.name, phone: partner.phone, webhook: !!partner.webhookUrl, key: (await secrets()).courierKey },
      });
    }
    if (M === 'POST' && (m = p.match(/^\/api\/admin\/orders\/([\w-]{1,30})$/))) {
      const b = await readJson(req);
      const o = await orderAction(m[1], b.action);
      if (b.action === 'ship') await notifyPartner(o);
      return send(res, 200, orderOut(o));
    }
    if (M === 'GET' && p === '/api/admin/export.csv') {
      const rows = await db.q("SELECT * FROM orders WHERE status='shipping' ORDER BY district, khoroo");
      const lines = [['Дугаар', 'Нэр', 'Утас', 'Дүүрэг', 'Хороо', 'Хаяг', 'Бараа', 'Авах дүн (₮)', 'Төлбөр']];
      for (const o of rows) {
        const c = courierOut(o);
        lines.push([o.id, o.name, o.phone, o.district, o.khoroo, o.address, c.items.map((i) => `${i.name} (${i.size}) ×${i.qty}`).join('; '), c.collect, c.collect ? 'Хүргэлтээр авна' : 'Төлөгдсөн']);
      }
      const d = ubNow().toISOString().slice(0, 10);
      return send(res, 200, '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n'), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="miya-hurgelt-${d}.csv"` });
    }
    if (M === 'GET' && p === '/api/admin/products')
      return send(res, 200, (await db.q('SELECT * FROM products ORDER BY id')).map((r) => productOut(r, true)));
    if (M === 'POST' && p === '/api/admin/products') {
      const v = productIn(await readJson(req));
      const r = await db.q(`INSERT INTO products(name,category,brand,color,price,old_price,material,model_info,sizes,image,active,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [...v, nowIso()]);
      return send(res, 201, { id: r[0].id });
    }
    if (M === 'PUT' && (m = p.match(/^\/api\/admin\/products\/(\d{1,9})$/))) {
      const v = productIn(await readJson(req));
      const r = await db.q('UPDATE products SET name=$1,category=$2,brand=$3,color=$4,price=$5,old_price=$6,material=$7,model_info=$8,sizes=$9,image=$10,active=$11 WHERE id=$12 RETURNING id', [...v, Number(m[1])]);
      if (!r.length) throw new HttpError(404, 'Бараа олдсонгүй');
      return send(res, 200, { ok: true });
    }
    if (M === 'POST' && p === '/api/admin/upload') {
      const b = await readJson(req, 4_300_000); // Vercel-ийн хүсэлтийн дээд хэмжээ 4.5MB
      const mm = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dataUrl || ''));
      if (!mm) bad('JPG, PNG эсвэл WEBP зураг оруулна уу');
      const name = `${crypto.randomBytes(12).toString('hex')}.${mm[1] === 'jpeg' ? 'jpg' : mm[1]}`;
      await db.q('INSERT INTO images(name,mime,data) VALUES($1,$2,$3)', [name, `image/${mm[1]}`, Buffer.from(mm[2], 'base64')]);
      return send(res, 201, { url: `/uploads/${name}` });
    }
  }
  return send(res, 404, { error: 'Олдсонгүй' });
}

async function handler(req, res) {
  try { await route(req, res); } catch (e) {
    if (res.headersSent) return res.end();
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    if (e instanceof URIError) return send(res, 400, { error: 'Хаяг буруу байна' });
    console.error(e);
    send(res, 500, { error: 'Серверийн алдаа гарлаа' });
  }
}

module.exports = { handler };
