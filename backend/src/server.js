require('module-alias/register');
require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireRole } = require('./middlewares/auth');
const { proxyHandler, attachWebSocket } = require('./routes/whatsappProxy');

const app = express();

const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'https://crmsaidharmasamrakshanapremakuteeram.dpdns.org,https://crm.saidharmasamrakshanapremakuteeram.qzz.io,https://trust-crm.vercel.app').split(',').map((s) => s.trim());

// Allow configured origins, localhost dev origins, and any https origin.
// Safe because the API authenticates via Bearer tokens (not cookies), so
// reflecting the origin does not expose credentialed cross-site requests.
function isAllowedOrigin(origin) {
  if (!origin) return true; // server-to-server / non-browser
  if (CORS_ORIGINS.includes(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (/^https:\/\//.test(origin)) return true; // any https origin (production frontends)
  return false;
}

app.use(compression({ level: 6, threshold: 1024 }));
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: false,
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));
app.use(cors({
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin) ? origin : false),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
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
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/trustees', require('./routes/trustees'));
app.use('/api/compliance', require('./routes/compliance'));
app.use('/api/receipts', require('./routes/receipts'));
app.use('/api/bank-reconciliation', require('./routes/bankReconciliation'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/journal-entries', require('./routes/journalEntries'));
app.use('/api/users', sensitiveLimiter, require('./routes/users'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/exports', require('./routes/exports'));
app.use('/api/drive', require('./routes/drive'));
app.use('/api/backup', sensitiveLimiter, require('./routes/backup'));
app.use('/api/file-send', sensitiveLimiter, require('./routes/fileSend'));
app.use('/api/mail', sensitiveLimiter, require('./routes/mail'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/scheduled-reports', require('./routes/scheduledReports'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/recurring-transactions', require('./routes/recurringTransactions'));
app.use('/api/functions', require('./routes/functions'));
app.use('/api/whatsapp', require('./routes/whatsapp'));

// WhatsApp Web reverse proxy — serves web.whatsapp.com from our own origin
// so it can be embedded in an iframe (strips WhatsApp's frame-ancestors CSP).
app.use('/wa', proxyHandler);

app.post('/api/reports/monthly/send-now', requireAuth, sensitiveLimiter, requireRole('admin', 'accountant'), async (req, res) => {
  const { generateAndSendMonthlyReport } = require('./cron/monthlyReport');
  const { logActivity } = require('./lib/logger');
  await generateAndSendMonthlyReport();
  logActivity({ userId: req.user.id, userEmail: req.user.email, action: 'send_now', entity: 'scheduled_report', details: { name: 'Monthly Report (manual)', source: 'manual' }, ipAddress: req.ip });
  res.json({ success: true, message: 'Monthly report sent' });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 8888;
const server = app.listen(PORT, '0.0.0.0', () => console.log(`Express running → On PORT : ${PORT}`));
attachWebSocket(server);

const { startMonthlyReportCron } = require('./cron/monthlyReport');
startMonthlyReportCron();

const { startDailyBackupCron } = require('./cron/dailyBackup');
startDailyBackupCron();

const { startBackupHealthCheckCron } = require('./cron/backupHealthCheck');
startBackupHealthCheckCron();

const { startScheduledReportsCron } = require('./cron/scheduledReports');
startScheduledReportsCron();

const { startRecurringTransactionsCron } = require('./cron/recurringTransactions');
startRecurringTransactionsCron();

process.on('unhandledRejection',(err)=>{console.error('[unhandledRejection]',err.message||err);});
process.on('uncaughtException',(err)=>{console.error('[uncaughtException]',err.message||err);});

const { manager } = require('./services/whatsapp/sessionManager');
manager.restoreSessions().catch(err => console.error('[startup] restoreSessions failed:', err.message));

// --- Keep-alive: prevent Render free tier from sleeping the service ---
const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000; // 10 minutes
setInterval(() => {
  const req = http.request(`http://localhost:${PORT}/health`, { method: 'GET', timeout: 5000 }, (res) => {
    if (res.statusCode === 200) {
      console.log(`[keep-alive] Ping successful (${new Date().toISOString()})`);
    }
  });
  req.on('error', (err) => console.error('[keep-alive] Ping failed:', err.message));
  req.on('timeout', () => { req.destroy(); console.error('[keep-alive] Ping timed out'); });
  req.end();
}, KEEP_ALIVE_INTERVAL);
console.log(`Keep-alive self-ping enabled (every ${KEEP_ALIVE_INTERVAL / 1000}s)`);

// --- Startup backup verification: warn if no successful backup today ---
(async () => {
  try {
    const { getBackupStatusToday } = require('./services/backup');
    const logs = await getBackupStatusToday();
    const todaySuccess = logs?.some((l) => l.status === 'success');
    const istNow = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const istHour = new Date(istNow).getHours();

    if (!todaySuccess && istHour >= 7) {
      console.warn(`⚠️  STARTUP WARNING: No successful backup found for today. Last known backup may be stale.`);
    } else if (todaySuccess) {
      console.log(`✅ Startup check: Today's backup confirmed.`);
    }
  } catch (err) {
    console.error('[startup] Backup verification failed:', err.message);
  }
})();
