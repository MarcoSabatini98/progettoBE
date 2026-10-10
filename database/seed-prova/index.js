// Dati di prova: la struttura come la vedrebbe un cliente che usa l'app da
// due anni. Persone, catalogo, contenuti tradotti, soggiorni passati, in
// corso e futuri, amministrazione e operatività di oggi.

const modelli = require('../../src/models');
const utentiRepo = require('../../src/repositories/utenti.repository');
const { PASSWORD_PROVA, contesto } = require('./comune');
const {
  impostaStruttura,
  creaDocumentiLegali,
  creaContenuti,
  creaChiusure,
} = require('./contenuti');
const { SENTINELLA, creaPersone } = require('./persone');
const { creaCatalogo } = require('./catalogo');
const { creaStorico } = require('./storico');
const { creaPrenotazioni } = require('./prenotazioni');
const { creaAmministrazione } = require('./amministrazione');
const { creaOperativita } = require('./operativita');

async function seedProva() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Il seed di prova non si usa in produzione');
  }
  if (await utentiRepo.esisteEmail(SENTINELLA)) {
    return null;
  }

  const admin = await modelli.Utente.findOne({ where: { ruolo: 'admin' } });
  if (!admin) {
    throw new Error(
      'Nessun amministratore: imposta SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD nel file .env',
    );
  }

  const ctxAdmin = contesto(admin);
  const struttura = await impostaStruttura(ctxAdmin);
  await creaDocumentiLegali(ctxAdmin, struttura);
  const persone = await creaPersone(ctxAdmin);
  const ctx = contesto(persone.staff.reception);
  const catalogo = await creaCatalogo(ctx, ctxAdmin);
  await creaContenuti(ctx, ctxAdmin);
  await creaChiusure(ctx, catalogo.camere);
  const prenotazioni = {
    ...(await creaStorico(catalogo, persone)),
    ...(await creaPrenotazioni(catalogo, persone)),
  };
  await creaAmministrazione(prenotazioni, persone, ctxAdmin);
  await creaOperativita(prenotazioni, persone, catalogo, admin);

  return {
    staff: Object.keys(persone.staff).length,
    clienti: Object.keys(persone.clienti).length,
    camere: Object.keys(catalogo.camere).length,
    prenotazioni: Object.keys(prenotazioni).length,
  };
}

module.exports = { PASSWORD_PROVA, seedProva };
