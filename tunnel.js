const fs = require('fs');
const path = require('path');
const localtunnel = require('localtunnel');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.TUNNEL_HOST || 'https://loca.lt';
const STATE_FILE = process.env.TUNNEL_STATE_FILE || '/Users/xyt/.openclaw/workspace/logs/evolver_observer_tunnel.json';

let current = null;

function persist(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      ...state,
      at: new Date().toISOString(),
    }, null, 2));
  } catch (_e) {}
}

async function start() {
  try {
    current = await localtunnel({ port: PORT, host: HOST });
    const url = current && current.url ? current.url : null;
    console.log(`[observer-tunnel] url=${url}`);
    persist({ ok: true, url, port: PORT, host: HOST });

    current.on('close', () => {
      console.log('[observer-tunnel] tunnel closed; reconnecting in 3s');
      persist({ ok: false, reason: 'closed', port: PORT, host: HOST });
      setTimeout(start, 3000);
    });

    current.on('error', (err) => {
      console.log(`[observer-tunnel] error=${err && err.message ? err.message : String(err)}`);
      persist({ ok: false, reason: err && err.message ? err.message : 'unknown', port: PORT, host: HOST });
    });
  } catch (err) {
    console.log(`[observer-tunnel] startup_error=${err && err.message ? err.message : String(err)}`);
    persist({ ok: false, reason: err && err.message ? err.message : 'startup_error', port: PORT, host: HOST });
    setTimeout(start, 5000);
  }
}

start();
