// src/repositories/tariffe.repository.js
//
// Piani tariffari, periodi (stagioni), promozioni, codici sconto, pacchetti
// e tassa di soggiorno.

const { Op } = require('sequelize');
const {
  PianoTariffario,
  PeriodoTariffario,
  Promozione,
  CodiceSconto,
  Pacchetto,
  PacchettoServizio,
  Servizio,
  TassaSoggiorno,
  TipologiaCamera,
  Traduzione,
  Media,
  Prenotazione,
  Utente,
} = require('../models');

const includeAutore = { model: Utente, as: 'autore', attributes: ['id', 'nome', 'cognome'] };
const includeTipologia = {
  model: TipologiaCamera,
  as: 'tipologia',
  attributes: ['id', 'nome', 'slug'],
};

// Promozioni prenotabili nel giorno indicato (finestra prenotabile_dal / _al).
const prenotabiliIl = (giorno) => [
  { [Op.or]: [{ prenotabile_dal: null }, { prenotabile_dal: { [Op.lte]: giorno } }] },
  { [Op.or]: [{ prenotabile_al: null }, { prenotabile_al: { [Op.gte]: giorno } }] },
];

// ─────────────────────────────────────
// Piani tariffari (es. "Non rimborsabile -10%", "Flessibile")
// ─────────────────────────────────────

const trovaPiani = async (filtri = {}) => {
  const where = {};
  if (filtri.attivo !== undefined) {
    where.attivo = filtri.attivo;
  }
  return await PianoTariffario.findAll({
    where,
    order: [
      ['ordine', 'ASC'],
      ['nome', 'ASC'],
    ],
  });
};

const trovaPianoPerId = async (id, transaction = null) => {
  return await PianoTariffario.findByPk(id, { transaction });
};

const trovaPianoAttivo = async (id) => {
  return await PianoTariffario.findOne({ where: { id, attivo: true } });
};

const trovaPianoPredefinito = async () => {
  return await PianoTariffario.findOne({ where: { predefinito: true, attivo: true } });
};

const creaPiano = async (dati, transaction = null) => {
  return await PianoTariffario.create(dati, { transaction });
};

const aggiornaPiano = async (id, dati, transaction = null) => {
  const piano = await PianoTariffario.findByPk(id, { transaction });
  if (!piano) {
    return null;
  }
  return await piano.update(dati, { transaction });
};

// Il predefinito è uno solo: prima di impostarne uno si toglie il flag agli altri.
const togliPredefinito = async (transaction = null) => {
  return await PianoTariffario.update(
    { predefinito: false },
    { where: { predefinito: true }, transaction },
  );
};

const eliminaPiano = async (id) => {
  return await PianoTariffario.destroy({ where: { id } });
};

const contaPrenotazioniConPiano = async (pianoId) => {
  return await Prenotazione.count({ where: { piano_tariffario_id: pianoId } });
};

// ─────────────────────────────────────
// Periodi tariffari (stagioni, weekend, eventi)
// ─────────────────────────────────────

const trovaPeriodi = async (filtri = {}) => {
  const where = {};
  if (filtri.tipologia_id) {
    where.tipologia_id = filtri.tipologia_id;
  }
  if (filtri.attivo !== undefined) {
    where.attivo = filtri.attivo;
  }
  // periodi che toccano [dal, al]
  if (filtri.dal) {
    where.data_fine = { [Op.gte]: filtri.dal };
  }
  if (filtri.al) {
    where.data_inizio = { [Op.lte]: filtri.al };
  }
  return await PeriodoTariffario.findAll({
    where,
    include: [includeTipologia],
    order: [
      ['data_inizio', 'ASC'],
      ['priorita', 'DESC'],
    ],
  });
};

// Periodi attivi che toccano il soggiorno: generici o della tipologia.
const trovaPeriodiDelSoggiorno = async (tipologiaId, arrivo, partenza) => {
  return await PeriodoTariffario.findAll({
    where: {
      attivo: true,
      data_inizio: { [Op.lt]: partenza },
      data_fine: { [Op.gte]: arrivo },
      [Op.or]: [{ tipologia_id: null }, { tipologia_id: tipologiaId }],
    },
    raw: true,
  });
};

const trovaPeriodoPerId = async (id) => {
  return await PeriodoTariffario.findByPk(id, {
    include: [
      includeTipologia,
      includeAutore,
      { model: Utente, as: 'modificatore', attributes: ['id', 'nome', 'cognome'] },
    ],
  });
};

const creaPeriodo = async (dati) => {
  return await PeriodoTariffario.create(dati);
};

