(() => {
'use strict';
const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('en-US') + '₮';
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* хувийн горим */ } },
};
const S = {
  cfg: null, products: [],
  cart: store.get('miya_cart', []), wish: store.get('miya_wish', []),
  orders: store.get('miya_orders', []), form: { pay: 'bank', ...store.get('miya_form', {}) },
  q: '', searchOpen: false, menuOpen: false, size: null, busy: false,
};

async function api(url, body) {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Алдаа гарлаа. Дахин оролдоно уу');
  return j;
}

let toastT;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2800);
}

const byId = (id) => S.products.find((p) => p.id === Number(id));
const stock = (p, size) => p.sizes[size] || 0;
const saveCart = () => store.set('miya_cart', S.cart);
const hasSale = () => S.products.some((p) => p.old);
const until = () => (S.cfg.sale.until ? ` · ${esc(S.cfg.sale.until)} хүртэл` : "");

function totals() {
  let sub = 0, disc = 0, count = 0; const lines = [];
  for (const it of S.cart) {
    const p = byId(it.id); if (!p) continue;
    const full = p.old || p.price;
    sub += full * it.qty; disc += (full - p.price) * it.qty; count += it.qty;
    lines.push({ it, p });
  }
  const goods = sub - disc, d = S.cfg.delivery;
  const ship = !count || goods >= d.freeFrom ? 0 : d.fee;
  return { sub, disc, goods, ship, total: goods + ship, count, lines };
}

// ---------- Хэсгүүд ----------
const img = (p) => (p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : '');
const priceHtml = (p) => (p.old
  ? `<span class="prices"><span class="price red">${fmt(p.price)}</span><s>${fmt(p.old)}</s></span>`
  : `<span class="price">${fmt(p.price)}</span>`);
const card = (p) => `<a class="card" href="#/p/${p.id}">
  <div class="ph">${img(p)}<div class="tags"><span>${p.image ? '' : esc(p.n)}</span>${p.sale ? `<span class="badge">${esc(p.sale)}</span>` : ''}</div></div>
  <div class="info"><span class="name">${esc(p.name)}</span>${priceHtml(p)}</div></a>`;

function header() {
  const { sale } = S.cfg, t = totals();
  return `${sale.active ? `<a class="salebar" href="#/c/sale"><span>${esc(sale.text)}${until()}</span><span class="ul d-only">Үзэх</span></a>` : ''}
<header class="hdr wrap"><a class="logo" href="#/">MIYA</a>
  <nav class="nav"><a class="pill ghost" href="#/c/all">Шинэ ирэлт</a>${hasSale() ? '<a class="pill ghost red" href="#/c/sale"><b style="font-weight:500">Хямдрал</b></a>' : ''}
    ${S.orders.length ? `<a class="pill ghost" href="#/order/${esc(S.orders[0].id)}">Миний захиалга</a>` : ''}<button class="pill ghost" data-act="contact">Холбоо барих</button></nav>
  <div class="hdr-r"><button class="pill" data-act="search">Хайх</button>
    <a class="pill ink d-only" href="#/cart">Сагс · ${t.count}</a>
    <button class="round menu-btn" data-act="menu" aria-label="Цэс"><i></i><i></i></button></div>
</header>
${S.searchOpen ? `<div class="search wrap"><input id="q" type="search" placeholder="Барааны нэрээр хайх" value="${esc(S.q)}" aria-label="Хайх"></div>` : ''}`;
}

