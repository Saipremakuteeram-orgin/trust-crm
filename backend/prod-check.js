const https = require('https');
const req = https.get({
  host: 'trust-crm-b8rn.onrender.com', path: '/wa/',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9',
    'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document',
  },
}, (res) => {
  console.log('PROD PROXY STATUS:', res.statusCode);
  let b = ''; res.on('data', c => b += c);
  res.on('end', () => { console.log('len', b.length, 'errPage', b.includes('<title>Error</title>'), 'xfo', res.headers['x-frame-options'] || 'none'); process.exit(0); });
});
req.on('error', e => { console.error('ERR', e.message); process.exit(1); });
