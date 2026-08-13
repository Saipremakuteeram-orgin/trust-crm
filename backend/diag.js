require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);
console.log('Chrome exists:', process.env.PUPPETEER_EXECUTABLE_PATH ? fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH) : 'NO PATH');
console.log('PUPPETEER_CACHE_DIR:', process.env.PUPPETEER_CACHE_DIR);

// Test findChromeExecutable logic
const puppeteerCache = process.env.PUPPETEER_CACHE_DIR || path.join(require('os').homedir(), '.cache', 'puppeteer', 'chrome');
console.log('puppeteerCache:', puppeteerCache);
console.log('cache exists:', fs.existsSync(puppeteerCache));
if (fs.existsSync(puppeteerCache)) {
  console.log('versions:', fs.readdirSync(puppeteerCache));
}
