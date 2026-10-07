// src/services/disponibilita.service.js
//
// Ricerca delle camere libere per il sito e blocco temporaneo della camera
// mentre il cliente completa il pagamento online.

const { sequelize } = require('../models');
const disponibilitaRepo = require('../repositories/disponibilita.repository');
const camereRepo = require('../repositories/camere.repository');
const impostazioni = require('./impostazioni.service');
const tariffe = require('./tariffe.service');
const camere = require('./camere.service');
const { richiestaNonValida, conflitto, ErroreApp } = require('../utils/errori');
const { oggi, aggiungiMinuti } = require('../utils/date');

function controllaDate(arrivo, partenza) {
  if (arrivo < oggi()) {
    throw richiestaNonValida('ARRIVO_NEL_PASSATO', 'La data di arrivo è già passata');
  }
  if (partenza <= arrivo) {
    throw richiestaNonValida('DATE_NON_VALIDE', "La partenza deve essere dopo l'arrivo");
  }
}

async function camereLibere(arrivo, partenza, ospiti, sessione = null, transaction = null) {
  return await disponibilitaRepo.trovaCamereLibere(arrivo, partenza, ospiti, sessione, transaction);
}

// Quante camere libere ci sono per ogni tipologia: Map(tipologia_id → numero).
function contaPerTipologia(libere) {
  const conteggio = new Map();
  for (const camera of libere) {
    conteggio.set(camera.tipologia_id, (conteggio.get(camera.tipologia_id) ?? 0) + 1);
  }
  return conteggio;
}

/**
 * Ricerca per il sito: una voce per ogni tipologia con camere libere e il suo
 * prezzo. Se una tipologia non è prenotabile (es. soggiorno minimo) resta in
 * elenco con il motivo, così il frontend può spiegarlo.
 */
async function cerca({
  arrivo,
  partenza,
  adulti,
  bambini = 0,
  etaBambini,
  sessione,
  utenteId,
  pianoId,
  lingua,
}) {
  controllaDate(arrivo, partenza);

  const [libere, tipologie] = await Promise.all([
    camereLibere(arrivo, partenza, adulti + bambini, sessione),
    camere.tipologiePubbliche(lingua),
  ]);
  const liberePerTipologia = contaPerTipologia(libere);

  const risultati = [];
  for (const tipologia of tipologie) {
    if (!liberePerTipologia.has(tipologia.id)) {
      continue;
    }

    const voce = {
      tipologia,
      camere_libere: liberePerTipologia.get(tipologia.id),
      preventivo: null,
      non_prenotabile: null,
    };
    try {
      voce.preventivo = await tariffe.preventivo({
        tipologiaId: tipologia.id,
        arrivo,
        partenza,
        adulti,
        bambini,
        etaBambini,
        pianoId,
        utenteId,
      });
    } catch (errore) {
      if (!(errore instanceof ErroreApp)) {
        throw errore;
      }
      voce.non_prenotabile = { codice: errore.codice, messaggio: errore.message };
    }
    risultati.push(voce);
  }

  return risultati;
}

/**
 * Tiene da parte una camera per la sessione di pagamento (un blocco per sessione).
 * Senza cameraId sceglie la prima camera libera della tipologia; con cameraId deve essere libera.
 * @returns {Promise<{ sessione: string, camera_id: number, scade_il: Date }>}
 */
async function blocca({
  sessione,
  cameraId,
  tipologiaId,
  arrivo,
  partenza,
  ospiti,
  utenteId,
  visitatoreId,
}) {
  controllaDate(arrivo, partenza);
  const minuti = await impostazioni.leggi('blocco_checkout_minuti', 15);

  return await sequelize.transaction(async (transaction) => {
    // anche la camera scelta dal sito deve essere libera per quelle date e quegli ospiti
    const libere = await camereLibere(arrivo, partenza, ospiti, sessione, transaction);
    const scelta = cameraId
      ? libere.find((camera) => camera.camera_id === Number(cameraId))
      : libere.find((camera) => camera.tipologia_id === Number(tipologiaId));
    if (!scelta) {
      throw conflitto(
        'CAMERA_NON_DISPONIBILE',
        cameraId
          ? 'La camera scelta non è libera per le date indicate'
          : 'Non ci sono più camere libere di questa tipologia per le date scelte',
      );
    }
    const idCamera = scelta.camera_id;

    // la riga della camera fa da lucchetto: due richieste simultanee si mettono in fila
    await camereRepo.bloccaCamera(idCamera, transaction);
    await disponibilitaRepo.eliminaBloccoDiSessione(sessione, transaction);
    const blocco = await disponibilitaRepo.creaBlocco(
      {
        camera_id: idCamera,
        data_arrivo: arrivo,
        data_partenza: partenza,
        sessione,
        utente_id: utenteId ?? null,
        visitatore_id: visitatoreId ?? null,
        scade_il: aggiungiMinuti(new Date(), minuti),
      },
      transaction,
    );

    return { sessione, camera_id: idCamera, scade_il: blocco.scade_il };
  });
}

/** Blocco ancora valido della sessione, altrimenti errore. */
async function bloccoDi(sessione, transaction = null) {
  const blocco = await disponibilitaRepo.trovaBloccoPerSessione(sessione, transaction);
  if (!blocco || blocco.scade_il < new Date()) {
    throw conflitto(
      'BLOCCO_SCADUTO',
      'Il tempo per completare la prenotazione è scaduto: ripeti la ricerca',
    );
  }
  return blocco;
}

async function rilascia(sessione, transaction = null) {
  await disponibilitaRepo.eliminaBloccoDiSessione(sessione, transaction);
}

/** Per il job di pulizia periodica. */
async function eliminaBlocchiScaduti() {
  return await disponibilitaRepo.eliminaBlocchiScaduti();
}

module.exports = {
  controllaDate,
  camereLibere,
  cerca,
  blocca,
  bloccoDi,
  rilascia,
  eliminaBlocchiScaduti,
};
