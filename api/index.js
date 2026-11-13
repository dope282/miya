'use strict';
// Vercel-ийн функц: /api/* болон /uploads/* хүсэлтүүд энд ирнэ (vercel.json-ийн rewrites).
module.exports = require('../lib/app').handler;
