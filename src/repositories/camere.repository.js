// src/repositories/camere.repository.js
//
// Tipologie, camere fisiche, servizi (dotazioni ed extra) e situazione di oggi.

const { Op } = require('sequelize');
const {
  TipologiaCamera,
  Camera,
  Servizio,
  Media,
  Traduzione,
  Prenotazione,
  Ospite,
  DataBloccata,
  StatoCamera,
} = require('../models');
const { STATI_ATTIVI } = require('../constants/prenotazioni.constants');
const { oggi } = require('../utils/date');

const ordineMedia = [
  ['ordine', 'ASC'],
  ['id', 'ASC'],
];

// A pari ordine scelto dallo staff, dalla più piccola alla più grande
// (singola, doppia, tripla, suite), non in ordine alfabetico.
const ordineTipologie = [
  ['ordine', 'ASC'],
  ['ospiti_max', 'ASC'],
  ['prezzo_base', 'ASC'],
  ['nome', 'ASC'],
];

// ─────────────────────────────────────
// Tipologie
// ─────────────────────────────────────

// Area admin: tutte le tipologie con dotazioni e immagini.
const trovaTipologie = async (filtri = {}) => {
  const where = {};
  if (filtri.attiva !== undefined) {
    where.attiva = filtri.attiva;
  }

  return await TipologiaCamera.findAll({
    where,
    include: [
      { model: Servizio, as: 'servizi', through: { attributes: [] } },
      { model: Media, as: 'media', separate: true, order: ordineMedia },
    ],
    order: ordineTipologie,
  });
};

// Sito: solo le tipologie attive, con testi e dotazioni nella lingua richiesta.
// Per il sito: dotazioni attive, tradotte nella lingua richiesta.
const includeServiziPubblici = (lingua) => ({
  model: Servizio,
  as: 'servizi',
  where: { attivo: true },
  required: false,
  through: { attributes: [] },
  include: [{ model: Traduzione, as: 'traduzioni', where: { lingua }, required: false }],
});

const trovaTipologiePubbliche = async (lingua, filtri = {}) => {
  const where = { attiva: true };
  if (filtri.slug) {
    where.slug = filtri.slug;
  }

  return await TipologiaCamera.findAll({
    where,
    include: [
      includeServiziPubblici(lingua),
      { model: Media, as: 'media', separate: true, order: ordineMedia },
      { model: Traduzione, as: 'traduzioni', where: { lingua }, required: false },
    ],
    order: ordineTipologie,
  });
};

const trovaTipologiaPerId = async (id, transaction = null) => {
  return await TipologiaCamera.findByPk(id, {
    include: [
      { model: Servizio, as: 'servizi', through: { attributes: [] } },
      { model: Media, as: 'media', separate: true, order: ordineMedia },
    ],
    transaction,
  });
};

// Solo i dati della tipologia, senza dotazioni né immagini (per i preventivi).
const trovaTipologiaSemplice = async (id, soloAttiva = true) => {
  const where = soloAttiva ? { id, attiva: true } : { id };
  return await TipologiaCamera.findOne({ where });
};

// Anche tra le eliminate: lo slug resta occupato nell'indice univoco.
const trovaTipologiaPerSlug = async (slug) => {
  return await TipologiaCamera.findOne({ where: { slug }, paranoid: false });
};

const creaTipologia = async (dati, transaction = null) => {
  return await TipologiaCamera.create(dati, { transaction });
};

const aggiornaTipologia = async (id, dati, transaction = null) => {
  const tipologia = await TipologiaCamera.findByPk(id, { transaction });
  if (!tipologia) {
    return null;
  }
  return await tipologia.update(dati, { transaction });
};

// Sostituisce le dotazioni con il setter dell'associazione belongsToMany.
const impostaServiziTipologia = async (id, servizioIds, transaction = null) => {
  const tipologia = await TipologiaCamera.findByPk(id, { transaction });
  return await tipologia.setServizi(servizioIds, { transaction });
};

// Soft delete (paranoid).
const eliminaTipologia = async (id) => {
  return await TipologiaCamera.destroy({ where: { id } });
};

