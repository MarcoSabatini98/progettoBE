// scripts/sviluppo.js
//
// npm run dev: il server in watch più un tunnel ngrok verso la sua porta, così
// i webhook di PayPal (che vogliono un https pubblico) arrivano anche in locale.
// ngrok sta fuori dal watch: i riavvii del server non chiudono il tunnel.
// Senza ngrok installato il server parte lo stesso.
// ponytail: solo sviluppo; in produzione i webhook puntano ad APP_URL.

const { spawn } = require('node:child_process');
const path = require('node:path');
const { porta } = require('../src/config/env');

const RADICE = path.resolve(__dirname, '..');
// API locale dell'agente ngrok: da qui si legge l'indirizzo pubblico.
const API_NGROK = 'http://127.0.0.1:4040/api/tunnels';
const TENTATIVI = 20;
const ATTESA_MS = 500;

const aspetta = (ms) => new Promise((risolvi) => setTimeout(risolvi, ms));

async function indirizzoPubblico() {
  for (let i = 0; i < TENTATIVI; i += 1) {
    try {
      const { tunnels } = await (await fetch(API_NGROK)).json();
      const tunnel = tunnels.find((t) => t.public_url.startsWith('https://'));
      if (tunnel) return tunnel.public_url;
    } catch {
      // l'agente non è ancora pronto
    }
    await aspetta(ATTESA_MS);
  }
  return null;
}

function avviaTunnel() {
  const ngrok = spawn('ngrok', ['http', String(porta), '--log', 'stdout', '--log-level', 'warn'], {
    windowsHide: true,
  });
  let uscita = '';
  ngrok.stdout.on('data', (dati) => {
    uscita += dati;
  });
  ngrok.on('error', () => {
    console.warn(
      '[ngrok] non trovato: il server parte senza tunnel (webhook PayPal non raggiungibili).',
    );
  });
  ngrok.on('exit', (codice) => {
    if (codice) console.warn(`[ngrok] chiuso con errore:\n${uscita.trim()}`);
  });
  indirizzoPubblico().then((url) => {
    if (url) console.log(`[ngrok] ${url} -> webhook PayPal: ${url}/api/pagamenti/webhook/paypal`);
  });
  return ngrok;
}

const tunnel = avviaTunnel();
const server = spawn(process.execPath, ['--watch', 'server.js'], { cwd: RADICE, stdio: 'inherit' });

const chiudi = () => tunnel.kill();
server.on('exit', (codice) => {
  chiudi();
  process.exit(codice ?? 0);
});
process.on('SIGINT', chiudi);
process.on('SIGTERM', chiudi);
