const FILE = '../../../src/config/sequelize.config';

/** Carica la configurazione con env finto e gli argomenti dati a sequelize-cli. */
function carica({ produzione, argomenti }) {
  const argv = process.argv;
  process.argv = ['node', 'sequelize-cli', ...argomenti];
  try {
    let configurazione;
    jest.isolateModules(() => {
      jest.doMock('../../../src/config/env', () => ({
        produzione,
        db: { nome: 'hotel', utente: 'u', password: 'p', host: 'h', porta: 3306 },
      }));
      configurazione = require(FILE);
    });
    return configurazione;
  } finally {
    process.argv = argv;
  }
}

const ambiente = { ...process.env };
afterEach(() => {
  process.env = { ...ambiente };
});

test('usa la connessione del .env per ogni ambiente e spegne le email', () => {
  const configurazione = carica({ produzione: false, argomenti: ['db:drop'] });

  expect(configurazione.development).toMatchObject({ database: 'hotel', dialect: 'mysql' });
  expect(configurazione.production).toBe(configurazione.development);
  expect(process.env.SMTP_HOST).toBe('');
});

test('in produzione blocca i comandi che cancellano dati', () => {
  expect(() => carica({ produzione: true, argomenti: ['db:drop'] })).toThrow(/production/);
  expect(() => carica({ produzione: true, argomenti: ['db:migrate:undo:all'] })).toThrow(
    /production/,
  );
});

test('in produzione lascia migrare e seminare', () => {
  expect(() => carica({ produzione: true, argomenti: ['db:migrate'] })).not.toThrow();
  expect(() => carica({ produzione: true, argomenti: ['db:seed:all'] })).not.toThrow();
});
