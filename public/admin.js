(() => {
'use strict';
const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('en-US') + '₮';
const ST = { new: 'Шинэ', confirmed: 'Баталгаажсан', shipping: 'Хүргэлтэнд гарсан', delivered: 'Хүргэгдсэн', cancelled: 'Цуцлагдсан' };
const PAL = { new: ['#15171A', '#E8EBEE'], confirmed: ['#15171A', '#B9D3E6'], shipping: ['#15171A', '#D9C9F0'], delivered: ['#A9B0B8', '#24282D'], cancelled: ['#7C838B', 'transparent'] };
const PAY = { bank: 'Дансаар', cod: 'Хүргэлтээр' };
const S = { authed: false, tab: 'orders', orders: [], stats: {}, partner: {}, products: [], filter: 'all', q: '', sel: null, psel: null, busy: false };

async function api(url, body, method) {
  const r = await fetch(url, body ? { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && S.authed) { S.authed = false; render(); }
  if (!r.ok) throw new Error(j.error || 'Алдаа гарлаа');
  return j;
}
let toastT;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2800);
}
const badge = (st) => `<span class="st" style="color:${PAL[st][0]};background:${PAL[st][1]}">${ST[st]}</span>`;
function when(iso) {
  const d = new Date(iso), now = new Date(), hm = d.toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === now.toDateString()) return hm;
  if (d.toDateString() === new Date(now - 864e5).toDateString()) return 'Өчигдөр';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

async function load() {
  const [o, p, c] = await Promise.all([api('/api/admin/orders'), api('/api/admin/products'), api('/api/config')]);
  Object.assign(S, { orders: o.orders, stats: o.stats, partner: o.partner, products: p, banner: c.sale });
}

// ---------- Захиалга ----------
function ordersView() {
  const q = S.q.trim().toLowerCase(), cnt = (st) => S.orders.filter((o) => o.status === st).length;
  const list = S.orders.filter((o) => (S.filter === 'all' || o.status === S.filter) && (!q || `${o.id} ${o.name} ${o.phone}`.toLowerCase().includes(q)));
  const chip = (k, label) => `<button class="fchip" data-act="filter" data-v="${k}" aria-pressed="${S.filter === k}">${label}</button>`;
  return `<div class="adm-h"><h1>Захиалга</h1><input class="dinput" id="q" type="search" placeholder="Дугаар, нэр, утас…" value="${esc(S.q)}" aria-label="Хайх"></div>
  <div class="stats"><div class="stat"><span>Өнөөдрийн борлуулалт</span><b>${fmt(S.stats.today || 0)}</b></div>
    <div class="stat"><span>Төлбөр хүлээж буй</span><b>${S.stats.awaiting || 0}</b></div>
    <div class="stat"><span>Хүргэлтэнд гарсан</span><b>${S.stats.shipping || 0}</b></div></div>
  <div class="fchips">${chip('all', `Бүгд ${S.orders.length}`)}${chip('new', `Шинэ ${cnt('new')}`)}${chip('confirmed', `Баталгаажсан ${cnt('confirmed')}`)}${chip('shipping', `Хүргэлтэнд ${cnt('shipping')}`)}${chip('delivered', `Хүргэгдсэн ${cnt('delivered')}`)}${chip('cancelled', `Цуцлагдсан ${cnt('cancelled')}`)}</div>
  <div class="tbl" id="rows"><div class="tr th"><span>Дугаар</span><span>Үйлчлүүлэгч</span><span>Хаяг</span><span>Дүн</span><span>Төлбөр</span><span>Төлөв</span></div>
    ${list.map((o) => `<button class="tr" data-act="open" data-v="${esc(o.id)}" aria-current="${S.sel === o.id}">
      <span class="id">${esc(o.id)}</span><span class="c-name">${esc(o.name)} <span class="sub2">${esc(o.phone)}</span></span>
      <span class="dim c-dist">${esc(o.district)}, ${o.khoroo}-р хороо</span><span class="tot c-tot">${fmt(o.total)}</span>
      <span class="dim c-pay">${PAY[o.pay]} · ${when(o.created_at)}</span><span class="c-st">${badge(o.status)}${o.courier_status === 'failed' && o.status === 'shipping' ? ' ⚠' : ''}</span></button>`).join('') || '<p class="muted" style="padding:24px 18px">Захиалга алга.</p>'}</div>`;
}

function orderDetail(o) {
  const acts = [];
  const primary = (a, label) => `<button class="cbtn chrome" data-act="do" data-v="${a}">${label}</button>`;
  const call = `<a class="dbtn" href="tel:${esc(o.phone)}">Залгах</a>`, cancel = '<button class="dbtn line" data-act="do" data-v="cancel">Цуцлах</button>';
  if (o.status === 'new') acts.push(primary('confirm', o.pay === 'bank' ? 'Төлбөр баталгаажуулах' : 'Захиалга баталгаажуулах'), `<div class="two">${call}${cancel}</div>`);
  else if (o.status === 'confirmed') acts.push(primary('ship', 'Хүргэлтэнд өгөх'), `<div class="two">${call}${cancel}</div>`);
  else if (o.status === 'shipping') acts.push(primary('deliver', 'Хүргэгдсэн гэж тэмдэглэх'), `<div class="two"><button class="dbtn" data-act="do" data-v="unship">Буцааж авах</button>${cancel}</div>`);
  else acts.push(call);
  const cs = { picked: 'Хүргэгч барааг хүлээн авсан', failed: 'Хүргэж чадсангүй', delivered: 'Хүргэгч хүргэсэн гэж тэмдэглэсэн' }[o.courier_status];
  return `<div class="top"><span class="mono" style="font-weight:500">${esc(o.id)}</span><span>${badge(o.status)} <button class="round close" data-act="close" aria-label="Хаах">✕</button></span></div>
  <div class="who"><b>${esc(o.name)}</b><span>${esc(o.phone)} · ${when(o.created_at)}</span><span>${esc(o.district)}, ${o.khoroo}-р хороо, ${esc(o.address)}</span></div>
  ${cs ? `<div class="dnote"><b>${cs}</b>${o.courier_note ? `<br><span class="muted">${esc(o.courier_note)}</span>` : ''}</div>` : ''}
  <div class="ditems">${o.items.map((i) => `<div class="ditem"><span class="ph">${i.image ? `<img src="${esc(i.image)}" alt="">` : ''}</span>
    <span>${esc(i.name)}<small>${esc([i.color, i.size].filter(Boolean).join(' · '))} × ${i.qty}${i.old ? ` · −${Math.round((1 - i.price / i.old) * 100)}%` : ''}</small></span><b>${fmt(i.price * i.qty)}</b></div>`).join('')}</div>
  <div class="dsum">${o.discount ? `<div><span>Хямдрал</span><span>−${fmt(o.discount)}</span></div>` : ''}
    <div><span>Хүргэлт</span><span>${o.shipping ? fmt(o.shipping) : 'Үнэгүй'}</span></div>
    <div class="tot"><span>Нийт · ${PAY[o.pay]}${o.paid ? ' · төлөгдсөн' : ''}</span><span>${fmt(o.total)}</span></div></div>
  <div class="dact">${acts.join('')}</div>`;
}

// ---------- Бараа ----------
const sizesText = (s) => Object.entries(s).map(([k, v]) => `${k}:${v}`).join(', ');
function productsView() {
  return `<div class="adm-h"><h1>Бараа</h1><button class="dbtn" data-act="pnew">+ Шинэ бараа</button></div>
  <div class="tbl">${S.products.map((p) => `<button class="tr" data-act="popen" data-v="${p.id}" aria-current="${S.psel === p.id}">
    <span class="id">${esc(p.n)}</span><span class="c-name">${esc(p.name)} <span class="sub2">${esc(p.category)}</span></span>
    <span class="dim c-dist">${esc(sizesText(p.sizes))}</span><span class="tot c-tot">${fmt(p.price)}</span>
    <span class="dim c-pay">${p.old ? `<s>${fmt(p.old)}</s>` : '—'}</span><span class="c-st">${p.active ? badge('new').replace('Шинэ', 'Идэвхтэй') : badge('cancelled').replace('Цуцлагдсан', 'Нуусан')}</span></button>`).join('')}</div>`;
}

function productDetail(p) {
  const f = (name, label, val, extra = '') => `<label>${label}<input class="dinput" name="${name}" value="${esc(val ?? '')}" ${extra}></label>`;
  return `<div class="top"><b style="font:600 16px var(--ub)">${p.id ? esc(p.name) : 'Шинэ бараа'}</b><button class="round close" data-act="close" aria-label="Хаах">✕</button></div>
  <form class="pform" id="pform">
    <div style="display:flex;gap:12px;align-items:flex-end"><span class="ph thumb" id="thumb">${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}</span>
      <label style="flex:1">Зураг (JPG, PNG, WEBP)<input type="file" id="file" accept="image/jpeg,image/png,image/webp" style="font-size:13px;margin-top:6px"></label></div>
    <button type="button" class="dbtn line" id="imgdel" data-act="imgdel" ${p.image ? '' : 'hidden'}>Зураг устгах</button>
    <input type="hidden" name="image" value="${esc(p.image || '')}">
    ${f('name', 'Нэр', p.name, 'required maxlength="80"')}
    <div class="two">${f('category', 'Ангилал', p.category, 'required maxlength="30" list="cats"')}${f('color', 'Өнгө', p.color, 'maxlength="40"')}</div>
    <datalist id="cats">${[...new Set(S.products.map((x) => x.category))].map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="two">${f('price', 'Үнэ (₮)', p.price, 'required inputmode="numeric"')}${f('old', 'Хямдралын өмнөх үнэ', p.old, 'inputmode="numeric" placeholder="Хямдралгүй бол хоосон"')}</div>
    ${f('sizes', 'Хэмжээ:үлдэгдэл', p.sizes ? sizesText(p.sizes) : 'S:0, M:0, L:0', 'required placeholder="S:3, M:2, L:4"')}
    ${f('brand', 'Брэнд', p.brand ?? 'Солонгос брэнд', 'maxlength="60"')}
    ${f('material', 'Материал', p.material, 'maxlength="80"')}
    ${f('model', 'Модель', p.model, 'maxlength="60" placeholder="172 см · M"')}
    <label class="chk"><input type="checkbox" name="active" ${p.active === false ? '' : 'checked'}> Дэлгүүрт харуулах</label>
    <button class="cbtn chrome" style="margin-top:8px">Хадгалах</button>
  </form>`;
}

async function saveProduct(form) {
  const d = Object.fromEntries(new FormData(form)), sizes = {};
  for (const part of d.sizes.split(',')) {
    const [k, v] = part.split(':').map((x) => x.trim());
    if (!k) continue;
    if (!/^\d+$/.test(v || '')) return toast(`«${k}» хэмжээний үлдэгдлийг тоогоор бичнэ үү (жишээ: M:2)`);
    sizes[k] = Number(v);
  }
  const num = (v) => Number(String(v).replace(/[^\d]/g, ''));
  const body = { ...d, price: num(d.price), old: d.old ? num(d.old) : null, sizes, active: form.active.checked };
  try {
    if (S.psel === 'new') S.psel = (await api('/api/admin/products', body)).id;
    else await api(`/api/admin/products/${S.psel}`, body, 'PUT');
    await load(); render(); toast('Хадгалагдлаа');
  } catch (e) { toast(e.message); }
}

// Зургийг хөтөч дээр 1600px хүртэл жижигрүүлж JPEG болгоод илгээнэ (хурдан ачаална, серверийн хэмжээний хязгаарт багтана)
async function uploadImage(file, form) {
  if (file.size > 25e6) return toast('Зураг 25MB-аас бага байх ёстой');
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    const { url } = await api('/api/admin/upload', { dataUrl: cv.toDataURL('image/jpeg', 0.86) });
    form.image.value = url;
    document.getElementById('thumb').innerHTML = `<img src="${esc(url)}" alt="">`;
    document.getElementById('imgdel').hidden = false;
    toast('Зураг орлоо. «Хадгалах» дарна уу');
  } catch (e) { toast(e instanceof DOMException ? 'Зургийг уншиж чадсангүй' : e.message); }
}