const aggiornaPeriodo = async (id, dati) => {
  const periodo = await PeriodoTariffario.findByPk(id);
  if (!periodo) {
    return null;
  }
  return await periodo.update(dati);
};

const eliminaPeriodo = async (id) => {
  return await PeriodoTariffario.destroy({ where: { id } });
};

// ─────────────────────────────────────
// Promozioni
// ─────────────────────────────────────

const trovaPromozioni = async (filtri = {}) => {
  const where = {};
  if (filtri.attiva !== undefined) {
    where.attiva = filtri.attiva;
  }
  if (filtri.tipologia_id) {
    where.tipologia_id = filtri.tipologia_id;
  }
  return await Promozione.findAll({
    where,
    include: [includeTipologia],
    order: [['soggiorno_dal', 'DESC']],
  });
};

// Promozioni che toccano il soggiorno e sono prenotabili oggi.
const trovaPromozioniDelSoggiorno = async (arrivo, partenza, giorno) => {
  return await Promozione.findAll({
    where: {
      attiva: true,
      soggiorno_dal: { [Op.lt]: partenza },
      soggiorno_al: { [Op.gte]: arrivo },
      [Op.and]: prenotabiliIl(giorno),
    },
    raw: true,
  });
};

// Sito: promozioni ancora in corso e prenotabili oggi, tradotte.
const trovaPromozioniPubbliche = async (giorno, lingua) => {
  return await Promozione.findAll({
    where: {
      attiva: true,
      soggiorno_al: { [Op.gte]: giorno },
      [Op.and]: prenotabiliIl(giorno),
    },
    include: [
      includeTipologia,
      { model: Traduzione, as: 'traduzioni', where: { lingua }, required: false },
    ],
    order: [['soggiorno_dal', 'ASC']],
  });
};

const trovaPromozionePerId = async (id) => {
  return await Promozione.findByPk(id, { include: [includeTipologia, includeAutore] });
};

const creaPromozione = async (dati) => {
  return await Promozione.create(dati);
};

const aggiornaPromozione = async (id, dati) => {
  const promozione = await Promozione.findByPk(id);
  if (!promozione) {
    return null;
  }
  return await promozione.update(dati);
};

const eliminaPromozione = async (id) => {
  return await Promozione.destroy({ where: { id } });
};

// ─────────────────────────────────────
// Codici sconto
// ─────────────────────────────────────

const trovaCodiciSconto = async (filtri = {}) => {
  const where = {};
  if (filtri.attivo !== undefined) {
    where.attivo = filtri.attivo;
  }
  if (filtri.cerca) {
    where.codice = { [Op.like]: `%${filtri.cerca}%` };
  }
  return await CodiceSconto.findAll({ where, order: [['creato_il', 'DESC']] });
};

const trovaCodiceScontoPerId = async (id) => {
  return await CodiceSconto.findByPk(id, { include: [includeAutore] });
};

const trovaCodiceScontoAttivo = async (codice) => {
  return await CodiceSconto.findOne({ where: { codice, attivo: true } });
};

// Quante prenotazioni non cancellate di un utente hanno usato il codice.
const contaUtilizziUtente = async (codiceScontoId, utenteId) => {
  return await Prenotazione.count({
    where: {
      codice_sconto_id: codiceScontoId,
      utente_id: utenteId,
      stato: { [Op.ne]: 'cancellata' },
    },
  });
};

const creaCodiceSconto = async (dati) => {
  return await CodiceSconto.create(dati);
};

const aggiornaCodiceSconto = async (id, dati) => {
  const codice = await CodiceSconto.findByPk(id);
  if (!codice) {
    return null;
  }
  return await codice.update(dati);
};

const eliminaCodiceSconto = async (id) => {
  return await CodiceSconto.destroy({ where: { id } });
};

// ─────────────────────────────────────
// Pacchetti (soggiorno + servizi inclusi a prezzo fisso)
// ─────────────────────────────────────

const includeServiziPacchetto = {
  model: Servizio,
  as: 'servizi',
  through: { attributes: ['quantita'] },
};

// Foto in ordine di galleria: la prima è la copertina.
const includeMediaPacchetto = {
  model: Media,
  as: 'media',
  separate: true,
  order: [
    ['ordine', 'ASC'],
    ['id', 'ASC'],
  ],
};

const trovaPacchetti = async (filtri = {}) => {
  const where = {};
  if (filtri.attivo !== undefined) {
    where.attivo = filtri.attivo;
  }
  return await Pacchetto.findAll({
    where,
    include: [includeTipologia, includeServiziPacchetto, includeMediaPacchetto],
    order: [
      ['ordine', 'ASC'],
      ['nome', 'ASC'],
    ],
  });
};

