process.env.PUPPETEER_EXECUTABLE_PATH = 'C:\\Users\\Sathya\\.cache\\puppeteer\\chrome\\win64-152.0.7977.42\\chrome-win64\\chrome.exe';
require('module-alias/register');
const { manager } = require('./src/services/whatsapp/sessionManager');

manager.createClient('testuser').then(result => {
  console.log('Create client result:', result);
  
  setTimeout(() => {
    const qr = manager.getQR('testuser');
    if (qr) {
      console.log('QR found!', qr.substring(0, 50) + '...');
    } else {
      console.log('QR not found');
    }
    const status = manager.getStatus('testuser');
    console.log('Status:', status);
    process.exit(0);
  }, 20000);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