// ---------- Хүргэлт ----------
function deliveryView() {
  const link = `${location.origin}/courier#${S.partner.key}`, ship = S.orders.filter((o) => o.status === 'shipping');
  return `<div class="adm-h"><h1>Хүргэлт</h1></div>
  <div class="box"><h2>Хамтрагч компани${S.partner.name ? ` · ${esc(S.partner.name)}` : ''}</h2>
    <p class="muted">Доорх холбоосыг хүргэлтийн компанидаа өгнө. Тэд «Хүргэлтэнд гарсан» захиалгуудын хаяг, утас, авах дүнг харж, «Хүргэсэн» / «Хүргэж чадсангүй» гэж тэмдэглэнэ. Холбоос нь нууц түлхүүртэй тул зөвхөн хамтрагчдаа өгөөрэй.</p>
    <div class="row"><code>${esc(link)}</code><button class="dbtn" data-act="copy" data-v="${esc(link)}">Хуулах</button></div>
    <div class="row"><a class="dbtn" href="/api/admin/export.csv" download>Excel/CSV татах (${ship.length})</a><a class="dbtn line" href="${esc(link)}" target="_blank" rel="noopener">Хамтрагчийн самбар нээх</a></div>
    <p class="muted" style="font-size:13px">${S.partner.webhook ? 'API холболт идэвхтэй: захиалга хүргэлтэнд өгөх бүрд компанийн систем рүү автоматаар илгээнэ.' : 'Компани API-тай бол config.js → delivery.partner.webhookUrl-д хаягийг нь бичээрэй.'}</p></div>
  <div class="tbl">${ship.map((o) => `<button class="tr" data-act="open" data-v="${esc(o.id)}" aria-current="${S.sel === o.id}">
      <span class="id">${esc(o.id)}</span><span class="c-name">${esc(o.name)} <span class="sub2">${esc(o.phone)}</span></span>
      <span class="dim c-dist">${esc(o.district)}, ${o.khoroo}-р хороо</span><span class="tot c-tot">${fmt(o.total)}</span>
      <span class="dim c-pay">${o.paid ? 'Төлөгдсөн' : 'Авах дүнтэй'}</span><span class="c-st">${{ picked: 'Хүлээн авсан', failed: '⚠ Чадсангүй' }[o.courier_status] || 'Хүлээгдэж буй'}</span></button>`).join('') || '<p class="muted" style="padding:24px 18px">Хүргэлтэнд гарсан захиалга алга.</p>'}</div>`;
}

