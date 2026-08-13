const { Client } = require('whatsapp-web.js');
require('dotenv').config();
const path = require('path');

const chromePath = 'C:\\Users\\Sathya\\.cache\\puppeteer\\chrome\\win64-152.0.7977.42\\chrome-win64\\chrome.exe';

const client = new Client({
  puppeteer: {
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  console.log('QR received!');
  console.log('QR length:', qr.length);
});

client.on('ready', () => {
  console.log('Client ready!');
  process.exit(0);
});

client.on('error', (err) => {
  console.error('Error:', err.message);
});

client.on('auth_failure', (msg) => {
  console.error('Auth failure:', msg);
  process.exit(1);
});

client.initialize();

setTimeout(() => {
  console.log('Timeout - quitting');
  process.exit(1);
}, 30000);
