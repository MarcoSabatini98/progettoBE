// Ricerca camere libere e blocco temporaneo durante il pagamento online.
// La logica di "libera" sta nel DB (fn_camera_libera, sp_disponibilita).

const { Op } = require('sequelize');
const { Camera, BloccoTemporaneo, sequelize } = require('../models');
const { richiestaNonValida, conflitto, ErroreApp } = require('../utils/errori');
const { oggi, aggiungiMinuti } = require('../utils/date');
const { chiama } = require('./sql');
const impostazioni = require('./impostazioni.service');
const tariffe = require('./tariffe.service');
const camere = require('./camere.service');

function controllaDate(arrivo, partenza) {
  if (arrivo < oggi())
    throw richiestaNonValida('ARRIVO_NEL_PASSATO', 'La data di arrivo è già passata');
  if (partenza <= arrivo)
    throw richiestaNonValida('DATE_NON_VALIDE', 'La partenza deve essere dopo l’arrivo');
}

/** Camere libere (righe di sp_disponibilita). */
const camereLibere = (arrivo, partenza, ospiti, sessione, transaction) =>
  chiama(
    'CALL sp_disponibilita(?, ?, ?, ?)',
    [arrivo, partenza, ospiti, sessione ?? null],
    transaction,
  );

/**
 * Ricerca per il sito: una voce per tipologia con camere libere e prezzo.
 * Se una tipologia non è prenotabile (es. soggiorno minimo) resta in elenco
 * con il motivo, così il frontend può spiegarlo.
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

  const perTipologia = new Map();
  for (const c of libere)
    perTipologia.set(c.tipologia_id, (perTipologia.get(c.tipologia_id) ?? 0) + 1);

  const risultati = [];
  for (const tipologia of tipologie.filter((t) => perTipologia.has(t.id))) {
    const voce = {
      tipologia,
      camere_libere: perTipologia.get(tipologia.id),
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
    } catch (err) {
      if (!(err instanceof ErroreApp)) throw err;
      voce.non_prenotabile = { codice: err.codice, messaggio: err.message };
    }
    risultati.push(voce);
  }
  return risultati;
}

/**
 * Blocca una camera per la sessione di pagamento (una sola per sessione).
 * Con tipologiaId sceglie la prima camera libera di quella tipologia.
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

  return sequelize.transaction(async (t) => {
    let id = cameraId;
    if (!id) {
      const libere = await camereLibere(arrivo, partenza, ospiti, sessione, t);
      id = libere.find((c) => c.tipologia_id === Number(tipologiaId))?.camera_id;
      if (!id)
        throw conflitto(
          'CAMERA_NON_DISPONIBILE',
          'Non ci sono più camere libere di questa tipologia per le date scelte',
        );
    }
    // la riga della camera fa da lucchetto: due richieste simultanee si mettono in fila
    await Camera.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE, attributes: ['id'] });
    await BloccoTemporaneo.destroy({ where: { sessione }, transaction: t });
    const blocco = await BloccoTemporaneo.create(
      {
        camera_id: id,
        data_arrivo: arrivo,
        data_partenza: partenza,
        sessione,
        utente_id: utenteId ?? null,
        visitatore_id: visitatoreId ?? null,
        scade_il: aggiungiMinuti(new Date(), minuti),
      },
      { transaction: t },
    );
    return { sessione, camera_id: id, scade_il: blocco.scade_il };
  });
}

/** Blocco valido della sessione, o errore se è scaduto. */
async function bloccoDi(sessione, transaction) {
  const blocco = await BloccoTemporaneo.findOne({ where: { sessione }, transaction });
  if (!blocco || blocco.scade_il < new Date()) {
    throw conflitto(
      'BLOCCO_SCADUTO',
      'Il tempo per completare la prenotazione è scaduto: ripeti la ricerca',
    );
  }
  return blocco;
}

const rilascia = (sessione, transaction) =>
  BloccoTemporaneo.destroy({ where: { sessione }, transaction });

/** Per il job di pulizia. */
const eliminaBlocchiScaduti = () =>
  BloccoTemporaneo.destroy({ where: { scade_il: { [Op.lt]: new Date() } } });

module.exports = {
  cerca,
  camereLibere,
  blocca,
  bloccoDi,
  rilascia,
  eliminaBlocchiScaduti,
  controllaDate,
};
