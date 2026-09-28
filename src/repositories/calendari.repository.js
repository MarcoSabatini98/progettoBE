// src/repositories/calendari.repository.js
//
// Chiusure (date bloccate) e calendari esterni delle OTA.
// Una chiusura con camera_id NULL vale per tutta la struttura.

const { Op } = require('sequelize');
const { Camera, CalendarioEsterno, DataBloccata, Prenotazione } = require('../models');
const { STATI_ATTIVI } = require('../constants/prenotazioni.constants');

const includeCamera = { model: Camera, as: 'camera', attributes: ['id', 'numero', 'nome'] };

// La camera indicata oppure le chiusure di tutta la struttura.
const dellaCamera = (cameraId) => ({ [Op.or]: [cameraId, null] });

// ─────────────────────────────────────
// Chiusure
// ─────────────────────────────────────

/** Chiusure che toccano l'intervallo. filtri: { dal, al, camera_id } */
const trovaChiusure = async (filtri) => {
  const where = {};
  if (filtri.dal) {
    where.data_fine = { [Op.gt]: filtri.dal };
  }
  if (filtri.al) {
    where.data_inizio = { [Op.lt]: filtri.al };
  }
  if (filtri.camera_id) {
    where.camera_id = dellaCamera(filtri.camera_id);
  }
  return await DataBloccata.findAll({
    where,
    include: [
      includeCamera,
      { model: CalendarioEsterno, as: 'calendario', attributes: ['id', 'canale', 'nome'] },
    ],
    order: [['data_inizio', 'ASC']],
  });
};

const trovaChiusuraPerId = async (id) => {
  return await DataBloccata.findByPk(id, { include: [includeCamera] });
};

// Chiusure di una camera ancora in corso dal giorno indicato (feed iCal).
const trovaChiusureCameraDal = async (cameraId, dal) => {
  return await DataBloccata.findAll({
    where: { camera_id: dellaCamera(cameraId), data_fine: { [Op.gt]: dal } },
    attributes: ['id', 'data_inizio', 'data_fine'],
  });
};

const creaChiusura = async (dati) => {
  return await DataBloccata.create(dati);
};

const aggiornaChiusura = async (id, dati) => {
  return await DataBloccata.update(dati, { where: { id } });
};

const eliminaChiusura = async (id) => {
  return await DataBloccata.destroy({ where: { id } });
};

// ─────────────────────────────────────
// Prenotazioni che occupano le date
// ─────────────────────────────────────

/** Prenotazioni attive sovrapposte all'intervallo (cameraId null = tutte le camere). */
const trovaPrenotazioniSovrapposte = async (cameraId, inizio, fine) => {
  const where = {
    stato: { [Op.in]: STATI_ATTIVI },
    data_arrivo: { [Op.lt]: fine },
    data_partenza: { [Op.gt]: inizio },
  };
  if (cameraId) {
    where.camera_id = cameraId;
  }
  return await Prenotazione.findAll({
    where,
    attributes: ['id', 'codice', 'camera_id', 'data_arrivo', 'data_partenza'],
  });
};

// Prenotazioni attive di una camera non ancora partite al giorno indicato.
const trovaPrenotazioniCameraDal = async (cameraId, dal) => {
  return await Prenotazione.findAll({
    where: {
      camera_id: cameraId,
      stato: { [Op.in]: STATI_ATTIVI },
      data_partenza: { [Op.gt]: dal },
    },
    attributes: ['id', 'data_arrivo', 'data_partenza'],
  });
};

// ─────────────────────────────────────
// Calendari esterni
// ─────────────────────────────────────

const trovaCalendari = async () => {
  return await CalendarioEsterno.findAll({
    include: [includeCamera],
    order: [
      ['camera_id', 'ASC'],
      ['canale', 'ASC'],
    ],
  });
};

const trovaCalendarioPerId = async (id) => {
  return await CalendarioEsterno.findByPk(id, { include: [includeCamera] });
};

const trovaCalendariAttivi = async () => {
  return await CalendarioEsterno.findAll({ where: { attivo: true }, attributes: ['id'] });
};

const creaCalendario = async (dati) => {
  return await CalendarioEsterno.create(dati);
};

const aggiornaCalendario = async (id, dati) => {
  return await CalendarioEsterno.update(dati, { where: { id } });
};

// Le date importate vanno via in cascata.
const eliminaCalendario = async (id) => {
  return await CalendarioEsterno.destroy({ where: { id } });
};

// ─────────────────────────────────────
// Eventi importati
// ─────────────────────────────────────

const trovaUidImportati = async (calendarioId) => {
  const importate = await DataBloccata.findAll({
    where: { calendario_id: calendarioId },
    attributes: ['uid_esterno'],
  });
  return importate.map((chiusura) => chiusura.uid_esterno);
};

/** Toglie gli eventi che il canale non riporta più (uidDaTenere). */
const eliminaImportatiTranne = async (calendarioId, uidDaTenere, transaction = null) => {
  const where = { calendario_id: calendarioId };
  if (uidDaTenere.length > 0) {
    where.uid_esterno = { [Op.notIn]: uidDaTenere };
  }
  return await DataBloccata.destroy({ where, transaction });
};

/** Inserisce o aggiorna gli eventi per UID (chiave unica calendario_id + uid_esterno). */
const salvaImportati = async (righe, transaction = null) => {
  return await DataBloccata.bulkCreate(righe, {
    updateOnDuplicate: ['data_inizio', 'data_fine', 'motivo', 'camera_id'],
    transaction,
  });
};

module.exports = {
  trovaChiusure,
  trovaChiusuraPerId,
  trovaChiusureCameraDal,
  creaChiusura,
  aggiornaChiusura,
  eliminaChiusura,
  trovaPrenotazioniSovrapposte,
  trovaPrenotazioniCameraDal,
  trovaCalendari,
  trovaCalendarioPerId,
  trovaCalendariAttivi,
  creaCalendario,
  aggiornaCalendario,
  eliminaCalendario,
  trovaUidImportati,
  eliminaImportatiTranne,
  salvaImportati,
};
