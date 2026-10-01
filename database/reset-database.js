// Riporta il database allo stato di partenza. Solo per sviluppo: vietato in produzione.
//
//   npm run db:reset        ricrea l'intero database da schema.sql
//   npm run db:reset:seed   svuota solo i dati: tabelle, trigger e la configurazione
//                           che schema.sql inserisce (ruoli, permessi, impostazioni...)
//                           restano com'erano
//
// In entrambi i casi svuota anche le cartelle dei file caricati (CARTELLE_UPLOAD),
// che senza database resterebbero orfane, poi rilancia db:seed e db:seed:prova.

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const config = require('../src/config/env');
const { CARTELLE_UPLOAD } = require('../src/constants/sistema.constants');
const { FILE_SCHEMA, dividiIstruzioni, connetti, creaDatabase } = require('./crea-database');

const INSERIMENTO = /^INSERT\s+INTO\s+`?(\w+)`?/i;

/**
 * Tabelle che schema.sql riempie da sé: il reset dei soli dati le lascia stare.
 * @param {string[]} istruzioni
 * @returns {Set<string>}
 */
function tabelleConDatiIniziali(istruzioni) {
  return new Set(istruzioni.map((sql) => INSERIMENTO.exec(sql)?.[1]).filter(Boolean));
}

/** Svuota tutte le tabelle tranne quelle con i dati di schema.sql. */
async function svuotaTabelle() {
  const daTenere = tabelleConDatiIniziali(dividiIstruzioni(fs.readFileSync(FILE_SCHEMA, 'utf8')));
  const { connessione, DB_NAME } = await connetti();
  try {
    await connessione.query(`USE ${connessione.escapeId(DB_NAME)}`);
    const [righe] = await connessione.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    const tabelle = righe.map((riga) => Object.values(riga)[0]).filter((t) => !daTenere.has(t));
    // Vale solo per questa connessione: l'ordine dei TRUNCATE non conta.
    await connessione.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const tabella of tabelle) {
      await connessione.query(`TRUNCATE TABLE ${connessione.escapeId(tabella)}`);
    }
    return tabelle.length;
  } finally {
    await connessione.end();
  }
}

/** Cancella le sottocartelle dei file generati dall'app; il resto di UPLOAD_DIR resta. */
async function svuotaUpload() {
  const radice = path.resolve(config.upload.cartella);
  const cartelle = Object.values(CARTELLE_UPLOAD);
  await Promise.all(
    cartelle.map((cartella) =>
      fsp.rm(path.join(radice, cartella), { recursive: true, force: true }),
    ),
  );
  return cartelle;
}

async function resetDatabase({ tutto = false } = {}) {
  if (config.produzione) {
    throw new Error(
      'Il reset non è consentito con NODE_ENV=production: cancellerebbe tutti i dati',
    );
  }
  const database = tutto
    ? `ricreato (${(await creaDatabase({ reset: true })).istruzioni} istruzioni)`
    : `${await svuotaTabelle()} tabelle svuotate`;
  const cartelle = await svuotaUpload();
  return { Database: database, 'File caricati': `svuotati (${cartelle.join(', ')})` };
}

if (require.main === module) {
  resetDatabase({ tutto: process.argv.includes('--tutto') })
    .then((esito) => {
      for (const [voce, valore] of Object.entries(esito)) {
        console.log(`${voce}: ${valore}`);
      }
    })
    .catch((err) => {
      console.error(`Errore: ${err.message}`);
      process.exitCode = 1;
    });
}

module.exports = { tabelleConDatiIniziali, resetDatabase };
