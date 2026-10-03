// Divide database/schema.sql in istruzioni singole per la migrazione iniziale
// (database/migrations). Lo schema usa la sintassi DELIMITER dei client MySQL,
// che il server non conosce; eseguendo un'istruzione alla volta, un errore
// indica anche il punto esatto.

const path = require('node:path');

const FILE_SCHEMA = path.join(__dirname, 'schema.sql');

/**
 * Divide uno script SQL in istruzioni, gestendo DELIMITER, stringhe e commenti.
 * I commenti vengono scartati.
 * @param {string} sql
 * @returns {string[]}
 */
function dividiIstruzioni(sql) {
  const istruzioni = [];
  const comandoDelimiter = /[ \t]*DELIMITER[ \t]+(\S+)[^\n]*(?:\n|$)/iy;
  let delimitatore = ';';
  let corrente = '';
  let virgolette = null;
  let i = 0;

  const chiudi = () => {
    const testo = corrente.trim();
    if (testo) {
      istruzioni.push(testo);
    }
    corrente = '';
  };

  while (i < sql.length) {
    const c = sql[i];

    if (virgolette) {
      corrente += c;
      if (c === '\\' && i + 1 < sql.length) {
        corrente += sql[i + 1];
        i += 2;
        continue;
      }
      if (c === virgolette) {
        virgolette = null;
      }
      i++;
      continue;
    }

    if (i === 0 || sql[i - 1] === '\n') {
      comandoDelimiter.lastIndex = i;
      const trovato = comandoDelimiter.exec(sql);
      if (trovato) {
        chiudi();
        delimitatore = trovato[1];
        i = comandoDelimiter.lastIndex;
        continue;
      }
    }

    if ((c === '-' && sql[i + 1] === '-' && /\s/.test(sql[i + 2] ?? '\n')) || c === '#') {
      const fineRiga = sql.indexOf('\n', i);
      i = fineRiga === -1 ? sql.length : fineRiga;
      continue;
    }

    if (c === '/' && sql[i + 1] === '*') {
      const fine = sql.indexOf('*/', i + 2);
      i = fine === -1 ? sql.length : fine + 2;
      continue;
    }

    if (sql.startsWith(delimitatore, i)) {
      chiudi();
      i += delimitatore.length;
      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      virgolette = c;
    }
    corrente += c;
    i++;
  }

  chiudi();
  return istruzioni;
}

module.exports = { FILE_SCHEMA, dividiIstruzioni };
