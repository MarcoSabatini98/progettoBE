process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

const fs = require('node:fs');
const { FILE_SCHEMA, dividiIstruzioni } = require('../../../database/crea-database');
const { tabelleConDatiIniziali } = require('../../../database/reset-database');

test('tiene le tabelle che schema.sql riempie, non quelle scritte dai trigger', () => {
  const istruzioni = dividiIstruzioni(fs.readFileSync(FILE_SCHEMA, 'utf8'));

  expect([...tabelleConDatiIniziali(istruzioni)].sort()).toEqual([
    'impostazioni',
    'livelli_fedelta',
    'permessi',
    'regole_chat',
    'ruoli',
    'ruoli_permessi',
  ]);
});

test('riconosce i nomi tra backtick', () => {
  expect(tabelleConDatiIniziali(['INSERT INTO `faq` (domanda) VALUES (1)', 'SELECT 1'])).toEqual(
    new Set(['faq']),
  );
});
