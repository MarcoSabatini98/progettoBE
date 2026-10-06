const ORIGINALE = process.env;

const BASE = {
  NODE_ENV: 'test',
  DB_NAME: 'prova',
  DB_USER: 'utente',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  JWT_CHAT_SECRET: 'c'.repeat(32),
};

function carica(variabili) {
  process.env = { ...variabili };
  let config;
  jest.isolateModules(() => {
    config = require('../../../src/config/env');
  });
  return config;
}

afterEach(() => {
  process.env = ORIGINALE;
});

describe('config/env', () => {
  test('applica i valori predefiniti e converte i tipi', () => {
    const config = carica({ ...BASE, DB_PORT: '3307', DB_LOG: 'true', UPLOAD_MAX_MB: '2' });
    expect(config.porta).toBe(3000);
    expect(config.db).toMatchObject({ host: 'localhost', porta: 3307, log: true, password: '' });
    expect(config.upload.maxByte).toBe(2 * 1024 * 1024);
    expect(config.livelloLog).toBe('debug');
    expect(config.stripe.attivo).toBe(false);
    expect(Object.isFrozen(config)).toBe(true);
  });

  test('toglie la barra finale dagli URL', () => {
    const config = carica({ ...BASE, FRONTEND_URL: 'https://sito.it/' });
    expect(config.urlFrontend).toBe('https://sito.it');
  });

  test('in produzione il log predefinito è info', () => {
    expect(carica({ ...BASE, NODE_ENV: 'production' }).livelloLog).toBe('info');
  });

  test('attiva le integrazioni solo con le credenziali complete', () => {
    const config = carica({ ...BASE, PAYPAL_CLIENT_ID: 'id', SMTP_HOST: 'smtp.it' });
    expect(config.paypal.attivo).toBe(false);
    expect(config.smtp.attivo).toBe(true);
  });

  test('con un provider di pagamento configurato pretende il segreto del webhook', () => {
    expect(() => carica({ ...BASE, STRIPE_SECRET_KEY: 'sk_test_x' })).toThrow(
      /STRIPE_WEBHOOK_SECRET è obbligatorio/,
    );
    expect(() =>
      carica({
        ...BASE,
        PAYPAL_CLIENT_ID: 'id',
        PAYPAL_CLIENT_SECRET: 'segreto',
        PAYPAL_WEBHOOK_ID: '',
      }),
    ).toThrow(/PAYPAL_WEBHOOK_ID non può essere vuoto/);
    const config = carica({
      ...BASE,
      STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
    });
    expect(config.stripe.attivo).toBe(true);
  });

  test('elenca in italiano tutte le variabili sbagliate', () => {
    expect(() =>
      carica({ ...BASE, DB_NAME: undefined, JWT_ACCESS_SECRET: 'corto', DB_PORT: 'abc' }),
    ).toThrow(
      /Configurazione non valida[\s\S]*DB_PORT deve essere un numero[\s\S]*DB_NAME è obbligatorio[\s\S]*JWT_ACCESS_SECRET deve avere almeno 32 caratteri/,
    );
  });

  test('rifiuta segreti JWT uguali tra loro', () => {
    expect(() => carica({ ...BASE, JWT_CHAT_SECRET: BASE.JWT_ACCESS_SECRET })).toThrow(
      /JWT_CHAT_SECRET contiene un valore non consentito/,
    );
  });
});
