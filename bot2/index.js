require('dotenv').config();
const http = require('http');
const db = require('./db');
const { startClient } = require('./client');
const { handleWebhook } = require('./bot');
require('./scheduler');

const PORT = process.env.PORT || 3000;
http.createServer((_, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('Alive'); }).listen(PORT, () => console.log(`🌐 السيرفر شغال على البورت ${PORT}`));

console.log('🚀 بدء تشغيل البوت...');
db.initDB().then(() => startClient(handleWebhook)).catch(e => { console.error('❌ فشل التشغيل:', e.message); process.exit(1); });