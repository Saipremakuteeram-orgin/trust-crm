const cron = require('node-cron');
const { runDailyBackup, getBackupStatusToday } = require('@/services/backup');

async function checkAndReinstate() {
  const logs = await getBackupStatusToday();
  const today = new Date().toISOString().slice(0, 10);

  const todaySuccess = logs?.some((l) => l.status === 'success');
  if (todaySuccess) {
    return;
  }

  const todayFailed = logs?.some((l) => l.status === 'failed');
  if (todayFailed) {
    console.warn(`⚠️  Backup for ${today} previously failed — retrying...`);
  } else {
    console.warn(`⚠️  No successful backup for ${today} — running now...`);
  }

  await runDailyBackup('health_check_recovery');
}

function startBackupHealthCheckCron() {
  cron.schedule('0 8,12,16,20 * * *', () => {
    checkAndReinstate().catch((err) => console.error('Backup health check failed:', err.message));
  }, { timezone: 'Asia/Kolkata' });
  console.log('🕐 Backup health check cron scheduled (08:00, 12:00, 16:00, 20:00 IST)');
}

module.exports = { startBackupHealthCheckCron };
