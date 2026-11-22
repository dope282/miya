'use strict';
// QPay Merchant API v2 (https://developer.qpay.mn). Нэвтрэх мэдээллийг орчны хувьсагчаас авна:
//   QPAY_USERNAME, QPAY_PASSWORD, QPAY_INVOICE_CODE  — QPay-ээс гэрээний дараа өгсөн утгууд
//   QPAY_BASE_URL (заавал биш) — туршилтын орчинд https://merchant-sandbox.qpay.mn
const BASE = (process.env.QPAY_BASE_URL || 'https://merchant.qpay.mn').replace(/\/+$/, '');
const USER = process.env.QPAY_USERNAME || '';
const PASS = process.env.QPAY_PASSWORD || '';
const CODE = process.env.QPAY_INVOICE_CODE || '';

const enabled = () => !!(USER && PASS && CODE);

class QPayError extends Error {}

// Token-ийг серверийн санах ойд хадгалж дахин ашиглана (баримтын зөвлөмжөөр).
// expires_in нь «үлдсэн секунд» биш, Unix timestamp (секунд).
let tok = null; // { access, exp }
async function token(force = false) {
  if (!force && tok && tok.exp - 60e3 > Date.now()) return tok.access;
  const r = await fetch(`${BASE}/v2/auth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${USER}:${PASS}`).toString('base64')}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) { tok = null; throw new QPayError(`QPay нэвтрэлт амжилтгүй (${r.status})`); }
  const j = await r.json();
  if (!j.access_token) throw new QPayError('QPay token ирсэнгүй');
  const e = Number(j.expires_in);
  // Unix timestamp байх ёстой; хэрэв жижиг тоо (секундийн үргэлжлэл) ирвэл түүгээр тооцно
  const exp = e > 1e9 ? e * 1000 : e > 0 ? Date.now() + e * 1000 : Date.now() + 3600e3;
  tok = { access: j.access_token, exp };
  return tok.access;
}

// 401/403 ирвэл token-оо хаяж нэг удаа дахин оролдоно
async function call(method, path, body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await token(attempt > 0)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    if ((r.status === 401 || r.status === 403) && attempt === 0) { tok = null; continue; }
    const text = await r.text();
    let j = null; try { j = text ? JSON.parse(text) : null; } catch { /* JSON биш */ }
    if (!r.ok) {
      console.error(`[qpay] ${method} ${path} → ${r.status} ${text.slice(0, 300)}`);
      throw new QPayError(`QPay алдаа (${r.status})`);
    }
    return j;
  }
  throw new QPayError('QPay нэвтрэлт амжилтгүй');
}

// Банкны аппын холбоос: зөвхөн аюулгүй схемтэй линкүүдийг үлдээнэ
const safeLink = (l) => typeof l === 'string' && /^[a-z][a-z0-9+.-]{1,30}:/i.test(l) && !/^(javascript|data|vbscript|file):/i.test(l);

async function createInvoice({ orderId, amount, description, callbackUrl }) {
  const j = await call('POST', '/v2/invoice', {
    invoice_code: CODE,
    sender_invoice_no: orderId,
    invoice_receiver_code: 'terminal',
    invoice_description: description.slice(0, 255),
    amount,
    callback_url: callbackUrl,
  });
  if (!j?.invoice_id) throw new QPayError('QPay нэхэмжлэх үүссэнгүй');
  const img = String(j.qr_image || '');
  return {
    invoice_id: String(j.invoice_id),
    qr_image: /^[A-Za-z0-9+/=\s]+$/.test(img) ? img.replace(/\s/g, '') : '',
    short_url: /^https:\/\//.test(j.qPay_shortUrl || '') ? j.qPay_shortUrl : '',
    urls: (Array.isArray(j.urls) ? j.urls : [])
      .filter((u) => u && safeLink(u.link))
      .slice(0, 30)
      .map((u) => ({ name: String(u.description || u.name || 'Банк').slice(0, 40), link: String(u.link).slice(0, 2000) })),
  };
}

// Нэхэмжлэхэд орсон нийт төлбөрийг буцаана
async function paidAmount(invoiceId) {
  const j = await call('POST', '/v2/payment/check', { object_type: 'INVOICE', object_id: invoiceId, offset: { page_number: 1, page_limit: 100 } });
  const rows = Array.isArray(j?.rows) ? j.rows : [];
  const fromRows = rows.filter((x) => String(x.payment_status).toUpperCase() === 'PAID').reduce((s, x) => s + Number(x.payment_amount || 0), 0);
  return Math.max(fromRows, rows.length ? 0 : Number(j?.paid_amount || 0));
}

async function cancelInvoice(invoiceId) {
  try { await call('DELETE', `/v2/invoice/${encodeURIComponent(invoiceId)}`); } catch (e) { console.error(`[qpay] цуцлах: ${e.message}`); }
}

module.exports = { enabled, createInvoice, paidAmount, cancelInvoice, QPayError };