// ---------- Баннер ----------
const bannerText = (b) => esc(b.text) + (b.until ? ` · ${esc(b.until)} хүртэл` : '');
function bannerView() {
  const b = S.banner;
  return `<div class="adm-h"><h1>Баннер</h1></div>
  <div class="box"><h2>Дэлгэцийн дээд тууз</h2>
    <p class="muted">Дэлгүүрийн бүх хуудасны хамгийн дээр гарах улаан тууз. Унтраавал тууз алга болно — хямдралтай бараа, «Хямдрал» ангилал хэвээр үлдэнэ.</p>
    <div class="salebar" id="bprev" style="border-radius:10px;${b.active ? '' : 'opacity:.35'}">${bannerText(b) || 'Бичвэр оруулна уу'}</div>
    <form class="pform" id="bform">
      <label class="chk"><input type="checkbox" name="active" ${b.active ? 'checked' : ''}> Баннерыг дэлгүүрт харуулах</label>
      <label>Бичвэр<input class="dinput" name="text" maxlength="80" value="${esc(b.text)}" placeholder="Өвлийн хямдрал −30% хүртэл"></label>
      <label>Дуусах хугацаа (заавал биш — ард нь «хүртэл» гэж залгагдана)<input class="dinput" name="until" maxlength="20" value="${esc(b.until)}" placeholder="11/30"></label>
      <button class="cbtn chrome" style="margin-top:8px;max-width:320px">Хадгалах</button>
    </form></div>`;
}
const bannerForm = (f) => ({ active: f.active.checked, text: f.text.value.trim(), until: f.until.value.trim() });
async function saveBanner(form) {
  const b = bannerForm(form);
  if (b.active && !b.text) return toast('Баннерын бичвэрээ оруулна уу');
  try { S.banner = await api('/api/admin/banner', b, 'PUT'); render(); toast(b.active ? 'Баннер шинэчлэгдлээ' : 'Баннер унтарлаа'); }
  catch (e) { toast(e.message); }
}

