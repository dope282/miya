'use strict';
// Компьютер дээр ажиллуулах сервер: node server.js
// (Vercel дээр энэ файл ашиглагдахгүй — public/ хавтас болон api/index.js шууд ажиллана.)
try { process.loadEnvFile(); } catch { /* .env байхгүй бол алгасна */ }
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { handler } = require('./lib/app');

const PUBLIC = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.otf': 'font/otf' };
// vercel.json-ийн headers хэсэгтэй ижил байх ёстой
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; frame-ancestors 'none'";

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (p.startsWith('/api/') || p.startsWith('/uploads/')) return handler(req, res);
  const page = { '/': 'index.html', '/admin': 'admin.html', '/courier': 'courier.html' }[p];
  const file = path.normalize(path.join(PUBLIC, page || p.slice(1)));
  if ((req.method !== 'GET' && req.method !== 'HEAD') || !file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Олдсонгүй');
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP, 'Referrer-Policy': 'same-origin',
  });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`MIYA Boutique ажиллаж байна:
  Дэлгүүр   http://localhost:${PORT}/
  Админ     http://localhost:${PORT}/admin
  Хүргэлт   Админ → «Хүргэлт» цэсээс холбоосыг хуулна
Админы нууц үг: ${process.env.ADMIN_PASSWORD ? 'ADMIN_PASSWORD орчны хувьсагч' : 'data/secrets.json'}`);
});