const contaCamereDiTipologia = async (tipologiaId) => {
  return await Camera.count({ where: { tipologia_id: tipologiaId } });
};

// ─────────────────────────────────────
// Camere
// ─────────────────────────────────────

const includeTipologia = {
  model: TipologiaCamera,
  as: 'tipologia',
  attributes: ['id', 'nome', 'slug', 'ospiti_max', 'prezzo_base'],
};

const trovaCamere = async (filtri = {}) => {
  const where = {};
  if (filtri.tipologia_id) {
    where.tipologia_id = filtri.tipologia_id;
  }
  if (filtri.stato) {
    where.stato = filtri.stato;
  }
  if (filtri.stato_pulizia) {
    where.stato_pulizia = filtri.stato_pulizia;
  }
  // !== undefined: il piano 0 (terra) è valido ma falsy
  if (filtri.piano !== undefined) {
    where.piano = filtri.piano;
  }

  return await Camera.findAll({
    where,
    include: [includeTipologia],
    order: [['numero', 'ASC']],
  });
};

// Per il sito: le camere di una tipologia ancora in uso, senza note interne né dati operativi.
const trovaCamerePubbliche = async (tipologiaId, lingua) => {
  return await Camera.findAll({
    where: { tipologia_id: tipologiaId, stato: { [Op.ne]: 'fuori_servizio' } },
    attributes: ['id', 'numero', 'nome', 'piano', 'ospiti_max', 'descrizione'],
    include: [
      { model: Media, as: 'media', separate: true, order: ordineMedia },
      { model: Traduzione, as: 'traduzioni', where: { lingua }, required: false },
    ],
    order: [['numero', 'ASC']],
  });
};

const trovaCameraPerId = async (id, transaction = null) => {
  return await Camera.findByPk(id, {
    include: [includeTipologia, { model: Media, as: 'media', separate: true, order: ordineMedia }],
    transaction,
  });
};

// Camera con la sua tipologia completa (es. per i controlli prima di cambiarla).
const trovaCameraConTipologia = async (id, transaction = null) => {
  return await Camera.findByPk(id, {
    include: [{ model: TipologiaCamera, as: 'tipologia' }],
    transaction,
  });
};

// Lucchetto sulla riga della camera: due prenotazioni simultanee si mettono in fila.
const bloccaCamera = async (id, transaction) => {
  return await Camera.findByPk(id, {
    attributes: ['id', 'tipologia_id'],
    lock: transaction.LOCK.UPDATE,
    transaction,
  });
};

const trovaCameraPerTokenIcal = async (token) => {
  return await Camera.findOne({ where: { token_ical: token } });
};

const creaCamera = async (dati, transaction = null) => {
  return await Camera.create(dati, { transaction });
};

const aggiornaCamera = async (id, dati, transaction = null) => {
  const camera = await Camera.findByPk(id, { transaction });
  if (!camera) {
    return null;
  }
  return await camera.update(dati, { transaction });
};

// Soft delete (paranoid).
const eliminaCamera = async (id) => {
  return await Camera.destroy({ where: { id } });
};

// Prenotazioni ancora da godere: una camera che le ha non si elimina.
const contaPrenotazioniFuture = async (cameraId) => {
  return await Prenotazione.count({
    where: {
      camera_id: cameraId,
      stato: { [Op.in]: STATI_ATTIVI },
      data_partenza: { [Op.gt]: oggi() },
    },
  });
};

// ─────────────────────────────────────
// Situazione e planning
// ─────────────────────────────────────

// Situazione di oggi (VIEW v_stato_camere) con l'ospite in casa.
const trovaStatoCamere = async () => {
  return await StatoCamera.findAll({
    include: [
      {
        model: Prenotazione,
        as: 'prenotazione_in_corso',
        attributes: ['id', 'codice', 'data_arrivo', 'data_partenza', 'adulti', 'bambini'],
        include: [{ model: Ospite, as: 'titolare', attributes: ['id', 'nome', 'cognome'] }],
      },
    ],
    order: [['numero', 'ASC']],
  });
};

