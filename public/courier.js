(() => {
'use strict';
// Хүргэлтийн хамтрагчийн самбар. Түлхүүр нь холбоосын # хэсэгт байх тул серверийн логт үлдэхгүй.
const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('en-US') + '₮';
let key = location.hash.slice(1);
try { if (key) sessionStorage.setItem('miya_courier', key); else key = sessionStorage.getItem('miya_courier') || ''; } catch { /* хадгалах боломжгүй */ }
let data = null, busy = false;

async function api(url, body) {
  const r = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'X-Courier-Key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Алдаа гарлаа');
  return j;
}
let toastT;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2800);
}

function job(o) {
  const done = o.status === 'delivered';
  const tag = done ? 'Хүргэсэн' : { picked: 'Замд яваа', failed: 'Чадсангүй' }[o.courier_status] || 'Авахад бэлэн';
  let acts = '';
  if (!done) {
    acts = o.courier_status === 'picked'
      ? `<button class="btn" data-act="delivered" data-v="${esc(o.id)}">Хүргэсэн</button><button class="btn line" data-act="failed" data-v="${esc(o.id)}">Чадсангүй</button>`
      : `<button class="btn full" data-act="picked" data-v="${esc(o.id)}">${o.courier_status === 'failed' ? 'Дахин авч гарах' : 'Барааг хүлээн авсан'}</button>`;
  }
  return `<div class="job ${done ? 'done' : ''}"><div class="top"><span class="id">${esc(o.id)}</span><span class="tag">${tag}</span></div>
    <div class="addr"><b>${esc(o.district)}, ${o.khoroo}-р хороо</b><br>${esc(o.address)}</div>
    <div>${esc(o.name)} · <a class="ul" href="tel:${esc(o.phone)}">${esc(o.phone)}</a></div>
    <div class="muted">${o.items.map((i) => `${esc(i.name)} (${esc(i.size)}) ×${i.qty}`).join(', ')}</div>
    ${o.courier_note ? `<div class="muted">Тэмдэглэл: ${esc(o.courier_note)}</div>` : ''}
    <div class="collect"><span>${o.collect ? 'Үйлчлүүлэгчээс авах' : 'Төлбөр'}</span><b>${o.collect ? fmt(o.collect) : 'Төлөгдсөн'}</b></div>
    ${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
}

function render(err) {
  if (err || !data) {
    app.innerHTML = `<div class="cr"><div class="cr-h"><h1>Хүргэлт</h1></div><p class="hint">${esc(err || 'Ачаалж байна…')}</p></div>`;
    return;
  }
  const open = data.orders.filter((o) => o.status === 'shipping'), done = data.orders.filter((o) => o.status === 'delivered');
  app.innerHTML = `<div class="cr"><div class="cr-h"><h1>Хүргэлт</h1><span class="round chrome">${open.length}</span></div>
    <p class="hint">${esc(data.shop.name)} · асуух зүйл: <a class="ul" href="tel:${esc(data.shop.phone)}">${esc(data.shop.phone)}</a></p>
    <div class="cr-list">${open.map(job).join('') || '<p class="hint">Одоогоор хүргэх захиалга алга.</p>'}</div>
    ${done.length ? `<p class="hint" style="padding-top:16px">Өнөөдөр хүргэсэн · ${done.length}</p><div class="cr-list">${done.map(job).join('')}</div>` : ''}</div>`;
}

async function load() {
  if (!key) return render('Холбоос буруу байна. Дэлгүүрээс авсан холбоосоо бүтнээр нь нээнэ үү.');
  try { data = await api('/api/courier/orders'); render(); } catch (e) { if (!data) render(e.message); }
}

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el || busy) return;
  const result = el.dataset.act, id = el.dataset.v; let note = '';
  if (result === 'failed') { note = prompt('Яагаад хүргэж чадсангүй вэ? (жишээ: утсаа аваагүй)'); if (note === null) return; }
  if (result === 'delivered' && !confirm(`${id} захиалгыг хүргэсэн үү?`)) return;
  busy = true;
  try { await api(`/api/courier/orders/${encodeURIComponent(id)}`, { result, note: note.slice(0, 200) }); toast('Тэмдэглэгдлээ'); }
  catch (err) { toast(err.message); }
  busy = false; load();
});
setInterval(() => { if (!document.hidden && !busy) load(); }, 30000);
load();
})();
