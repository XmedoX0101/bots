const { fork, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PKG_PATH = path.join(ROOT, 'package.json');

// ✅ 1. إنشاء package.json لو مفقوش (حماية ضد الحذف أو الخطأ)
if (!fs.existsSync(PKG_PATH)) {
  console.log('📦 package.json مش موجود. جاري إنشاؤه تلقائياً...');
  const pkg = {
    name: "multi-bot-server", version: "1.0.0", main: "index.js",
    dependencies: { "@whiskeysockets/baileys": "6.6.0", "dotenv": "^16.3.1", "pino": "^8.15.0", "qrcode-terminal": "^0.12.0", "node-cron": "^3.0.3" }
  };
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2));
}

// ✅ 2. تثبيت المكتبات لو node_modules مفقود
if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
  console.log('📦 جاري تثبيت المكتبات... (قد يستغرق 1-2 دقيقة)');
  try {
    execSync('npm install --omit=dev', { cwd: ROOT, stdio: 'inherit' });
    console.log('✅ تم تثبيت المكتبات بنجاح.');
  } catch (e) {
    console.error('❌ فشل تثبيت المكتبات. تأكد من اتصال السيرفر بالإنترنت.');
    process.exit(1);
  }
}

// ✅ 3. إعداد البوتين
const BOTS = [
  { id: 'Bot1-Clinic', folder: 'bot1', port: 3000 },
  { id: 'Bot2-Other',  folder: 'bot2', port: 3001 }
];

function startBot(bot) {
  const botPath = path.join(ROOT, bot.folder, 'index.js');
  if (!fs.existsSync(botPath)) {
    console.error(`❌ ${bot.id}: index.js مش موجود في مجلد ${bot.folder}/`);
    return;
  }

  console.log(`🚀 تشغيل ${bot.id} على البورت ${bot.port}...`);
  const child = fork(botPath, [], {
    cwd: path.join(ROOT, bot.folder),
    stdio: 'inherit',
    env: { ...process.env, PORT: bot.port.toString() } // تمرير البورت تلقائياً
  });

  child.on('close', (code) => {
    console.log(`⚠️ ${bot.id} توقف (كود: ${code}). إعادة التشغيل بعد 3 ثواني...`);
    setTimeout(() => startBot(bot), 3000);
  });
}

// تشغيل البوتين بفارق زمني بسيط
BOTS.forEach((b, i) => setTimeout(() => startBot(b), i * 1500));

process.on('SIGINT', () => process.exit(0));