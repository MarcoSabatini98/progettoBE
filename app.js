// app.js
//
// Applicazione Express: sicurezza, CORS, lettura del corpo delle richieste,
// file pubblici, API e gestione degli errori. Si avvia da server.js; i test
// la importano direttamente senza aprire la porta.

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./src/config/env');
const { preparaContesto } = require('./src/middlewares/contesto.middleware');
const { limiteGenerale } = require('./src/middlewares/limiti.middleware');
const { rottaNonTrovata, gestoreErrori } = require('./src/middlewares/errori.middleware');
const { inviaSuccesso } = require('./src/utils/risposta');
const file = require('./src/utils/file');

const app = express();

// Quanti proxy stanno davanti all'app (Render: 1; Cloudflare + Render: 2).
// Senza, req.ip sarebbe quello del proxy e i limiti per IP bloccherebbero
// tutti insieme; con un numero più alto del vero, chiunque potrebbe
// fingersi un altro IP scrivendo X-Forwarded-For.
if (config.produzione) {
  app.set('trust proxy', config.proxyFidati);
}

app.use(helmet());
app.use(
  cors({
    origin: config.originiFrontend,
    // cookie del refresh token
    credentials: true,
    // il frontend legge da qui il nome dei file scaricati
    exposedHeaders: ['Content-Disposition'],
  }),
);
app.use('/api', limiteGenerale);
// Le risposte delle API contengono dati personali: né il browser né un proxy
// devono conservarle (OWASP REST Security).
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  return next();
});

// Il webhook di Stripe verifica la firma sul corpo originale, byte per byte:
// va letto grezzo prima che express.json lo trasformi.
app.use('/api/pagamenti/webhook/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(preparaContesto);

// Immagini del sito (solo la cartella media: documenti e allegati sono
// privati e si scaricano dalle API con i controlli di accesso).
app.use(
  '/media',
  (req, res, next) => {
    // il frontend è su un altro dominio: senza questo il browser blocca le <img>
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return next();
  },
  config.upload.cloudinary
    ? (req, res, next) => {
        if (req.path.includes('..')) return next(); // come express.static: 404
        res.set('Cache-Control', 'public, max-age=604800');
        return res.redirect(302, file.urlPubblico(`media${req.path}`));
      }
    : express.static(path.resolve(config.upload.cartella, 'media'), { index: false, maxAge: '7d' }),
);

app.get('/salute', (req, res) => inviaSuccesso(res, 200, { stato: 'ok' }));

app.use('/api', require('./src/routes'));

app.use(rottaNonTrovata);
app.use(gestoreErrori);

module.exports = app;
