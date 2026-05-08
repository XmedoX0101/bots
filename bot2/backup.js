const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

// نسخ احتياطي كل 6 ساعات
cron.schedule('0 */6 * * *', () => {
  const dbFile = path.join(__dirname, 'clinic.db');
  const backupFile = path.join(BACKUP_DIR, `clinic-backup-${Date.now()}.db`);
  if (fs.existsSync(dbFile)) {
    fs.copyFileSync(dbFile, backupFile);
    console.log(`💾 تم النسخ الاحتياطي: ${path.basename(backupFile)}`);
  }
});