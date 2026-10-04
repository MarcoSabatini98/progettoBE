// src/repositories/prenotazioni.repository.js
//
// Prenotazioni, servizi extra prenotati e saldo (VIEW v_saldo_prenotazioni).
// Gli ospiti del soggiorno sono in ospiti.repository.

const { Op } = require('sequelize');
const {
  Prenotazione,
  PrenotazioneOspite,
  PrenotazioneServizio,
  SaldoPrenotazione,
  Camera,
  TipologiaCamera,
  Ospite,
  Servizio,
  Pagamento,
  PianoTariffario,
  CodiceSconto,
  Pacchetto,
  Utente,
  Recensione,
} = require('../models');
const { STATI_ATTIVI } = require('../constants/prenotazioni.constants');

// Campi che il cliente non deve vedere.
const NASCOSTI_AL_CLIENTE = [
  'note_interne',
  'token_checkin',
  'token_checkin_scade_il',
  'creato_da',
];

const includeCamera = {
  model: Camera,
  as: 'camera',
  attributes: ['id', 'numero', 'nome', 'tipologia_id'],
  include: [{ model: TipologiaCamera, as: 'tipologia', attributes: ['id', 'nome', 'slug'] }],
};

const includeTitolare = {
  model: Ospite,
  as: 'titolare',
  attributes: ['id', 'nome', 'cognome', 'email', 'telefono', 'lingua'],
};

const includeSaldo = {
  model: SaldoPrenotazione,
  as: 'saldo',
  attributes: ['dovuto', 'incassato', 'rimborsato', 'saldo'],
};

// Tutto ciò che serve alla scheda della prenotazione.
const includeCompleto = [
  includeCamera,
  includeTitolare,
  includeSaldo,
  {
    model: PrenotazioneOspite,
    as: 'righe_ospiti',
    include: [{ model: Ospite, as: 'ospite' }],
  },
  {
    model: PrenotazioneServizio,
    as: 'righe_servizi',
    include: [{ model: Servizio, as: 'servizio', attributes: ['id', 'nome', 'icona'] }],
  },
  {
    model: Pagamento,
    as: 'pagamenti',
    attributes: { exclude: ['link_pagamento'] },
    separate: true,
    order: [['creato_il', 'ASC']],
  },
  { model: PianoTariffario, as: 'piano_tariffario', attributes: ['id', 'nome'] },
  { model: CodiceSconto, as: 'codice_sconto', attributes: ['id', 'codice'] },
  { model: Pacchetto, as: 'pacchetto', attributes: ['id', 'nome'] },
  { model: Utente, as: 'autore', attributes: ['id', 'nome', 'cognome'] },
];

// ─────────────────────────────────────
// Lettura
// ─────────────────────────────────────

const trovaPrenotazionePerId = async (id, transaction = null) => {
  return await Prenotazione.findByPk(id, { transaction });
};

// Con lucchetto sulla riga: le modifiche simultanee si mettono in fila.
const bloccaPrenotazione = async (id, transaction) => {
  return await Prenotazione.findByPk(id, { lock: transaction.LOCK.UPDATE, transaction });
};

const trovaDettaglio = async (id) => {
  return await Prenotazione.findByPk(id, { include: includeCompleto });
};

// Versione per il cliente: senza note interne e token.
const trovaDettaglioCliente = async (where) => {
  return await Prenotazione.findOne({
    where,
    attributes: { exclude: NASCOSTI_AL_CLIENTE },
    include: includeCompleto.filter((include) => include.as !== 'autore'),
  });
};

const trovaPerCodice = async (codice) => {
  return await Prenotazione.findOne({
    where: { codice },
    attributes: ['id', 'codice'],
    include: [includeTitolare],
  });
};

const trovaPerTokenCheckin = async (tokenHash) => {
  return await Prenotazione.findOne({ where: { token_checkin: tokenHash } });
};

const trovaPrenotazioni = async (filtri, { limit, offset }) => {
  const where = {};
  if (filtri.stato) {
    where.stato = { [Op.in]: String(filtri.stato).split(',') };
  }
  if (filtri.canale) {
    where.canale = filtri.canale;
  }
  if (filtri.camera_id) {
    where.camera_id = filtri.camera_id;
  }
  // soggiorni che toccano l'intervallo [dal, al]
  if (filtri.dal) {
    where.data_partenza = { [Op.gt]: filtri.dal };
  }
  if (filtri.al) {
    where.data_arrivo = { [Op.lte]: filtri.al };
  }
  if (filtri.cerca) {
    const testo = `%${filtri.cerca}%`;
    where[Op.or] = [
      { codice: { [Op.like]: testo } },
      { '$titolare.cognome$': { [Op.like]: testo } },
      { '$titolare.email$': { [Op.like]: testo } },
    ];
  }

  return await Prenotazione.findAndCountAll({
    where,
    include: [includeCamera, includeTitolare],
    order: [
      ['data_arrivo', filtri.ordine === 'desc' ? 'DESC' : 'ASC'],
      ['id', 'ASC'],
    ],
    limit,
    offset,
    distinct: true,
  });
};

// Area cliente: le prenotazioni dell'account, dalle più recenti.
const trovaPrenotazioniCliente = async (utenteId, { limit, offset }) => {
  return await Prenotazione.findAndCountAll({
    where: { utente_id: utenteId },
    attributes: { exclude: NASCOSTI_AL_CLIENTE },
    include: [includeCamera, includeSaldo],
    order: [['data_arrivo', 'DESC']],
    limit,
    offset,
  });
};

