// Connessione Sequelize. Il driver mysql2 funziona sia con MySQL sia con MariaDB.
// Le date sono salvate in UTC: la conversione al fuso della struttura si fa
// solo in uscita (email, PDF, frontend).

const { Sequelize } = require('sequelize');
const config = require('./env');
const logger = require('./logger');

const sequelize = new Sequelize(config.db.nome, config.db.utente, config.db.password, {
  host: config.db.host,
  port: config.db.porta,
  dialect: 'mysql',
  timezone: '+00:00',
  // DECIMAL come numeri JS: i calcoli di denaro si fanno in centesimi interi
  dialectOptions: { decimalNumbers: true },
  logging: config.db.log ? (sql) => logger.debug(sql) : false,
  pool: { max: config.db.poolMax, min: 0, acquire: 30000, idle: 10000 },
  define: {
    freezeTableName: true,
    underscored: true,
    createdAt: 'creato_il',
    updatedAt: 'aggiornato_il',
    deletedAt: 'eliminato_il',
  },
});

/**
 * Esegue fn in una transazione, dopo aver comunicato al database chi sta
 * operando: i trigger di audit leggono @id_utente e @ip e li scrivono in
 * registro_attivita. Tutte le scritture sulle tabelle sotto audit
 * (prenotazioni, pagamenti, fatture) devono passare da qui.
 *
 * @template T
 * @param {{ utenteId?: number|null, ip?: string|null }} contesto
 * @param {(t: import('sequelize').Transaction) => Promise<T>} fn
 * @returns {Promise<T>}
 */
function transazione(contesto, fn) {
  return sequelize.transaction(async (t) => {
    await sequelize.query('SET @id_utente = ?, @ip = ?', {
      replacements: [contesto?.utenteId ?? null, contesto?.ip ?? null],
      transaction: t,
    });
    try {
      return await fn(t);
    } finally {
      // la connessione torna nel pool: non deve portarsi dietro l'utente
      await sequelize
        .query('SET @id_utente = NULL, @ip = NULL', { transaction: t })
        .catch((err) =>
          logger.warn('Reset variabili di audit non riuscito', { errore: err.message }),
        );
    }
  });
}

module.exports = { sequelize, transazione };
