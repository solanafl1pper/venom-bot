'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function createServer(storage) {
  const publicDir = path.join(__dirname, '..', 'public');

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // 1. Health check
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
      return;
    }

    // 2. API: Token exchange
    if (pathname === '/api/token' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const { code } = JSON.parse(body || '{}');
          const clientId = process.env.DISCORD_CLIENT_ID;
          const clientSecret = process.env.DISCORD_CLIENT_SECRET;

          if (!clientSecret) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'DISCORD_CLIENT_SECRET not configured' }));
            return;
          }

          const params = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code,
          });

          const response = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
          });

          const data = await response.json();
          res.writeHead(response.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 3. API: Get score
    if (pathname === '/api/score' && req.method === 'GET') {
      const userId = url.searchParams.get('userId');
      const best = userId && storage ? storage.bestScore('2048', userId) : 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ best }));
      return;
    }

    // 4. API: Save score
    if (pathname === '/api/score' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const { userId, score, username } = JSON.parse(body || '{}');
          if (userId && typeof score === 'number' && storage) {
            storage.setBestScore('2048', userId, score);
            if (username) storage.ensureUser(userId, { username });
          }
          const best = userId && storage ? storage.bestScore('2048', userId) : score;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, best }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 5. Static files
    let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);

    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath);
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
  });

  return server;
}

function startServer(storage, port = process.env.PORT || 3000) {
  const server = createServer(storage);
  server.listen(port, () => {
    console.log(`[веб-сервер] 2048 Activity запущен на http://localhost:${port}`);
  });
  return server;
}

module.exports = { createServer, startServer };