const opzioniGiornata = {
  include: [includeCamera, includeTitolare, includeSaldo],
  order: [['camera_id', 'ASC']],
};

const trovaArrivi = async (giorno) => {
  return await Prenotazione.findAll({
    ...opzioniGiornata,
    where: { data_arrivo: giorno, stato: { [Op.in]: ['in_attesa', 'confermata'] } },
  });
};

const trovaPartenze = async (giorno) => {
  return await Prenotazione.findAll({
    ...opzioniGiornata,
    where: { data_partenza: giorno, stato: 'in_soggiorno' },
  });
};

const trovaInCasa = async () => {
  return await Prenotazione.findAll({ ...opzioniGiornata, where: { stato: 'in_soggiorno' } });
};

// Prenotazioni confermate con arrivo nel giorno indicato (promemoria di check-in).
const trovaConfermateInArrivo = async (giorno) => {
  return await Prenotazione.findAll({
    where: { data_arrivo: giorno, stato: 'confermata' },
    include: [includeTitolare],
  });
};

// Prenotazioni ancora nello stato indicato con la data (arrivo o partenza) già passata.
const trovaFermePrimaDi = async (stato, campo, giorno) => {
  return await Prenotazione.findAll({ where: { stato, [campo]: { [Op.lt]: giorno } } });
};

// Soggiorni conclusi partiti nel giorno indicato e non ancora recensiti.
const trovaDaRecensire = async (giorno) => {
  return await Prenotazione.findAll({
    where: { stato: 'conclusa', data_partenza: giorno, '$recensione.id$': null },
    include: [{ model: Recensione, as: 'recensione', attributes: [], required: false }],
  });
};

const contaAttiveCliente = async (utenteId) => {
  return await Prenotazione.count({
    where: { utente_id: utenteId, stato: { [Op.in]: STATI_ATTIVI } },
  });
};

/** Prenotazioni con incassato oltre il dovuto: il rimborso va ancora fatto. */
const trovaDaRimborsare = async () => {
  return await SaldoPrenotazione.findAll({
    where: { saldo: { [Op.lt]: 0 } },
    attributes: ['prenotazione_id', 'codice'],
    order: [['prenotazione_id', 'ASC']],
  });
};

const trovaSaldo = async (prenotazioneId, transaction = null) => {
  return await SaldoPrenotazione.findByPk(prenotazioneId, { transaction });
};

// ─────────────────────────────────────
// Scrittura (sempre dentro transazione(): tabella sotto audit)
// ─────────────────────────────────────

const creaPrenotazione = async (dati, transaction) => {
  return await Prenotazione.create(dati, { transaction });
};

const aggiornaPrenotazione = async (id, dati, transaction) => {
  return await Prenotazione.update(dati, { where: { id }, transaction });
};

// Prenotazioni online non pagate entro la scadenza.
const cancellaScadute = async (transaction) => {
  const [numero] = await Prenotazione.update(
    { stato: 'cancellata', motivo_cancellazione: 'Scaduta senza pagamento' },
    { where: { stato: 'in_attesa', scade_il: { [Op.lt]: new Date() } }, transaction },
  );
  return numero;
};

// ─────────────────────────────────────
// Servizi extra prenotati
// ─────────────────────────────────────

const trovaRigheServizi = async (prenotazioneId, transaction = null) => {
  return await PrenotazioneServizio.findAll({
    where: { prenotazione_id: prenotazioneId },
    transaction,
  });
};

const creaRigheServizi = async (righe, transaction) => {
  return await PrenotazioneServizio.bulkCreate(righe, { transaction });
};

// Crea la riga o ne aggiorna quantità e prezzo se il servizio c'è già.
const salvaRigaServizio = async (riga, transaction) => {
  return await PrenotazioneServizio.upsert(riga, { transaction });
};

const aggiornaTotaleRigaServizio = async (prenotazioneId, servizioId, totale, transaction) => {
  return await PrenotazioneServizio.update(
    { totale },
    { where: { prenotazione_id: prenotazioneId, servizio_id: servizioId }, transaction },
  );
};

const eliminaRigaServizio = async (prenotazioneId, servizioId, transaction) => {
  return await PrenotazioneServizio.destroy({
    where: { prenotazione_id: prenotazioneId, servizio_id: servizioId },
    transaction,
  });
};

module.exports = {
  trovaPrenotazionePerId,
  bloccaPrenotazione,
  trovaDettaglio,
  trovaDettaglioCliente,
  trovaPerCodice,
  trovaPerTokenCheckin,
  trovaPrenotazioni,
  trovaPrenotazioniCliente,
  trovaArrivi,
  trovaPartenze,
  trovaInCasa,
  trovaConfermateInArrivo,
  trovaFermePrimaDi,
  trovaDaRecensire,
  contaAttiveCliente,
  trovaSaldo,
  trovaDaRimborsare,
  creaPrenotazione,
  aggiornaPrenotazione,
  cancellaScadute,
  trovaRigheServizi,
  creaRigheServizi,
  salvaRigaServizio,
  aggiornaTotaleRigaServizio,
  eliminaRigaServizio,
};
