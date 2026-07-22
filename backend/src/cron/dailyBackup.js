const cron = require('node-cron');
const { runDailyBackup } = require('@/services/backup');

function startDailyBackupCron() {
  cron.schedule('0 6,18 * * *', () => {
    runDailyBackup().catch((err) => console.error('Daily backup cron failed:', err.message));
  }, { timezone: 'Asia/Kolkata' });
  console.log('🕐 Daily backup cron scheduled (06:00 & 18:00 IST)');
}

module.exports = { startDailyBackupCron };
