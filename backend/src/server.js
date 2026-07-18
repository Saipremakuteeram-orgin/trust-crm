require('module-alias/register');
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { requireAuth, requireRole } = require('./middlewares/auth');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/analytics', requireAuth, require('./routes/analytics'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/users', require('./routes/users'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/exports', require('./routes/exports'));
app.use('/api/drive', require('./routes/drive'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/reports', require('./routes/reports'));

app.post('/api/reports/monthly/send-now', requireAuth, requireRole('admin', 'accountant'), async (req, res) => {
  const { generateAndSendMonthlyReport } = require('./cron/monthlyReport');
  await generateAndSendMonthlyReport();
  res.json({ success: true, message: 'Monthly report sent' });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 8888;
app.listen(PORT, '0.0.0.0', () => console.log(`Express running → On PORT : ${PORT}`));

const { startMonthlyReportCron } = require('./cron/monthlyReport');
startMonthlyReportCron();

const { startDailyBackupCron } = require('./cron/dailyBackup');
startDailyBackupCron();

const { startBackupHealthCheckCron } = require('./cron/backupHealthCheck');
startBackupHealthCheckCron();