function menu() {
  if (!S.menuOpen) return '';
  const cats = [...new Set(S.products.map((p) => p.category))], s = S.cfg.shop;
  return `<div class="sheet" data-act="menu-close"><div class="sheet-in" role="dialog" aria-label="Цэс">
    <button class="round" data-act="menu-close" aria-label="Хаах" style="align-self:flex-end">✕</button>
    <a class="pill" href="#/c/all">Бүх бараа</a>
    ${hasSale() ? '<a class="pill sale" href="#/c/sale">Хямдрал</a>' : ''}
    ${cats.map((c) => `<a class="pill" href="#/c/${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}
    ${S.orders.length ? `<h3>Миний захиалга</h3>${S.orders.slice(0, 5).map((o) => `<a class="pill mono" href="#/order/${esc(o.id)}">${esc(o.id)}</a>`).join('')}` : ''}
    <h3>Холбоо барих</h3>${socials('col')}<p>${esc(s.hours)}</p>
  </div></div>`;
}

// Холбоо барих холбоосууд (утас, Instagram, Facebook)
const safeUrl = (u) => (/^https:\/\//.test(u || '') ? u : '');
function socials(cls = '') {
  const s = S.cfg.shop, ig = safeUrl(s.instagramUrl), fb = safeUrl(s.facebookUrl);
  return `<span class="socials ${cls}"><a class="pill" href="tel:${esc(s.phone)}">☎ ${esc(s.phone.replace(/^(\d{4})(\d{4})$/, '$1 $2'))}</a>${ig ? `<a class="pill" href="${esc(ig)}" target="_blank" rel="noopener">Instagram</a>` : ''}${fb ? `<a class="pill" href="${esc(fb)}" target="_blank" rel="noopener">Facebook</a>` : ''}</span>`;
}

function footer() {
  const s = S.cfg.shop, d = S.cfg.delivery;
  return `<footer class="foot wrap" id="contact">
    <span><b>Шоурум</b><br>${esc(s.hours)}</span>
    <span><b>Хүргэлт</b><br>${esc(d.eta)} · ${fmt(d.fee)} · ${fmt(d.freeFrom)}-өөс дээш үнэгүй</span>
    <span><b>Холбоо барих</b>${socials()}</span></footer>`;
}

const cartPill = () => { const t = totals(); return t.count ? `<a class="cartpill" href="#/cart">Сагс · ${fmt(t.goods)}<span class="chrome">${t.count}</span></a>` : ''; };

// ---------- Нүүр ----------
function listHtml(cat) {
  const q = S.q.trim().toLowerCase();
  const sale = S.products.filter((p) => p.old);
  let list = S.products.slice().reverse(), title = 'Шинэ ирэлт';
  if (cat === 'sale') { list = sale; title = 'Хямдрал'; } else if (cat !== 'all') { list = list.filter((p) => p.category === cat); title = cat; }
  if (q) { list = list.filter((p) => `${p.name} ${p.category} ${p.color}`.toLowerCase().includes(q)); title = `«${S.q.trim()}» — ${list.length} бараа`; }
  const showSale = cat === 'all' && !q && sale.length && hasSale();
  return `${showSale ? `<section class="sale-block wrap">
      <div class="sale-intro"><h2>Хямдрал</h2><p>Сонгомол загварууд хямдарлаа${until()}.</p><a class="btn line center" href="#/c/sale">Бүгдийг үзэх</a></div>
      <div class="sec-h"><h2 class="red">Хямдрал</h2><a class="ul" href="#/c/sale">Бүгдийг үзэх</a></div>
      <div class="strip">${sale.slice(0, 4).map(card).join('')}</div></section>` : ''}
    <div class="sec-h wrap"><h2 class="${cat === 'sale' && !q ? 'red' : ''}">${esc(title)}</h2></div>
    <div class="grid wrap">${list.map(card).join('') || '<p class="empty">Бараа олдсонгүй.</p>'}</div>`;
}

function viewHome(cat) {
  const cats = [...new Set(S.products.map((p) => p.category))], d = S.cfg.delivery;
  const feat = S.products.find((p) => !p.old) || S.products[0];
  const chip = (key, label, cls = '') => `<a class="pill ${cat === key ? (key === 'sale' ? 'sale' : 'ink') : cls}" href="#/c/${encodeURIComponent(key)}">${esc(label)}</a>`;
  return `<section class="hero wrap">
    <div class="hero-art">${feat ? `<a class="ph hero-img" href="#/p/${feat.id}">${img(feat)}<span>${esc(feat.n)} — ${esc(feat.name.toLowerCase())}</span></a>` : ''}
      <div class="disc"><b>MIYA</b><i>Boutique</i></div></div>
    <div class="hero-txt"><h1>Сөүлийн шинэ улирал</h1>
      <p>Солонгос брэндийн эмэгтэй хувцас. Улаанбаатар даяар ${esc(d.eta)}т<span class="d-only">, ${fmt(d.freeFrom)}-өөс дээш үнэгүй</span>.</p>
      <div class="hero-cta"><a class="btn" href="#/c/all" data-act="to-list">Цуглуулга үзэх</a>${hasSale() ? '<a class="btn sale" href="#/c/sale">Хямдрал</a>' : ''}</div></div>
  </section>
  <div class="chips wrap" id="chips">${chip('all', 'Бүгд')}${hasSale() ? `<a class="pill sale" href="#/c/sale">Хямдрал</a>` : ''}${cats.map((c) => chip(c, c)).join('')}</div>
  <div id="list">${listHtml(cat)}</div>`;
}

// ---------- Бараа ----------
function viewProduct(p) {
  const sizes = Object.keys(p.sizes), d = S.cfg.delivery, t = totals();
  if (S.size && !stock(p, S.size)) S.size = null;
  if (!S.size && sizes.length === 1 && stock(p, sizes[0])) S.size = sizes[0];
  const left = S.size ? stock(p, S.size) : 0;
  const soldOut = sizes.every((s) => !stock(p, s));
  const others = S.products.filter((x) => x.id !== p.id && x.category !== p.category).slice(0, 4);
  const wished = S.wish.includes(p.id);
  return `<div class="pd wrap">
    <div class="pd-gal"><div class="ph main">${img(p)}</div>
      <a class="round back m-only" href="#/" data-act="back" aria-label="Буцах">←</a>
      <a class="pill tocart m-only" href="#/cart">Сагс ${t.count}</a>
      ${p.sale ? `<span class="badge">${esc(p.sale)}</span>` : ''}
      ${p.image ? '' : `<span class="cap">${esc(p.n)} — ${esc(p.name.toLowerCase())}</span>`}</div>
    <div class="pd-panel">
      <div class="pd-head"><span class="mono muted" style="font-size:12px">${esc([p.brand, p.color].filter(Boolean).join(' · '))}</span>
        <h1>${esc(p.name)}</h1>${priceHtml(p)}
        ${p.old ? `<span class="save">${fmt(p.old - p.price)} хэмнэнэ${until()}</span>` : ''}</div>
      <div><div class="sizes-h"><b style="font-weight:500">Хэмжээ${S.size ? ` · ${esc(S.size)}` : ''}</b></div>
        <div class="sizes">${sizes.map((s) => `<button class="size" data-act="size" data-v="${esc(s)}" aria-pressed="${S.size === s}" ${stock(p, s) ? '' : 'disabled aria-label="' + esc(s) + ' дууссан"'}>${esc(s)}</button>`).join('')}</div>
        <div class="sizes-note">${soldOut ? 'Одоогоор дууссан байна' : left && left <= 2 ? `${esc(S.size)} — сүүлийн ${left} ширхэг` : ''}</div></div>
      <div class="cells">
        ${p.material ? `<div><span>Материал</span><span>${esc(p.material)}</span></div>` : ''}
        ${p.model ? `<div><span>Модель</span><span>${esc(p.model)}</span></div>` : ''}
        <div><span>Хүргэлт</span><span>${esc(d.eta)}, ${p.price >= d.freeFrom ? 'үнэгүй' : fmt(d.fee)}</span></div>
        <div><span>Буцаалт</span><span>${esc(S.cfg.shop.returns)}</span></div></div>
      <div class="buybar"><button class="round" data-act="wish" aria-pressed="${wished}" aria-label="Хадгалах">${wished ? '♥' : '♡'}</button>
        <button class="btn" data-act="add" ${soldOut ? 'disabled' : ''}><span>${soldOut ? 'Дууссан' : 'Сагсанд нэмэх'}</span><span>${fmt(p.price)}</span></button></div>
      <p class="pd-note">Шоурумд биеэр үзэж болно: ${esc(S.cfg.shop.hours)} · ${esc(S.cfg.shop.phone)}</p>
    </div></div>
  ${others.length ? `<div class="sec-h wrap pair-h"><h2 style="font-size:16px">Хамт өмсөх</h2></div><div class="strip pair wrap">${others.map(card).join('')}</div>` : '<div class="pair"></div>'}`;
}

// ---------- Сагс ----------
function khorooOptions() {
  const n = S.cfg.districts[S.form.district] || 0;
  return `<option value="">Сонгох</option>${Array.from({ length: n }, (_, i) => `<option value="${i + 1}" ${Number(S.form.khoroo) === i + 1 ? 'selected' : ''}>${i + 1}-р хороо</option>`).join('')}`;
}

const PAYS = () => [...(S.cfg.qpay ? [['qpay', 'QPay']] : []), ['bank', 'Дансаар'], ['cod', 'Хүргэлтээр']];
const PAYL = { qpay: 'QPay', bank: 'Дансаар', cod: 'Хүргэлтээр' };

function viewCart() {
  const t = totals(), d = S.cfg.delivery, f = S.form;
  if (!t.count) return `<div class="sub-h wrap"><a class="round" href="#/" aria-label="Буцах">←</a><h1>Сагс</h1></div>
    <p class="empty">Таны сагс хоосон байна.</p><div class="submit" style="max-width:400px;margin:0 auto"><a class="btn center" href="#/">Дэлгүүр хэсэх</a></div>`;
  const pct = Math.min(100, Math.round((t.goods / d.freeFrom) * 100));
  return `<div class="cart wrap">
    <div class="sub-h"><a class="round m-only" href="#/" data-act="back" aria-label="Буцах">←</a><h1>Сагс</h1><span class="cnt">${t.count} бараа</span></div>
    <div><div class="free"><div>${t.ship ? `<span>Үнэгүй хүргэлтэд ${fmt(d.freeFrom - t.goods)} дутуу</span><span>${pct}%</span>` : '<span>Үнэгүй хүргэлт идэвхжлээ</span><b>✓</b>'}</div><div class="bar"><i style="width:${pct}%"></i></div></div>
      <div class="lines">${t.lines.map(({ it, p }, i) => `<div class="citem">
        <a class="ph" href="#/p/${p.id}">${img(p)}</a>
        <div class="mid"><span>${esc(p.name)}</span><span class="mono">${esc([p.color, it.size].filter(Boolean).join(' · '))}</span>${p.sale ? `<span class="badge">${esc(p.sale)}</span>` : ''}</div>
        <div class="end">${p.old ? `<span class="price red">${fmt(p.price * it.qty)}</span><s>${fmt(p.old * it.qty)}</s>` : `<span class="price">${fmt(p.price * it.qty)}</span>`}
          <div class="qty"><button data-act="dec" data-i="${i}" aria-label="Хасах">−</button><span>${it.qty}</span><button data-act="inc" data-i="${i}" aria-label="Нэмэх">+</button></div></div></div>`).join('')}</div>
      <div class="sum"><div><span>Барааны үнэ</span><span>${fmt(t.sub)}</span></div>
        ${t.disc ? `<div class="red"><span>Хямдрал</span><span>−${fmt(t.disc)}</span></div>` : ''}
        <div><span>Хүргэлт</span><span>${t.ship ? fmt(t.ship) : 'Үнэгүй'}</span></div>
        <div class="tot"><span>Нийт</span><span>${fmt(t.total)}</span></div></div></div>
    <form class="form" id="order" novalidate>
      <h2>Хүргэлт</h2>
      <label class="field"><span>Нэр</span><input data-f="name" autocomplete="name" maxlength="60" value="${esc(f.name)}"></label>
      <label class="field"><span>Утас</span><input data-f="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="9" placeholder="8811 2045" value="${esc(f.phone)}"></label>
      <div class="two"><label class="field"><span>Дүүрэг</span><select data-f="district"><option value="">Сонгох</option>${Object.keys(S.cfg.districts).map((x) => `<option ${f.district === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <label class="field"><span>Хороо</span><select data-f="khoroo" id="khoroo">${khorooOptions()}</select></label></div>
      <label class="field"><span>Дэлгэрэнгүй хаяг</span><textarea data-f="address" maxlength="200" placeholder="Байр, орц, давхар, тоот">${esc(f.address)}</textarea></label>
      <h2>Төлбөр</h2>
      <div class="seg" style="grid-template-columns:repeat(${PAYS().length},1fr)">${PAYS().map(([k, label]) => `<button type="button" data-act="pay" data-v="${k}" aria-pressed="${f.pay === k}">${label}</button>`).join('')}</div>
      <span class="hint">${{ qpay: 'Захиалсны дараа QPay QR болон банкны апп гарна. Төлбөр ормогц автоматаар баталгаажна.', bank: 'Захиалсны дараа дансны мэдээлэл гарна.', cod: 'Бараагаа хүлээн авахдаа хүргэгчид төлнө.' }[f.pay]}</span>
      <div class="submit"><button class="btn" ${S.busy ? 'disabled' : ''}><span>${S.busy ? 'Илгээж байна…' : 'Захиалах'}</span><span>${fmt(t.total)}</span></button></div>
    </form></div>`;
}

async function submitOrder() {
  const f = S.form, phone = String(f.phone || '').replace(/\D/g, '');
  if (!f.name || f.name.trim().length < 2) return toast('Нэрээ оруулна уу');
  if (!/^[5-9]\d{7}$/.test(phone)) return toast('Утасны дугаар 8 оронтой байх ёстой');
  if (!f.district) return toast('Дүүргээ сонгоно уу');
  if (!f.khoroo) return toast('Хороогоо сонгоно уу');
  if (!f.address || f.address.trim().length < 5) return toast('Дэлгэрэнгүй хаягаа оруулна уу');
  S.busy = true; render();
  try {
    const r = await api('/api/orders', { ...f, phone, items: S.cart });
    S.orders.unshift({ id: r.id, t: r.token }); store.set('miya_orders', S.orders.slice(0, 20));
    S.cart = []; saveCart(); S.busy = false;
    S.products = await api('/api/products');
    location.hash = `#/order/${r.id}`;
  } catch (e) {
    S.busy = false;
    S.products = await api('/api/products').catch(() => S.products); // үлдэгдэл шинэчилнэ
    render(); toast(e.message);
  }
}

// ---------- Захиалгын төлөв ----------
const ST = { new: 'Шинэ', confirmed: 'Баталгаажсан', shipping: 'Хүргэлтэнд гарсан', delivered: 'Хүргэгдсэн', cancelled: 'Цуцлагдсан' };
function viewOrder(o) {
  const [, dm, num] = o.id.split('-'), bank = S.cfg.bank, s = S.cfg.shop;
  const at = { new: 1, confirmed: 2, shipping: 2, delivered: 3 }[o.status] ?? 0;
  const step = (i, label) => `<div class="step ${at > i ? 'done' : at === i ? 'now' : ''}"><i>${at > i ? '✓' : i + 1}</i><span>${label}</span></div>`;
  const needPay = o.pay === 'bank' && !o.paid && o.status === 'new';
  const needQ = o.pay === 'qpay' && !o.paid && o.status === 'new';
  const copyRow = (label, val, ink) => `<div class="copy"><div><small>${label}</small><b>${esc(val)}</b></div><button class="pill ${ink ? 'ink' : 'fog'}" data-act="copy" data-v="${esc(val)}">Хуулах</button></div>`;
  let note;
  if (o.status === 'cancelled') note = `Энэ захиалга цуцлагдсан. Асуух зүйл байвал ${esc(s.phone)} руу залгаарай.`;
  else if (needQ) note = 'Банкны аппаараа QR кодыг уншуулах, эсвэл утсан дээрээ банкаа сонгоно уу. Төлбөр ормогц захиалга автоматаар баталгаажна.';
  else if (needPay) note = `Гүйлгээний утгад захиалгын дугаараа бичээрэй. Төлбөр орсны дараа баталгаажуулж, ${esc(s.phone)}-аас залгана.`;
  else if (o.status === 'new') note = `Бид удахгүй ${esc(s.phone)}-аас залгаж захиалгыг тань баталгаажуулна. Төлбөрөө бараагаа хүлээн авахдаа хүргэгчид төлнө.`;
  else if (o.status === 'confirmed') note = `Захиалга баталгаажлаа. ${esc(S.cfg.delivery.eta)}т хүргэнэ.`;
  else if (o.status === 'shipping') note = 'Захиалга хүргэлтэнд гарлаа. Хүргэгч тантай утсаар холбогдоно.';
  else note = 'Захиалга хүргэгдсэн. Биднийг сонгосонд баярлалаа.';
  return `<div class="ok">
    <div class="ok-top"><div class="disc"><small>Захиалгын дугаар</small><b>${esc(num)}</b><em>MY-${esc(dm)}</em></div>
      <h1>${o.status === 'cancelled' ? 'Захиалга цуцлагдсан' : `Баярлалаа, ${esc(o.name)}`}</h1>
      ${o.discount && o.status !== 'cancelled' ? `<span class="save">Та ${fmt(o.discount)} хэмнэлээ</span>` : ''}</div>
    ${o.status === 'cancelled' ? '' : `<div class="steps">${step(0, 'Захиалсан')}${step(1, o.pay === 'cod' ? 'Баталгаажуулах' : o.paid ? 'Төлбөр төлөгдсөн' : o.pay === 'qpay' ? 'QPay-ээр төлөх' : 'Төлбөр шилжүүлэх')}${step(2, o.status === 'delivered' ? 'Хүргэгдсэн' : `Хүргэлт ${esc(S.cfg.delivery.eta)}`)}</div>`}
    ${needPay ? `<div class="rows"><div><span>Төлөх дүн</span><span class="price" style="font-size:15px">${fmt(o.total)}</span></div>
      <div><span>Банк</span><span>${esc(bank.name)}</span></div>${copyRow('Данс', bank.account)}
      <div><span>Хүлээн авагч</span><span>${esc(bank.holder)}</span></div>${copyRow('Гүйлгээний утга', o.id, true)}</div>` : ''}
    ${needQ ? qpayBox(o) : ''}
    <p class="ok-note">${note}</p>
    <div class="rows">${o.items.map((i) => `<div><span>${esc(i.name)} · ${esc(i.size)} × ${i.qty}</span><span>${fmt(i.price * i.qty)}</span></div>`).join('')}
      <div><span>Хүргэлт</span><span>${o.shipping ? fmt(o.shipping) : 'Үнэгүй'}</span></div>
      <div><span>Нийт · ${PAYL[o.pay]}${o.paid && o.pay !== 'cod' ? ' · төлөгдсөн' : ''}</span><span class="price">${fmt(o.total)}</span></div>
      <div><span>Төлөв</span><span>${ST[o.status]}</span></div>
      <div><span>Хаяг</span><span style="text-align:right">${esc(o.district)}, ${o.khoroo}-р хороо, ${esc(o.address)}</span></div></div>
    <div class="submit"><a class="btn line center" href="#/">Дэлгүүр рүү буцах</a></div></div>`;
}

function qpayBox(o) {
  const q = o.qpay;
  if (!q) return `<div class="qpay"><p>QPay нэхэмжлэх үүсээгүй байна.</p><button class="btn center" data-act="qretry">QPay нэхэмжлэх үүсгэх</button></div>`;
  return `<div class="qpay">
    <div class="qpay-h"><b>QPay</b><span class="price">${fmt(o.total)}</span></div>
    ${q.qr_image ? `<img class="qr" src="data:image/png;base64,${esc(q.qr_image)}" alt="QPay QR код" width="240" height="240">` : ''}
    ${q.urls?.length ? `<div class="banks">${q.urls.map((u) => `<a class="pill" href="${esc(u.link)}" rel="noopener">${esc(u.name)}</a>`).join('')}</div>` : ''}
    <div class="qpay-f"><span class="hint" id="qstate">Төлбөр хүлээж байна…</span><button class="pill fog" data-act="qcheck">Төлбөр шалгах</button></div>
  </div>`;
}

// Захиалгын хуудас нээлттэй байх хооронд QPay төлбөрийг 5 секунд тутам шалгана (10 минут хүртэл)
let qTimer = null;
function stopPoll() { clearInterval(qTimer); qTimer = null; }
async function qpayRefresh(manual) {
  const saved = S.orders.find((x) => x.id === orderData?.id);
  if (!saved || route.name !== 'order') return stopPoll();
  try {
    const o = await api(`/api/orders/${encodeURIComponent(saved.id)}/qpay?t=${saved.t}`, {});
    const was = orderData; orderData = o;
    if (o.paid && !was.paid) { stopPoll(); render(); toast('Төлбөр амжилттай төлөгдлөө'); }
    else if (!was.qpay && o.qpay) render();
    else if (manual) toast(o.paid ? 'Төлбөр төлөгдсөн байна' : 'Төлбөр хараахан ороогүй байна');
  } catch (e) { if (manual) toast(e.message); }
}
function startPoll() {
  stopPoll();
  if (!(orderData?.pay === 'qpay' && !orderData.paid && orderData.status === 'new')) return;
  const until = Date.now() + 10 * 60e3;
  qTimer = setInterval(() => { if (Date.now() > until) return stopPoll(); if (!document.hidden) qpayRefresh(false); }, 5000);
}

// ---------- Чиглүүлэлт ----------
let route = { name: 'home', arg: 'all' }, orderData = null, booted = false;
function parse() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (parts[0] === 'p' && byId(parts[1])) return { name: 'product', arg: Number(parts[1]) };
  if (parts[0] === 'cart') return { name: 'cart' };
  if (parts[0] === 'order' && parts[1]) return { name: 'order', arg: parts[1] };
  const cat = parts[0] === 'c' && parts[1] ? parts[1] : 'all';
  return { name: 'home', arg: cat === 'sale' || S.products.some((p) => p.category === cat) ? cat : 'all' };
}

// ---------- Хөдөлгөөн ----------
const calm = matchMedia('(prefers-reduced-motion: reduce)');
let lastCount = null;
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px' }) : null;
function reveal() { // гүйлгэхэд ээлжлэн гарч ирнэ (зөвхөн хуудас солигдоход)
  if (!io || calm.matches) return;
  const groups = new Map();
  for (const el of app.querySelectorAll('main .card, main .sec-h, main .sale-intro, main .citem, main .sum, footer.foot > span')) {
    const g = el.parentElement; const i = groups.get(g) || 0; groups.set(g, i + 1);
    el.classList.add('rv'); el.style.setProperty('--d', `${Math.min(i % 4, 3) * 0.07}s`); io.observe(el);
  }
}
function markImages() { for (const im of app.querySelectorAll('.ph > img')) if (im.complete && im.naturalWidth) im.classList.add('ok'); }
document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true);
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true);
function bumpCart() {
  const n = totals().count;
  if (lastCount !== null && n > lastCount) for (const el of app.querySelectorAll('.cartpill, .tocart, .hdr-r .pill.ink')) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  lastCount = n;
}
function closeMenu() {
  const sh = app.querySelector('.sheet');
  if (!sh || calm.matches) { S.menuOpen = false; render(); return; }
  sh.classList.add('out');
  setTimeout(() => { S.menuOpen = false; render(); }, 260);
}

