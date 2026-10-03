// Configurazione di sequelize-cli (vedi .sequelizerc): migrazioni e seeders.
// Stessi dati di connessione dell'app (src/config/db.js), letti dal .env.

// Nei comandi del database nessuna email vera (i clienti di prova sono
// inventati) e nei log solo avvisi ed errori. Va impostato prima di env.js.
process.env.SMTP_HOST = '';
process.env.LOG_LEVEL = 'warn';

const config = require('./env');

// Cancellano dati: in produzione si va solo avanti con db:migrate e db:seed:all.
const COMANDI_DISTRUTTIVI = new Set([
  'db:drop',
  'db:migrate:undo',
  'db:migrate:undo:all',
  'db:seed:undo',
  'db:seed:undo:all',
]);

if (config.produzione && process.argv.some((arg) => COMANDI_DISTRUTTIVI.has(arg))) {
  throw new Error('Comando non consentito con NODE_ENV=production: cancellerebbe i dati');
}

const connessione = {
  username: config.db.utente,
  password: config.db.password,
  database: config.db.nome,
  host: config.db.host,
  port: config.db.porta,
  dialect: 'mysql',
  timezone: '+00:00',
  logging: false,
};

module.exports = {
  development: connessione,
  test: connessione,
  production: connessione,
};
