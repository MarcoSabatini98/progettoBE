// src/controllers/notifiche.controller.js
//
// Notifiche in app dell'utente collegato (la campanella).

const notificheService = require('../services/notifiche.service');
const { inviaSuccesso } = require('../utils/risposta');

const elenco = async (req, res) => {
  const notifiche = await notificheService.elenco(req.contesto.utenteId, req.query);
  return inviaSuccesso(res, 200, notifiche);
};

const nonLette = async (req, res) => {
  const totale = await notificheService.nonLette(req.contesto.utenteId);
  return inviaSuccesso(res, 200, { non_lette: totale });
};

const segnaLetta = async (req, res) => {
  const notifica = await notificheService.segnaLetta(req.params.id, req.contesto.utenteId);
  return inviaSuccesso(res, 200, notifica);
};

const segnaTutteLette = async (req, res) => {
  const esito = await notificheService.segnaTutteLette(req.contesto.utenteId);
  return inviaSuccesso(res, 200, esito);
};

const elimina = async (req, res) => {
  await notificheService.elimina(req.params.id, req.contesto.utenteId);
  return inviaSuccesso(res, 200, null);
};

module.exports = {
  elenco,
  nonLette,
  segnaLetta,
  segnaTutteLette,
  elimina,
};