function render(anim = false) {
  let body;
  if (route.name === 'product') body = viewProduct(byId(route.arg));
  else if (route.name === 'cart') body = viewCart();
  else if (route.name === 'order') body = orderData ? viewOrder(orderData) : '<p class="empty">Ачаалж байна…</p>';
  else body = viewHome(route.arg);
  const home = route.name === 'home';
  document.body.className = home ? '' : 'sub';
  app.innerHTML = header() + `<main${anim && !calm.matches ? ' class="enter"' : ''}>${body}</main>` + (home ? footer() + cartPill() : '') + menu();
  markImages(); bumpCart();
  if (anim) reveal();
}

// Хуудас солихдоо View Transitions-оор зөөлөн уусгана (дэмждэг хөтөч дээр)
function swap(fn) {
  if (document.startViewTransition && !calm.matches && !document.hidden) document.startViewTransition(fn);
  else fn();
}

async function go() {
  const prev = route;
  route = parse(); S.menuOpen = false; stopPoll();
  if (route.name !== 'product' || prev.arg !== route.arg) S.size = null;
  if (route.name === 'order') {
    orderData = null; render();
    const saved = S.orders.find((o) => o.id === route.arg);
    try { if (!saved) throw new Error('Захиалга олдсонгүй'); orderData = await api(`/api/orders/${encodeURIComponent(saved.id)}?t=${saved.t}`); render(true); startPoll(); }
    catch (e) { console.error(e); if (!app.querySelector('main')) render(); app.querySelector('main').innerHTML = `<p class="empty">${esc(e.message)}</p><div class="submit" style="max-width:400px;margin:0 auto"><a class="btn center" href="#/">Дэлгүүр рүү буцах</a></div>`; }
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }
  const sameList = booted && route.name === 'home' && prev.name === 'home';
  booted = true;
  swap(() => {
    render(!sameList); // ангилал солиход зөвхөн жагсаалт гарч ирнэ
    if (sameList) reveal();
    // ангилал солиход жагсаалт дээрээ үлдэнэ, бусад үед дээш гүйлгэнэ
    if (sameList && route.arg !== 'all') document.getElementById('chips')?.scrollIntoView({ block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'instant' });
  });
}

