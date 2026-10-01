// Crea il database indicato in .env e ci carica database/schema.sql.
//
//   npm run db:crea               crea il database (errore se esiste già)
//   npm run db:crea -- --reset    lo cancella e lo ricrea (vietato in produzione)
//
// Lo schema usa la sintassi DELIMITER dei client MySQL: qui viene diviso in
// istruzioni singole, eseguite una alla volta così un errore indica il punto
// esatto.

const fs = require('node:fs');
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

/**
 * Connessione al server indicato in .env, senza scegliere il database
 * (può non esistere ancora). Va chiusa con connessione.end().
 */
async function connetti() {
  require('dotenv').config({ quiet: true });
  const mysql = require('mysql2/promise');
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;

  if (!DB_NAME || !DB_USER) {
    throw new Error('DB_NAME e DB_USER sono obbligatori: controlla il file .env');
  }

  const connessione = await mysql.createConnection({
    host: DB_HOST || 'localhost',
    port: Number(DB_PORT) || 3306,
    user: DB_USER,
    password: DB_PASSWORD,
    timezone: 'Z',
  });
  return { connessione, DB_NAME };
}

async function creaDatabase({ reset = false } = {}) {
  require('dotenv').config({ quiet: true });
  if (reset && process.env.NODE_ENV === 'production') {
    throw new Error('--reset non è consentito con NODE_ENV=production: cancellerebbe tutti i dati');
  }

  const { connessione, DB_NAME } = await connetti();
  try {
    const nome = connessione.escapeId(DB_NAME);
    if (reset) {
      await connessione.query(`DROP DATABASE IF EXISTS ${nome}`);
    }
    try {
      await connessione.query(
        `CREATE DATABASE ${nome} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
    } catch (err) {
      if (err.code === 'ER_DB_CREATE_EXISTS') {
        throw new Error(
          `Il database "${DB_NAME}" esiste già. Usa "npm run db:crea -- --reset" per ricrearlo (cancella tutti i dati).`,
          { cause: err },
        );
      }
      throw err;
    }
    await connessione.query(`USE ${nome}`);

    const istruzioni = dividiIstruzioni(fs.readFileSync(FILE_SCHEMA, 'utf8'));
    for (const [indice, istruzione] of istruzioni.entries()) {
      try {
        await connessione.query(istruzione);
      } catch (err) {
        const suggerimento =
          err.errno === 1418
            ? '\nSuggerimento: il server ha il binary log attivo, imposta log_bin_trust_function_creators=1.'
            : '';
        throw new Error(
          `Istruzione ${indice + 1} di ${istruzioni.length} fallita: ${err.message}${suggerimento}\n\n${istruzione.slice(0, 300)}`,
          { cause: err },
        );
      }
    }
    return { database: DB_NAME, istruzioni: istruzioni.length };
  } finally {
    await connessione.end();
  }
}

if (require.main === module) {
  creaDatabase({ reset: process.argv.includes('--reset') })
    .then(({ database, istruzioni }) => {
      console.log(`Database "${database}" creato: ${istruzioni} istruzioni eseguite.`);
    })
    .catch((err) => {
      console.error(`Errore: ${err.message}`);
      process.exitCode = 1;
    });
}

module.exports = { FILE_SCHEMA, dividiIstruzioni, connetti, creaDatabase };
