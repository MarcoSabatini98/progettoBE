// src/repositories/fatture.repository.js
//
// Fatture e note di credito con le loro righe.
// Le scritture vanno dentro transazione(): tabella sotto audit.

const { Op } = require('sequelize');
const {
  Fattura,
  FatturaRiga,
  Prenotazione,
  PrenotazioneServizio,
  Servizio,
  Ospite,
  Camera,
  TipologiaCamera,
  Pacchetto,
} = require('../models');

const includeRighe = {
  model: FatturaRiga,
  as: 'righe',
  separate: true,
  order: [['ordine', 'ASC']],
};

// ─────────────────────────────────────
// Lettura
// ─────────────────────────────────────

const trovaFatturaPerId = async (id, transaction = null) => {
  return await Fattura.findByPk(id, { include: [includeRighe], transaction });
};

// Con la prenotazione e il titolare: per il controllo del proprietario e l'email.
const trovaFatturaConTitolare = async (id) => {
  return await Fattura.findByPk(id, {
    include: [
      {
        model: Prenotazione,
        as: 'prenotazione',
        attributes: ['id', 'codice', 'utente_id'],
        include: [{ model: Ospite, as: 'titolare', attributes: ['nome', 'email', 'lingua'] }],
      },
    ],
  });
};

const trovaFatture = async (filtri, { limit, offset }) => {
  const where = {};
  if (filtri.stato_sdi) {
    where.stato_sdi = String(filtri.stato_sdi).split(',');
  }
  if (filtri.anno) {
    where.anno = filtri.anno;
  }
  if (filtri.prenotazione_id) {
    where.prenotazione_id = filtri.prenotazione_id;
  }
  if (filtri.cerca) {
    const testo = `%${filtri.cerca}%`;
    where[Op.or] = [
      { cliente_denominazione: { [Op.like]: testo } },
      { cliente_cognome: { [Op.like]: testo } },
      { cliente_codice_fiscale: { [Op.like]: testo } },
      { cliente_partita_iva: { [Op.like]: testo } },
    ];
  }

  return await Fattura.findAndCountAll({
    where,
    order: [
      ['anno', 'DESC'],
      ['numero', 'DESC'],
      ['id', 'DESC'],
    ],
    limit,
    offset,
  });
};

// Area cliente: fatture emesse per le sue prenotazioni (le bozze no).
const trovaFattureCliente = async (utenteId) => {
  return await Fattura.findAll({
    where: { stato_sdi: { [Op.ne]: 'bozza' } },
    attributes: [
      'id',
      'tipo_documento',
      'anno',
      'sezionale',
      'numero',
      'data_emissione',
      'totale',
      'stato_sdi',
    ],
    include: [
      {
        model: Prenotazione,
        as: 'prenotazione',
        attributes: ['id', 'codice'],
        where: { utente_id: utenteId },
      },
    ],
    order: [['data_emissione', 'DESC']],
  });
};

const trovaFattureEmesseDiPrenotazione = async (prenotazioneId, transaction = null) => {
  return await Fattura.findAll({
    where: { prenotazione_id: prenotazioneId, stato_sdi: { [Op.ne]: 'bozza' } },
    attributes: ['id', 'tipo_documento', 'totale'],
    transaction,
  });
};

// Totale delle note di credito già emesse su una fattura.
const sommaStornato = async (fatturaId, transaction = null) => {
  const totale = await Fattura.sum('totale', {
    where: { fattura_origine_id: fatturaId },
    transaction,
  });
  return totale ?? 0;
};

// Tutto ciò che serve per le voci della fattura di una prenotazione.
const trovaPrenotazioneDaFatturare = async (prenotazioneId, transaction) => {
  return await Prenotazione.findByPk(prenotazioneId, {
    include: [
      {
        model: Camera,
        as: 'camera',
        attributes: ['id'],
        include: [{ model: TipologiaCamera, as: 'tipologia', attributes: ['nome'] }],
      },
      { model: Ospite, as: 'titolare' },
      { model: Pacchetto, as: 'pacchetto', attributes: ['nome'] },
      {
        model: PrenotazioneServizio,
        as: 'righe_servizi',
        include: [{ model: Servizio, as: 'servizio', attributes: ['nome', 'aliquota_iva'] }],
      },
    ],
    transaction,
  });
};

// ─────────────────────────────────────
// Scrittura
// ─────────────────────────────────────

const creaFattura = async (dati, righe, transaction) => {
  const fattura = await Fattura.create(dati, { transaction });
  const conFattura = righe.map((riga, indice) => ({
    ...riga,
    fattura_id: fattura.id,
    ordine: indice,
  }));
  await FatturaRiga.bulkCreate(conFattura, { transaction });
  return fattura;
};

const aggiornaFattura = async (id, dati, transaction) => {
  return await Fattura.update(dati, { where: { id }, transaction });
};

const sostituisciRighe = async (fatturaId, righe, transaction) => {
  await FatturaRiga.destroy({ where: { fattura_id: fatturaId }, transaction });
  const conFattura = righe.map((riga, indice) => ({
    ...riga,
    fattura_id: fatturaId,
    ordine: indice,
  }));
  return await FatturaRiga.bulkCreate(conFattura, { transaction });
};

const eliminaFattura = async (id, transaction) => {
  return await Fattura.destroy({ where: { id }, transaction });
};

// Emesse ma ferme: da trasmettere allo SDI o scartate (da correggere e riemettere).
const trovaFermeAlloSdi = async () => {
  return await Fattura.findAll({
    where: { stato_sdi: ['da_inviare', 'scartata'] },
    attributes: ['id', 'tipo_documento', 'anno', 'sezionale', 'numero', 'stato_sdi'],
    order: [
      ['anno', 'ASC'],
      ['numero', 'ASC'],
    ],
  });
};

const eliminaBozzeDiPrenotazione = async (prenotazioneId, transaction) => {
  return await Fattura.destroy({
    where: { prenotazione_id: prenotazioneId, stato_sdi: 'bozza' },
    transaction,
  });
};

module.exports = {
  trovaFatturaPerId,
  trovaFatturaConTitolare,
  trovaFatture,
  trovaFattureCliente,
  trovaFattureEmesseDiPrenotazione,
  sommaStornato,
  trovaPrenotazioneDaFatturare,
  creaFattura,
  aggiornaFattura,
  sostituisciRighe,
  eliminaFattura,
  eliminaBozzeDiPrenotazione,
  trovaFermeAlloSdi,
};
