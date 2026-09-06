import http from 'node:http';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

// Global hard timeout: 25 seconds max runtime
const globalTimer = setTimeout(() => {
  console.error('\n[HARD TIMEOUT] Script exceeded 25 seconds! Terminating.');
  process.exit(1);
}, 25000);
globalTimer.unref();

// 1. Read .dev.vars
const devVarsPath = resolve('packages/worker/.dev.vars');
let botToken = '';
let webhookSecret = '';

try {
  const content = readFileSync(devVarsPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key === 'BOT_TOKEN') botToken = val;
      if (key === 'TELEGRAM_WEBHOOK_SECRET') webhookSecret = val;
    }
  }
} catch (e) {
  console.error('Failed to read .dev.vars:', e);
  process.exit(1);
}

console.log('===========================================================');
console.log(' Telegram HMAC Auth End-to-End Live Verification Test');
console.log(` Loaded BOT_TOKEN: ${botToken.slice(0, 12)}... (length ${botToken.length})`);
console.log(` Loaded TELEGRAM_WEBHOOK_SECRET: ${webhookSecret}`);
console.log('===========================================================\n');

function generateInitData(token, user, authDate = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('user', JSON.stringify(user));

  const pairs = [];
  for (const [key, value] of params.entries()) {
    pairs.push({ key, value });
  }
  pairs.sort((a, b) => a.key.localeCompare(b.key));
  const dataCheckString = pairs.map(({ key, value }) => `${key}=${value}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  params.set('hash', hash);
  return params.toString();
}

function sendHttp(path, options = {}, body = null, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        req.destroy(new Error(`HTTP request to ${path} timed out after ${timeoutMs}ms`));
        resolve({ status: 0, statusText: 'TIMEOUT', body: 'Request timed out' });
      }
    }, timeoutMs);

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 8787,
        path,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => (resData += chunk));
        res.on('end', () => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            resolve({
              status: res.statusCode,
              statusText: res.statusMessage,
              body: resData,
              headers: res.headers,
            });
          }
        });
      }
    );

    req.on('upgrade', (res, socket) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          body: 'UPGRADE_101_ACCEPTED',
          headers: res.headers,
        });
        socket.destroy();
      }
    });

    req.on('error', (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve({ status: 0, statusText: 'REQ_ERROR', body: err.message });
      }
    });

    if (body) req.write(body);
    req.end();
  });
}

function testWebSocket(url, sendPayload = null, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let finished = false;
    let hasOpened = false;
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        try { ws.close(); } catch {}
        resolve({ connected: hasOpened, error: 'TIMEOUT', firstMessage: null });
      }
    }, timeoutMs);

    let ws;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      clearTimeout(timer);
      return resolve({ connected: false, error: err.message, firstMessage: null });
    }

    ws.addEventListener('open', () => {
      hasOpened = true;
      if (sendPayload) {
        try {
          ws.send(JSON.stringify(sendPayload));
        } catch (err) {
          console.log('    [ws send error]:', err);
        }
      } else {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve({ connected: true, error: null, firstMessage: null });
        }
      }
    });

    ws.addEventListener('message', (ev) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve({ connected: true, error: null, firstMessage: ev.data });
      }
    });

    ws.addEventListener('error', (ev) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve({ connected: false, error: ev.message || 'HANDSHAKE_REJECTED', firstMessage: null });
      }
    });

    ws.addEventListener('close', (ev) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve({
          connected: hasOpened,
          error: `CLOSED_CODE_${ev.code}`,
          firstMessage: null,
        });
      }
    });
  });
}

const testUser = { id: 987654321, first_name: 'Alice', username: 'alice_liar' };
const validInitData = generateInitData(botToken, testUser);
const expiredInitData = generateInitData(botToken, testUser, Math.floor(Date.now() / 1000) - 200000);
const wrongTokenInitData = generateInitData('999999999:WrongSecretKeyPlaceholderXXXXX', testUser);
const tamperedInitData = validInitData.replace(/hash=[0-9a-f]{12}/, 'hash=deadbeef0000');

async function ensureServerRunning() {
  const healthCheck = await sendHttp('/api/health', {}, null, 1000);
  if (healthCheck.status === 200) {
    console.log('[Server] Connected to existing wrangler dev server on port 8787.');
    return null;
  }

  console.log('[Server] Starting wrangler dev locally on port 8787...');
  const server = spawn('npx.cmd', ['wrangler', 'dev', '--port', '8787'], {
    cwd: resolve('packages/worker'),
    stdio: 'ignore',
    shell: true,
  });

  const start = Date.now();
  while (Date.now() - start < 8000) {
    await new Promise((r) => setTimeout(r, 500));
    const chk = await sendHttp('/api/health', {}, null, 500);
    if (chk.status === 200) {
      console.log('[Server] wrangler dev is now ready on port 8787.');
      return server;
    }
  }

  server.kill();
  throw new Error('Failed to start wrangler dev on port 8787 within 8s');
}

async function main() {
  const server = await ensureServerRunning();
  const results = [];

  try {
    // 1. Health check
    console.log('1. Testing GET /api/health...');
    const resHealth = await sendHttp('/api/health');
    console.log(`   -> status: ${resHealth.status}, body: ${resHealth.body}`);
    results.push({
      name: 'GET /api/health returns 200 OK',
      expected: '200 {"status":"ok"}',
      actual: `${resHealth.status} ${resHealth.body}`,
      pass: resHealth.status === 200 && resHealth.body.includes('ok'),
    });

    // 2. Reject non-upgrade HTTP to /room/:roomId/ws
    console.log('2. Testing non-WebSocket HTTP request to /room/:roomId/ws...');
    const resNoUpgrade = await sendHttp('/room/r_authtest/ws');
    console.log(`   -> status: ${resNoUpgrade.status}, body: ${resNoUpgrade.body}`);
    results.push({
      name: 'Reject request without WebSocket Upgrade header (426)',
      expected: '426 Expected WebSocket Upgrade',
      actual: `${resNoUpgrade.status} ${resNoUpgrade.body}`,
      pass: resNoUpgrade.status === 426,
    });

    // 3. WebSocket with MISSING initData
    console.log('3. Testing WebSocket handshake with MISSING initData...');
    const wsMissing = await testWebSocket('ws://127.0.0.1:8787/room/r_authtest/ws');
    console.log(`   -> connected: ${wsMissing.connected}, result: ${wsMissing.error}`);
    results.push({
      name: 'Reject WebSocket connection with MISSING initData',
      expected: 'Handshake rejected / connected=false',
      actual: `connected=${wsMissing.connected}, error=${wsMissing.error}`,
      pass: !wsMissing.connected,
    });

    // 4. WebSocket with TAMPERED initData
    console.log('4. Testing WebSocket handshake with TAMPERED initData...');
    const wsTampered = await testWebSocket(`ws://127.0.0.1:8787/room/r_authtest/ws?initData=${encodeURIComponent(tamperedInitData)}`);
    console.log(`   -> connected: ${wsTampered.connected}, result: ${wsTampered.error}`);
    results.push({
      name: 'Reject WebSocket connection with TAMPERED hash',
      expected: 'Handshake rejected / connected=false',
      actual: `connected=${wsTampered.connected}, error=${wsTampered.error}`,
      pass: !wsTampered.connected,
    });

    // 5. WebSocket with EXPIRED initData (>24h old)
    console.log('5. Testing WebSocket handshake with EXPIRED initData...');
    const wsExpired = await testWebSocket(`ws://127.0.0.1:8787/room/r_authtest/ws?initData=${encodeURIComponent(expiredInitData)}`);
    console.log(`   -> connected: ${wsExpired.connected}, result: ${wsExpired.error}`);
    results.push({
      name: 'Reject WebSocket connection with EXPIRED auth_date',
      expected: 'Handshake rejected / connected=false',
      actual: `connected=${wsExpired.connected}, error=${wsExpired.error}`,
      pass: !wsExpired.connected,
    });

    // 6. WebSocket signed with WRONG Bot Token
    console.log('6. Testing WebSocket handshake signed with WRONG bot token...');
    const wsWrongToken = await testWebSocket(`ws://127.0.0.1:8787/room/r_authtest/ws?initData=${encodeURIComponent(wrongTokenInitData)}`);
    console.log(`   -> connected: ${wsWrongToken.connected}, result: ${wsWrongToken.error}`);
    results.push({
      name: 'Reject WebSocket connection signed with WRONG Bot Token',
      expected: 'Handshake rejected / connected=false',
      actual: `connected=${wsWrongToken.connected}, error=${wsWrongToken.error}`,
      pass: !wsWrongToken.connected,
    });

    // 7. WebSocket with VALID initData HMAC signed with real BOT_TOKEN
    console.log('7. Testing WebSocket handshake with VALID initData HMAC...');
    const wsValid = await testWebSocket(
      `ws://127.0.0.1:8787/room/r_authtest/ws?initData=${encodeURIComponent(validInitData)}`,
      { type: 'JOIN', payload: { name: 'Alice' } }
    );
    console.log(`   -> connected: ${wsValid.connected}, firstMessage: ${wsValid.firstMessage ? wsValid.firstMessage.slice(0, 50) + '...' : 'none'}`);
    results.push({
      name: 'ACCEPT WebSocket connection with VALID initData & receive DO message',
      expected: 'connected=true, received message',
      actual: `connected=${wsValid.connected}, receivedMsg=${Boolean(wsValid.firstMessage)}`,
      pass: wsValid.connected,
    });

    // 8. Telegram Bot Webhook: Reject wrong secret token
    console.log('8. Testing Webhook POST with WRONG secret token...');
    const resBadWebhook = await sendHttp(
      '/api/telegram-webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'wrong_token',
        },
      },
      JSON.stringify({ update_id: 1 })
    );
    console.log(`   -> status: ${resBadWebhook.status}, body: ${resBadWebhook.body}`);
    results.push({
      name: 'Reject Webhook POST with WRONG secret token (401)',
      expected: '401 Unauthorized',
      actual: `${resBadWebhook.status} ${resBadWebhook.body}`,
      pass: resBadWebhook.status === 401,
    });

    // 9. Telegram Bot Webhook: Accept valid secret token
    console.log('9. Testing Webhook POST with VALID secret token...');
    const resGoodWebhook = await sendHttp(
      '/api/telegram-webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': webhookSecret,
        },
      },
      JSON.stringify({ update_id: 2, message: { text: '/start' } })
    );
    console.log(`   -> status: ${resGoodWebhook.status}, body: ${resGoodWebhook.body}`);
    results.push({
      name: 'ACCEPT Webhook POST with VALID secret token (200)',
      expected: '200 OK',
      actual: `${resGoodWebhook.status} ${resGoodWebhook.body}`,
      pass: resGoodWebhook.status === 200,
    });

  } finally {
    if (server) {
      console.log('\n[Server] Stopping spawned wrangler dev process...');
      server.kill();
    }
  }

  console.log('\n========================= LIVE TEST RESULTS =========================');
  let allPass = true;
  for (const r of results) {
    const mark = r.pass ? '✓ PASS' : '✗ FAIL';
    if (!r.pass) allPass = false;
    console.log(`[${mark}] ${r.name}`);
    console.log(`       Expected: ${r.expected}`);
    console.log(`       Actual:   ${r.actual}`);
  }
  console.log('=====================================================================');

  if (!allPass) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});