// ---------- Үйлдлүүд ----------
app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, p = route.name === 'product' ? byId(route.arg) : null;
  switch (act) {
    case 'back': if (history.length > 1) { e.preventDefault(); history.back(); } break;
    case 'search':
      S.searchOpen = !S.searchOpen; if (!S.searchOpen) S.q = '';
      if (route.name !== 'home') { location.hash = '#/c/all'; } else render();
      document.getElementById('q')?.focus(); break;
    case 'menu': S.menuOpen = true; render(); break;
    case 'menu-close': if (e.target === el) closeMenu(); break;
    case 'contact':
      if (route.name !== 'home') location.hash = '#/';
      setTimeout(() => document.getElementById('contact')?.scrollIntoView(), 50); break;
    case 'to-list': e.preventDefault(); document.getElementById('chips')?.scrollIntoView(); break;
    case 'size': S.size = el.dataset.v; render(); break;
    case 'wish':
      S.wish = S.wish.includes(p.id) ? S.wish.filter((x) => x !== p.id) : [...S.wish, p.id];
      store.set('miya_wish', S.wish); render(); break;
    case 'add': {
      if (!S.size) return toast('Хэмжээгээ сонгоно уу');
      const it = S.cart.find((x) => x.id === p.id && x.size === S.size);
      if ((it?.qty || 0) >= stock(p, S.size)) return toast(`${S.size} хэмжээ ${stock(p, S.size)} ширхэг л үлдсэн`);
      if (it) it.qty++; else S.cart.push({ id: p.id, size: S.size, qty: 1 });
      saveCart(); render(); toast('Сагсанд нэмэгдлээ'); break;
    }
    case 'inc': case 'dec': {
      const { it, p: prod } = totals().lines[Number(el.dataset.i)];
      if (act === 'inc') { if (it.qty >= stock(prod, it.size)) return toast(`${stock(prod, it.size)} ширхэг л үлдсэн`); it.qty++; }
      else if (--it.qty <= 0) S.cart = S.cart.filter((x) => x !== it);
      saveCart(); render(); break;
    }
    case 'qcheck': qpayRefresh(true); break;
    case 'qretry': el.disabled = true; qpayRefresh(true).then(startPoll); break;
    case 'pay': S.form.pay = el.dataset.v; store.set('miya_form', S.form); render(); break;
    case 'copy':
      navigator.clipboard?.writeText(el.dataset.v.replace(/\s/g, '')).then(() => toast('Хуулагдлаа'), () => toast('Хуулж чадсангүй')); break;
  }
});
app.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') { S.q = t.value; document.getElementById('list').innerHTML = listHtml(route.arg); markImages(); return; }
  if (!t.dataset.f) return;
  S.form[t.dataset.f] = t.value;
  if (t.dataset.f === 'district') { S.form.khoroo = ''; document.getElementById('khoroo').innerHTML = khorooOptions(); }
  store.set('miya_form', S.form);
});
app.addEventListener('submit', (e) => { e.preventDefault(); if (e.target.id === 'order' && !S.busy) submitOrder(); });
window.addEventListener('hashchange', go);

(async () => {
  try {
    [S.cfg, S.products] = await Promise.all([api('/api/config'), api('/api/products')]);
    if (S.cfg.qpay && !store.get('miya_form', {}).pay) S.form.pay = 'qpay';
    if (!S.cfg.qpay && S.form.pay === 'qpay') S.form.pay = 'bank';
    S.cart = S.cart.filter((it) => byId(it.id) && stock(byId(it.id), it.size) > 0); saveCart();
    go();
  } catch { app.innerHTML = '<p class="empty">Дэлгүүр ачаалж чадсангүй. Хуудсаа дахин ачаална уу.</p>'; }
})();
})();
