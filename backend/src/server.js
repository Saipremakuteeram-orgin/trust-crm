require('module-alias/register');
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireRole } = require('./middlewares/auth');

const app = express();

const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'https://crm.saidharmasamrakshanapremakuteeram.qzz.io,https://trust-crm.vercel.app').split(',').map((s) => s.trim());

app.use(compression({ level: 6, threshold: 1024 }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));

const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many requests, please try again later' } });
app.use('/api', globalLimiter);

const sensitiveLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Rate limit exceeded for this action' } });

app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/analytics', requireAuth, require('./routes/analytics'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/users', sensitiveLimiter, require('./routes/users'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/exports', require('./routes/exports'));
app.use('/api/drive', require('./routes/drive'));
app.use('/api/backup', sensitiveLimiter, require('./routes/backup'));
app.use('/api/file-send', sensitiveLimiter, require('./routes/fileSend'));
app.use('/api/mail', sensitiveLimiter, require('./routes/mail'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/scheduled-reports', require('./routes/scheduledReports'));

app.post('/api/reports/monthly/send-now', requireAuth, sensitiveLimiter, requireRole('admin', 'accountant'), async (req, res) => {
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

const { startScheduledReportsCron } = require('./cron/scheduledReports');
startScheduledReportsCron();
