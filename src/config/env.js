// Legge e valida le variabili d'ambiente una volta sola all'avvio.
// Se qualcosa manca o è sbagliato l'applicazione non parte e dice cosa correggere.
// Nei test il file .env non viene letto: le variabili le imposta il test.

const Joi = require('joi');
const messaggi = require('./messaggi-joi');

if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config({ quiet: true });
}

const facoltativo = Joi.string().allow('').default('');
const segreto = Joi.string().min(32).required();
/** Facoltativo, ma obbligatorio se la variabile indicata ha un valore. */
const obbligatorioCon = (variabile) =>
  Joi.when(variabile, {
    is: Joi.string().min(1),
    then: Joi.string().required(),
    otherwise: facoltativo,
  });

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  APP_URL: Joi.string().uri().default('http://localhost:3000'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:4200'),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'http', 'debug').empty(''),

  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(3306),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: facoltativo,
  DB_POOL_MAX: Joi.number().integer().min(1).default(10),
  DB_LOG: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: segreto,
  JWT_REFRESH_SECRET: segreto.invalid(Joi.ref('JWT_ACCESS_SECRET')),
  JWT_CHAT_SECRET: segreto.invalid(Joi.ref('JWT_ACCESS_SECRET'), Joi.ref('JWT_REFRESH_SECRET')),
  JWT_ACCESS_DURATA: Joi.string().default('15m'),
  REFRESH_DURATA_GIORNI: Joi.number().integer().min(1).default(30),

  UPLOAD_DIR: Joi.string().default('uploads'),
  UPLOAD_MAX_MB: Joi.number().positive().default(5),

  SMTP_HOST: facoltativo,
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: facoltativo,
  SMTP_PASSWORD: facoltativo,
  MAIL_MITTENTE: facoltativo,

  // Senza il segreto del webhook i pagamenti partirebbero ma non verrebbero mai
  // confermati: se il provider è configurato, il segreto è obbligatorio.
  STRIPE_SECRET_KEY: facoltativo,
  STRIPE_WEBHOOK_SECRET: obbligatorioCon('STRIPE_SECRET_KEY'),

  PAYPAL_AMBIENTE: Joi.string().valid('sandbox', 'live').default('sandbox'),
  PAYPAL_CLIENT_ID: facoltativo,
  PAYPAL_CLIENT_SECRET: facoltativo,
  PAYPAL_WEBHOOK_ID: obbligatorioCon('PAYPAL_CLIENT_SECRET'),

  ALLOGGIATI_UTENTE: facoltativo,
  ALLOGGIATI_PASSWORD: facoltativo,
  ALLOGGIATI_WSKEY: facoltativo,
});

const { value: v, error } = schema.validate(process.env, {
  allowUnknown: true,
  abortEarly: false,
  messages: messaggi,
  errors: { wrap: { label: false } },
});

if (error) {
  const elenco = error.details.map((d) => `  - ${d.message}`).join('\n');
  throw new Error(`Configurazione non valida (controlla il file .env):\n${elenco}`);
}

const produzione = v.NODE_ENV === 'production';

module.exports = Object.freeze({
  ambiente: v.NODE_ENV,
  produzione,
  test: v.NODE_ENV === 'test',
  porta: v.PORT,
  urlApp: v.APP_URL.replace(/\/$/, ''),
  urlFrontend: v.FRONTEND_URL.replace(/\/$/, ''),
  livelloLog: v.LOG_LEVEL ?? (produzione ? 'info' : 'debug'),

  db: {
    host: v.DB_HOST,
    porta: v.DB_PORT,
    nome: v.DB_NAME,
    utente: v.DB_USER,
    password: v.DB_PASSWORD,
    poolMax: v.DB_POOL_MAX,
    log: v.DB_LOG,
  },

  jwt: {
    segretoAccess: v.JWT_ACCESS_SECRET,
    segretoRefresh: v.JWT_REFRESH_SECRET,
    segretoChat: v.JWT_CHAT_SECRET,
    durataAccess: v.JWT_ACCESS_DURATA,
    durataRefreshGiorni: v.REFRESH_DURATA_GIORNI,
  },

  upload: {
    cartella: v.UPLOAD_DIR,
    maxByte: Math.round(v.UPLOAD_MAX_MB * 1024 * 1024),
  },

  smtp: {
    attivo: Boolean(v.SMTP_HOST),
    host: v.SMTP_HOST,
    porta: v.SMTP_PORT,
    sicuro: v.SMTP_SECURE,
    utente: v.SMTP_USER,
    password: v.SMTP_PASSWORD,
    mittente: v.MAIL_MITTENTE,
  },

  stripe: {
    attivo: Boolean(v.STRIPE_SECRET_KEY),
    chiaveSegreta: v.STRIPE_SECRET_KEY,
    segretoWebhook: v.STRIPE_WEBHOOK_SECRET,
  },

  paypal: {
    attivo: Boolean(v.PAYPAL_CLIENT_ID && v.PAYPAL_CLIENT_SECRET),
    ambiente: v.PAYPAL_AMBIENTE,
    clientId: v.PAYPAL_CLIENT_ID,
    clientSecret: v.PAYPAL_CLIENT_SECRET,
    webhookId: v.PAYPAL_WEBHOOK_ID,
  },

  alloggiati: {
    attivo: Boolean(v.ALLOGGIATI_UTENTE && v.ALLOGGIATI_PASSWORD && v.ALLOGGIATI_WSKEY),
    utente: v.ALLOGGIATI_UTENTE,
    password: v.ALLOGGIATI_PASSWORD,
    wskey: v.ALLOGGIATI_WSKEY,
  },
});