// Sito: pacchetti attivi non ancora scaduti, tradotti, con immagini.
const trovaPacchettiPubblici = async (giorno, lingua) => {
  return await Pacchetto.findAll({
    where: {
      attivo: true,
      [Op.or]: [{ valido_al: null }, { valido_al: { [Op.gte]: giorno } }],
    },
    include: [
      includeTipologia,
      {
        ...includeServiziPacchetto,
        include: [{ model: Traduzione, as: 'traduzioni', where: { lingua }, required: false }],
      },
      includeMediaPacchetto,
      { model: Traduzione, as: 'traduzioni', where: { lingua }, required: false },
    ],
    order: [['ordine', 'ASC']],
  });
};

const trovaPacchettoPerId = async (id, transaction = null) => {
  return await Pacchetto.findByPk(id, {
    include: [includeTipologia, includeServiziPacchetto, includeMediaPacchetto],
    transaction,
  });
};

const trovaPacchettoAttivo = async (id) => {
  return await Pacchetto.findOne({ where: { id, attivo: true } });
};

const creaPacchetto = async (dati, transaction = null) => {
  return await Pacchetto.create(dati, { transaction });
};

const aggiornaPacchetto = async (id, dati, transaction = null) => {
  const pacchetto = await Pacchetto.findByPk(id, { transaction });
  if (!pacchetto) {
    return null;
  }
  return await pacchetto.update(dati, { transaction });
};

// Servizi inclusi: [{ servizio_id, quantita }]. La tabella ponte ha la quantità,
// quindi si riscrive per intero.
const impostaServiziPacchetto = async (pacchettoId, servizi, transaction = null) => {
  await PacchettoServizio.destroy({ where: { pacchetto_id: pacchettoId }, transaction });
  return await PacchettoServizio.bulkCreate(
    servizi.map((servizio) => ({
      pacchetto_id: pacchettoId,
      servizio_id: servizio.servizio_id,
      quantita: servizio.quantita ?? 1,
    })),
    { transaction },
  );
};

const eliminaPacchetto = async (id) => {
  return await Pacchetto.destroy({ where: { id } });
};

// ─────────────────────────────────────
// Tassa di soggiorno
// ─────────────────────────────────────

const trovaTasse = async () => {
  return await TassaSoggiorno.findAll({ order: [['valida_dal', 'DESC']] });
};

const trovaTassaPerId = async (id) => {
  return await TassaSoggiorno.findByPk(id);
};

// Tariffa in vigore alla data di arrivo.
const trovaTassaInVigore = async (data) => {
  return await TassaSoggiorno.findOne({
    where: { attiva: true, valida_dal: { [Op.lte]: data }, valida_al: { [Op.gte]: data } },
    order: [['valida_dal', 'DESC']],
  });
};

const creaTassa = async (dati) => {
  return await TassaSoggiorno.create(dati);
};

const aggiornaTassa = async (id, dati) => {
  const tassa = await TassaSoggiorno.findByPk(id);
  if (!tassa) {
    return null;
  }
  return await tassa.update(dati);
};

const eliminaTassa = async (id) => {
  return await TassaSoggiorno.destroy({ where: { id } });
};

module.exports = {
  trovaPiani,
  trovaPianoPerId,
  trovaPianoAttivo,
  trovaPianoPredefinito,
  creaPiano,
  aggiornaPiano,
  togliPredefinito,
  eliminaPiano,
  contaPrenotazioniConPiano,
  trovaPeriodi,
  trovaPeriodiDelSoggiorno,
  trovaPeriodoPerId,
  creaPeriodo,
  aggiornaPeriodo,
  eliminaPeriodo,
  trovaPromozioni,
  trovaPromozioniDelSoggiorno,
  trovaPromozioniPubbliche,
  trovaPromozionePerId,
  creaPromozione,
  aggiornaPromozione,
  eliminaPromozione,
  trovaCodiciSconto,
  trovaCodiceScontoPerId,
  trovaCodiceScontoAttivo,
  contaUtilizziUtente,
  creaCodiceSconto,
  aggiornaCodiceSconto,
  eliminaCodiceSconto,
  trovaPacchetti,
  trovaPacchettiPubblici,
  trovaPacchettoPerId,
  trovaPacchettoAttivo,
  creaPacchetto,
  aggiornaPacchetto,
  impostaServiziPacchetto,
  eliminaPacchetto,
  trovaTasse,
  trovaTassaPerId,
  trovaTassaInVigore,
  creaTassa,
  aggiornaTassa,
  eliminaTassa,
};