// ---------- Дэлгэц ----------
function render() {
  if (!S.authed) {
    app.innerHTML = `<div class="login"><div class="disc">MIYA</div><form id="login"><input class="dinput" type="password" name="password" placeholder="Нууц үг" autocomplete="current-password" required autofocus><button class="cbtn chrome">Нэвтрэх</button></form></div>`;
    return;
  }
  const o = S.orders.find((x) => x.id === S.sel), p = S.psel === 'new' ? {} : S.products.find((x) => x.id === S.psel);
  const detail = S.tab === 'products' ? (p ? productDetail(p) : '') : (o ? orderDetail(o) : '');
  const side = (k, label, n) => `<button class="side" data-act="tab" data-v="${k}" aria-current="${S.tab === k}">${label}${n ? `<b>${n}</b>` : ''}</button>`;
  app.innerHTML = `<div class="adm"><aside><div class="brand"><i></i><span>MIYA</span></div>
    ${side('orders', 'Захиалга', S.orders.filter((x) => x.status === 'new').length)}${side('products', 'Бараа')}${side('delivery', 'Хүргэлт', S.stats.shipping)}${side('banner', 'Баннер')}
    <button class="side out" data-act="logout">Гарах</button></aside>
    <main>${S.tab === 'orders' ? ordersView() : S.tab === 'products' ? productsView() : S.tab === 'banner' ? bannerView() : deliveryView()}</main>
    <section class="detail ${detail ? '' : 'none'}">${detail || '<p class="muted">Жагсаалтаас сонгоно уу.</p>'}</section></div>`;
}

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const v = el.dataset.v;
  switch (el.dataset.act) {
    case 'tab': S.tab = v; S.sel = S.psel = null; render(); break;
    case 'filter': S.filter = v; render(); break;
    case 'open': S.sel = v; render(); break;
    case 'popen': S.psel = Number(v); render(); break;
    case 'pnew': S.psel = 'new'; render(); break;
    case 'close': S.sel = S.psel = null; render(); break;
    case 'imgdel': {
      const form = document.getElementById('pform');
      form.image.value = ''; document.getElementById('file').value = '';
      document.getElementById('thumb').innerHTML = ''; el.hidden = true;
      toast('Зураг хасагдлаа. «Хадгалах» дарна уу'); break;
    }
    case 'copy': navigator.clipboard?.writeText(v).then(() => toast('Хуулагдлаа'), () => toast('Хуулж чадсангүй')); break;
    case 'logout': await api('/api/admin/logout', {}).catch(() => {}); S.authed = false; render(); break;
    case 'do':
      if (S.busy) return;
      if (v === 'cancel' && !confirm(`${S.sel} захиалгыг цуцлах уу? Барааны үлдэгдэл буцаж нэмэгдэнэ.`)) return;
      S.busy = true;
      try { await api(`/api/admin/orders/${encodeURIComponent(S.sel)}`, { action: v }); await load(); render(); toast({ confirm: 'Баталгаажлаа', ship: 'Хүргэлтэнд өглөө', deliver: 'Хүргэгдсэн', cancel: 'Цуцлагдлаа', unship: 'Буцааж авлаа' }[v]); }
      catch (err) { toast(err.message); }
      S.busy = false; break;
  }
});
app.addEventListener('input', (e) => {
  if (e.target.form?.id === 'bform') { // шууд урьдчилан харуулна
    const b = bannerForm(e.target.form), pv = document.getElementById('bprev');
    pv.innerHTML = bannerText(b) || 'Бичвэр оруулна уу'; pv.style.opacity = b.active ? '' : '.35'; return;
  }
  if (e.target.id !== 'q') return;
  S.q = e.target.value; const pos = e.target.selectionStart;
  render(); const q = document.getElementById('q'); q.focus(); q.setSelectionRange(pos, pos);
});
app.addEventListener('change', (e) => { if (e.target.id === 'file' && e.target.files[0]) uploadImage(e.target.files[0], e.target.form); });
app.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.target.id === 'pform') return saveProduct(e.target);
  if (e.target.id === 'bform') return saveBanner(e.target);
  if (e.target.id === 'login') {
    try { await api('/api/admin/login', { password: e.target.password.value }); S.authed = true; await load(); render(); }
    catch (err) { toast(err.message); }
  }
});

// 30 секунд тутам шинэ захиалга шалгана (засвар хийж байх үед саад болохгүй)
setInterval(async () => {
  if (!S.authed || S.busy || document.hidden || S.tab === 'products' || S.tab === 'banner' || document.activeElement?.id === 'q') return;
  try { await load(); render(); } catch { /* дараагийн удаа */ }
}, 30000);

(async () => { try { await load(); S.authed = true; } catch { /* нэвтрээгүй */ } render(); })();
})();
