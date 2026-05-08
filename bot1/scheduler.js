const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { sendWeeklyReport } = require('./bot');

const BACKUP = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP)) fs.mkdirSync(BACKUP);

cron.schedule('0 */6 * * *', () => {
  const db = path.join(__dirname, 'data.json');
  if (fs.existsSync(db)) {
    fs.copyFileSync(db, path.join(BACKUP, `data-${Date.now()}.json`));
    console.log('💾 نسخ احتياطي تم');
  }
});

cron.schedule('0 10 * * 0', async () => {
  console.log('🔄 جاري إرسال التقرير الأسبوعي...');
  await sendWeeklyReport();
});
console.log('✅ Scheduler جاهز');