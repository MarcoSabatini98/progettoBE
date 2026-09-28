// src/repositories/ospiti.repository.js
//
// Anagrafiche degli ospiti (dati per Alloggiati Web), documenti caricati e
// ospiti di ogni prenotazione.

const { Op } = require('sequelize');
const {
  Ospite,
  DocumentoOspite,
  AlloggiatiLuogo,
  AlloggiatiDocumento,
  Prenotazione,
  PrenotazioneOspite,
  Utente,
} = require('../models');

const includeLuoghi = [
  { model: AlloggiatiLuogo, as: 'cittadinanza', attributes: ['codice', 'descrizione'] },
  { model: AlloggiatiLuogo, as: 'stato_nascita', attributes: ['codice', 'descrizione'] },
  { model: AlloggiatiLuogo, as: 'comune_nascita', attributes: ['codice', 'descrizione'] },
  { model: AlloggiatiLuogo, as: 'luogo_rilascio', attributes: ['codice', 'descrizione'] },
  { model: AlloggiatiDocumento, as: 'documento_tipo', attributes: ['codice', 'descrizione'] },
];

// ─────────────────────────────────────
// Anagrafiche
// ─────────────────────────────────────

const trovaOspiti = async (filtri, { limit, offset }) => {
  const where = {};
  if (filtri.cerca) {
    const testo = `%${filtri.cerca}%`;
    where[Op.or] = [
      { nome: { [Op.like]: testo } },
      { cognome: { [Op.like]: testo } },
      { email: { [Op.like]: testo } },
      { numero_documento: { [Op.like]: testo } },
      { codice_fiscale: { [Op.like]: testo } },
    ];
  }
  return await Ospite.findAndCountAll({
    where,
    order: [
      ['cognome', 'ASC'],
      ['nome', 'ASC'],
    ],
    limit,
    offset,
  });
};

const trovaOspitePerId = async (id, transaction = null) => {
  return await Ospite.findByPk(id, { transaction });
};

// Scheda completa: documenti caricati, descrizione di luoghi e tipo documento,
// soggiorni passati.
const trovaSchedaOspite = async (id) => {
  return await Ospite.findByPk(id, {
    include: [
      ...includeLuoghi,
      { model: DocumentoOspite, as: 'documenti' },
      {
        model: Prenotazione,
        as: 'soggiorni',
        attributes: ['id', 'codice', 'data_arrivo', 'data_partenza', 'stato'],
        through: { attributes: ['tipo_alloggiato'] },
      },
    ],
  });
};

const trovaOspitePerDocumento = async (tipoDocumento, numeroDocumento, transaction = null) => {
  return await Ospite.findOne({
    where: { tipo_documento: tipoDocumento, numero_documento: numeroDocumento },
    transaction,
  });
};

// Account cliente a cui appartiene l'anagrafica (null per gli ospiti di passaggio).
const trovaAccountDiOspite = async (ospiteId, transaction = null) => {
  return await Utente.findOne({
    where: { ospite_id: ospiteId },
    attributes: ['id'],
    transaction,
  });
};

const creaOspite = async (dati, transaction = null) => {
  return await Ospite.create(dati, { transaction });
};

const aggiornaOspite = async (id, dati, transaction = null) => {
  const ospite = await Ospite.findByPk(id, { transaction });
  if (!ospite) {
    return null;
  }
  return await ospite.update(dati, { transaction });
};

const eliminaOspite = async (id) => {
  return await Ospite.destroy({ where: { id } });
};

// Soggiorni in cui l'ospite compare, come titolare o come alloggiato.
const contaSoggiorni = async (ospiteId) => {
  const [alloggiato, titolare] = await Promise.all([
    PrenotazioneOspite.count({ where: { ospite_id: ospiteId } }),
    Prenotazione.count({ where: { ospite_id: ospiteId } }),
  ]);
  return alloggiato + titolare;
};

// ─────────────────────────────────────
// Documenti caricati (scansioni)
// ─────────────────────────────────────

const trovaDocumentiDiOspite = async (ospiteId) => {
  return await DocumentoOspite.findAll({ where: { ospite_id: ospiteId } });
};

const trovaDocumentoPerId = async (id) => {
  return await DocumentoOspite.findByPk(id);
};

const creaDocumento = async (dati) => {
  return await DocumentoOspite.create(dati);
};

const eliminaDocumento = async (id) => {
  return await DocumentoOspite.destroy({ where: { id } });
};

// ─────────────────────────────────────
// Ospiti di una prenotazione
// ─────────────────────────────────────

const trovaOspitiDiPrenotazione = async (prenotazioneId) => {
  return await PrenotazioneOspite.findAll({
    where: { prenotazione_id: prenotazioneId },
    include: [{ model: Ospite, as: 'ospite' }],
  });
};

const creaRigaOspite = async (dati, transaction) => {
  return await PrenotazioneOspite.create(dati, { transaction });
};

// Gli ospiti del soggiorno si riscrivono per intero.
const sostituisciOspitiDiPrenotazione = async (prenotazioneId, righe, transaction) => {
  await PrenotazioneOspite.destroy({ where: { prenotazione_id: prenotazioneId }, transaction });
  return await PrenotazioneOspite.bulkCreate(righe, { transaction });
};

module.exports = {
  trovaOspiti,
  trovaOspitePerId,
  trovaSchedaOspite,
  trovaOspitePerDocumento,
  trovaAccountDiOspite,
  creaOspite,
  aggiornaOspite,
  eliminaOspite,
  contaSoggiorni,
  trovaDocumentiDiOspite,
  trovaDocumentoPerId,
  creaDocumento,
  eliminaDocumento,
  trovaOspitiDiPrenotazione,
  creaRigaOspite,
  sostituisciOspitiDiPrenotazione,
};
