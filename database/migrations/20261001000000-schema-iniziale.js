// Schema iniziale: tutto database/schema.sql (tabelle, viste, trigger, funzioni,
// procedure e configurazione di ruoli, permessi, impostazioni...).
//
// Finché non esiste un'installazione in produzione si può modificare schema.sql
// e ripartire con npm run db:reset. Dopo, ogni modifica va in una nuova
// migrazione, così i dati esistenti non si perdono.

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { QueryTypes } = require('sequelize');
const config = require('../../src/config/env');
const { CARTELLE_UPLOAD } = require('../../src/constants/sistema.constants');
const { FILE_SCHEMA, dividiIstruzioni } = require('../schema');

// SequelizeMeta resta: è l'elenco delle migrazioni eseguite.
const OGGETTI_DATABASE = `
  SELECT TABLE_TYPE AS tipo, TABLE_NAME AS nome FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> 'SequelizeMeta'
  UNION ALL
  SELECT ROUTINE_TYPE, ROUTINE_NAME FROM information_schema.ROUTINES
  WHERE ROUTINE_SCHEMA = DATABASE()`;

const COMANDO_DROP = { VIEW: 'VIEW', FUNCTION: 'FUNCTION', PROCEDURE: 'PROCEDURE' };

/** Errore con il numero e l'inizio dell'istruzione fallita. */
function erroreIstruzione(err, indice, istruzioni) {
  const suggerimento =
    (err.parent?.errno ?? err.errno) === 1418
      ? '\nSuggerimento: il server ha il binary log attivo, imposta log_bin_trust_function_creators=1.'
      : '';
  return new Error(
    `Istruzione ${indice + 1} di ${istruzioni.length} fallita: ${err.message}${suggerimento}\n\n${istruzioni[indice].slice(0, 300)}`,
    { cause: err },
  );
}

/**
 * DROP per ogni tabella, vista, funzione e procedura (i trigger cadono con le tabelle).
 * @param {{ tipo: string, nome: string }[]} oggetti
 * @param {(nome: string) => string} quota
 */
function istruzioniDrop(oggetti, quota) {
  return oggetti.map(
    ({ tipo, nome }) => `DROP ${COMANDO_DROP[tipo] ?? 'TABLE'} IF EXISTS ${quota(nome)}`,
  );
}

/** Database nuovo: i file caricati prima sono orfani. Il resto di UPLOAD_DIR resta. */
async function svuotaUpload() {
  const radice = path.resolve(config.upload.cartella);
  await Promise.all(
    Object.values(CARTELLE_UPLOAD).map((cartella) =>
      fsp.rm(path.join(radice, cartella), { recursive: true, force: true }),
    ),
  );
}

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    const istruzioni = dividiIstruzioni(fs.readFileSync(FILE_SCHEMA, 'utf8'));
    // Una sola connessione: SET NAMES e time_zone di schema.sql valgono per quella.
    await sequelize.transaction(async (transaction) => {
      for (const [indice, istruzione] of istruzioni.entries()) {
        try {
          await sequelize.query(istruzione, { transaction });
        } catch (err) {
          throw erroreIstruzione(err, indice, istruzioni);
        }
      }
    });
    if (!config.produzione) {
      await svuotaUpload();
    }
  },

  async down(queryInterface) {
    const { sequelize } = queryInterface;
    // Una sola connessione: FOREIGN_KEY_CHECKS vale per quella, l'ordine dei DROP non conta.
    await sequelize.transaction(async (transaction) => {
      const oggetti = await sequelize.query(OGGETTI_DATABASE, {
        transaction,
        type: QueryTypes.SELECT,
      });
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
      for (const istruzione of istruzioniDrop(oggetti, (nome) =>
        queryInterface.quoteIdentifier(nome),
      )) {
        await sequelize.query(istruzione, { transaction });
      }
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
    });
  },
};
