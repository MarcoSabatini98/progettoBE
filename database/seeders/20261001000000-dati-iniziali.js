// Dati iniziali: quelli di base (seed-base.js) sempre, quelli di prova
// (seed-prova.js) solo fuori produzione. Si può rilanciare: ciò che esiste
// già non viene ricreato.

const modelli = require('../../src/models');
const config = require('../../src/config/env');
const { seedBase } = require('../seed-base');
const { seedProva, PASSWORD_PROVA } = require('../seed-prova');

async function datiDiProva() {
  const esito = await seedProva();
  if (!esito) {
    console.log('Dati di prova già presenti: per ricominciare usa npm run db:reset');
    return;
  }
  console.log(
    `Dati di prova creati: ${esito.staff} staff, ${esito.clienti} clienti, ` +
      `${esito.camere} camere, ${esito.prenotazioni} prenotazioni.`,
  );
  console.log(`Password di tutti gli account di prova: ${PASSWORD_PROVA}`);
}

module.exports = {
  async up() {
    try {
      for (const [voce, valore] of Object.entries(await seedBase())) {
        console.log(`${voce}: ${valore}`);
      }
      if (!config.produzione) {
        await datiDiProva();
      }
    } catch (err) {
      if (err.dettagli) {
        console.error(JSON.stringify(err.dettagli, null, 2));
      }
      throw err;
    } finally {
      // I service usano la connessione dell'app, non quella di sequelize-cli:
      // aperta, terrebbe in attesa il comando.
      await modelli.sequelize.close();
    }
  },

  // Niente da annullare qui: i dati si tolgono con npm run migrate:reset o db:reset.
  async down() {},
};
