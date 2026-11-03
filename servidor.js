// Servidor estático mínimo: node servidor.js → http://localhost:8080
// POST /guardar?nombre=fig.png (cuerpo: data URL PNG) guarda la figura en figuras/
const http = require('http'), fs = require('fs'), path = require('path');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.csv': 'text/csv' };
http.createServer((req, res) => {
  const [rawPath, query] = req.url.split('?');
  if (req.method === 'POST' && rawPath === '/guardar') {
    const nombre = path.basename(new URLSearchParams(query).get('nombre') || '');
    if (!/^[\w-]+\.png$/.test(nombre)) { res.writeHead(400); return res.end('nombre inválido'); }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const dir = path.join(__dirname, 'figuras');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, nombre), Buffer.from(body.replace(/^data:image\/png;base64,/, ''), 'base64'));
      res.writeHead(200); res.end('ok');
    });
    return;
  }
  let rel = decodeURIComponent(rawPath);
  if (rel === '/') rel = '/index.html';
  const file = path.join(__dirname, rel);
  if (!file.startsWith(__dirname + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8080, () => console.log('http://localhost:8080'));