// Planning della reception: ogni camera con prenotazioni e chiusure nel periodo [dal, al).
const trovaPlanning = async (dal, al) => {
  return await Camera.findAll({
    attributes: ['id', 'numero', 'nome', 'piano', 'stato', 'stato_pulizia'],
    include: [
      { model: TipologiaCamera, as: 'tipologia', attributes: ['id', 'nome'] },
      {
        model: Prenotazione,
        as: 'prenotazioni',
        attributes: ['id', 'codice', 'data_arrivo', 'data_partenza', 'stato', 'canale'],
        where: {
          stato: { [Op.in]: [...STATI_ATTIVI, 'conclusa'] },
          data_arrivo: { [Op.lt]: al },
          data_partenza: { [Op.gt]: dal },
        },
        required: false,
        include: [{ model: Ospite, as: 'titolare', attributes: ['id', 'nome', 'cognome'] }],
      },
      {
        model: DataBloccata,
        as: 'date_bloccate',
        attributes: ['id', 'data_inizio', 'data_fine', 'origine', 'motivo'],
        where: { data_inizio: { [Op.lt]: al }, data_fine: { [Op.gt]: dal } },
        required: false,
      },
    ],
    order: [['numero', 'ASC']],
  });
};

// ─────────────────────────────────────
// Servizi (dotazioni ed extra)
// ─────────────────────────────────────

const ordineServizi = [
  ['tipo', 'ASC'],
  ['ordine', 'ASC'],
  ['nome', 'ASC'],
];

const trovaServizi = async (filtri = {}) => {
  const where = {};
  if (filtri.tipo) {
    where.tipo = filtri.tipo;
  }
  if (filtri.attivo !== undefined) {
    where.attivo = filtri.attivo;
  }
  return await Servizio.findAll({ where, order: ordineServizi });
};

// Sito: extra acquistabili durante la prenotazione, tradotti.
const trovaExtraPubblici = async (lingua) => {
  return await Servizio.findAll({
    where: { tipo: 'extra', attivo: true },
    include: [
      { model: Media, as: 'media', separate: true, order: ordineMedia },
      { model: Traduzione, as: 'traduzioni', where: { lingua }, required: false },
    ],
    order: ordineServizi,
  });
};

const trovaServizioPerId = async (id) => {
  return await Servizio.findByPk(id, {
    include: [{ model: Media, as: 'media', separate: true, order: ordineMedia }],
  });
};

// Extra attivi richiesti con una prenotazione (per calcolarne il prezzo).
const trovaExtraPerIds = async (ids, transaction = null) => {
  return await Servizio.findAll({
    where: { id: { [Op.in]: ids }, tipo: 'extra', attivo: true },
    transaction,
  });
};

const creaServizio = async (dati) => {
  return await Servizio.create(dati);
};

const aggiornaServizio = async (id, dati) => {
  const servizio = await Servizio.findByPk(id);
  if (!servizio) {
    return null;
  }
  return await servizio.update(dati);
};

// Soft delete (paranoid): le prenotazioni passate continuano a vederlo.
const eliminaServizio = async (id) => {
  return await Servizio.destroy({ where: { id } });
};

module.exports = {
  trovaTipologie,
  trovaTipologiePubbliche,
  trovaTipologiaPerId,
  trovaTipologiaSemplice,
  trovaTipologiaPerSlug,
  creaTipologia,
  aggiornaTipologia,
  impostaServiziTipologia,
  eliminaTipologia,
  contaCamereDiTipologia,
  trovaCamere,
  trovaCamerePubbliche,
  trovaCameraPerId,
  trovaCameraConTipologia,
  bloccaCamera,
  trovaCameraPerTokenIcal,
  creaCamera,
  aggiornaCamera,
  eliminaCamera,
  contaPrenotazioniFuture,
  trovaStatoCamere,
  trovaPlanning,
  trovaServizi,
  trovaExtraPubblici,
  trovaServizioPerId,
  trovaExtraPerIds,
  creaServizio,
  aggiornaServizio,
  eliminaServizio,
};
