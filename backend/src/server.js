require('module-alias/register');
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api', require('./routes/analytics'));

app.post('/api/reports/monthly/send-now', async (req, res) => {
  const { generateAndSendMonthlyReport } = require('./cron/monthlyReport');
  await generateAndSendMonthlyReport();
  res.json({ success: true, message: 'Monthly report sent' });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 8888;
app.listen(PORT, '0.0.0.0', () => console.log(`Express running → On PORT : ${PORT}`));

const { startMonthlyReportCron } = require('./cron/monthlyReport');
startMonthlyReportCron();
