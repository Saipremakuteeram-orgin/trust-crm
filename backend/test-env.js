process.env.PUPPETEER_EXECUTABLE_PATH = 'C:\\Users\\Sathya\\.cache\\puppeteer\\chrome\\win64-152.0.7977.42\\chrome-win64\\chrome.exe';
console.log('PUPPETEER_EXECUTABLE_PATH set to:', process.env.PUPPETEER_EXECUTABLE_PATH);

setTimeout(() => {
  const { manager } = require('./src/services/whatsapp/sessionManager');
  console.log('Manager loaded');
  process.exit(0);
}, 1000);
