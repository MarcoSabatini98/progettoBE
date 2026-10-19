const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cartellaUpload = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-'));
process.env.UPLOAD_DIR = cartellaUpload;
process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

const { FILE_SCHEMA, dividiIstruzioni } = require('../../../database/schema');
const migrazione = require('../../../database/migrations/20261001000000-schema-iniziale');

/** queryInterface finto: query registra l'SQL, risultato e fallimento a scelta. */
function finto({ righe = [], fallisceAl } = {}) {
  const eseguite = [];
  const sequelize = {
    transaction: (fn) => fn('t'),
    query: jest.fn((sql, opzioni) => {
      expect(opzioni.transaction).toBe('t');
      eseguite.push(sql);
      if (eseguite.length === fallisceAl) {
        return Promise.reject(Object.assign(new Error('rotta'), { parent: { errno: 1418 } }));
      }
      return Promise.resolve(opzioni.type ? righe : []);
    }),
  };
  return { eseguite, queryInterface: { sequelize, quoteIdentifier: (nome) => `\`${nome}\`` } };
}

afterAll(() => fs.rmSync(cartellaUpload, { recursive: true, force: true }));

test('up esegue schema.sql in ordine e svuota i file caricati, non il resto', async () => {
  fs.mkdirSync(path.join(cartellaUpload, 'media', 'x'), { recursive: true });
  fs.mkdirSync(path.join(cartellaUpload, 'stock'));
  const { eseguite, queryInterface } = finto();

  await migrazione.up(queryInterface);

  expect(eseguite).toEqual(dividiIstruzioni(fs.readFileSync(FILE_SCHEMA, 'utf8')));
  expect(fs.readdirSync(cartellaUpload)).toEqual(['stock']);
});

test("up indica l'istruzione fallita e il rimedio per il binary log", async () => {
  const { queryInterface } = finto({ fallisceAl: 2 });

  await expect(migrazione.up(queryInterface)).rejects.toThrow(
    /^Istruzione 2 di \d+ fallita: rotta\nSuggerimento: .*log_bin_trust_function_creators/,
  );
});

test('down elimina tabelle, viste e routine senza i vincoli delle chiavi esterne', async () => {
  const righe = [
    { tipo: 'BASE TABLE', nome: 'utenti' },
    { tipo: 'VIEW', nome: 'v_occupazione' },
    { tipo: 'FUNCTION', nome: 'prezzo_notte' },
    { tipo: 'PROCEDURE', nome: 'chiudi_giornata' },
  ];
  const { eseguite, queryInterface } = finto({ righe });

  await migrazione.down(queryInterface);

  expect(eseguite[0]).toMatch(/TABLE_NAME <> 'SequelizeMeta'/);
  expect(eseguite.slice(1)).toEqual([
    'SET FOREIGN_KEY_CHECKS = 0',
    'DROP TABLE IF EXISTS `utenti`',
    'DROP VIEW IF EXISTS `v_occupazione`',
    'DROP FUNCTION IF EXISTS `prezzo_notte`',
    'DROP PROCEDURE IF EXISTS `chiudi_giornata`',
    'SET FOREIGN_KEY_CHECKS = 1',
  ]);
});
