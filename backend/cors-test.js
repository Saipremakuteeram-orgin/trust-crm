const http = require('http');
const req = http.request({
  host: 'localhost', port: 8888, path: '/api/whatsapp/qr',
  headers: { Origin: 'http://localhost:3000', Authorization: 'Bearer x' }
}, res => {
  console.log('ACAO header:', res.headers['access-control-allow-origin']);
  console.log('Status:', res.statusCode);
  res.resume();
  res.on('end', () => process.exit(0));
});
req.on('error', e => { console.error('ERR', e.message); process.exit(1); });
req.end();
