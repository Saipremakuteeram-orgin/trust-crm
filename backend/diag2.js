require('dotenv').config();
require('module-alias/register');
const { manager } = require('./src/services/whatsapp/sessionManager');

const userId = 'diagtest';

console.log('Creating client...');
manager.createClient(userId).then(result => {
  console.log('createClient result:', result);

  let checks = 0;
  const interval = setInterval(() => {
    checks++;
    const qr = manager.getQR(userId);
    const status = manager.getStatus(userId);
    console.log(`[${checks * 2}s] QR: ${qr ? 'PRESENT (' + qr.length + ' chars)' : 'null'} | Status: ${JSON.stringify(status)}`);
    if (qr || checks >= 15) {
      clearInterval(interval);
      process.exit(0);
    }
  }, 2000);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
