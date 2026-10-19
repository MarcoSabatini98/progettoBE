// src/controllers/manutenzione.controller.js
//
// Segnalazioni di guasti: chiunque dello staff segnala, chi gestisce la
// manutenzione assegna e risolve (i controlli sono nel service).

const manutenzioneService = require('../services/manutenzione.service');
const { inviaSuccesso } = require('../utils/risposta');

const elenco = async (req, res) => {
  const segnalazioni = await manutenzioneService.elenco(req.query, req.contesto);
  return inviaSuccesso(res, 200, segnalazioni);
};

const dettaglio = async (req, res) => {
  const segnalazione = await manutenzioneService.dettaglio(req.params.id, req.contesto);
  return inviaSuccesso(res, 200, segnalazione);
};

/** Chi può prendere in carico una segnalazione. */
const incaricabili = async (req, res) => {
  const staff = await manutenzioneService.incaricabili();
  return inviaSuccesso(res, 200, staff);
};

const segnala = async (req, res) => {
  const segnalazione = await manutenzioneService.segnala(req.body, req.contesto);
  return inviaSuccesso(res, 201, segnalazione);
};

const aggiorna = async (req, res) => {
  const segnalazione = await manutenzioneService.aggiorna(req.params.id, req.body, req.contesto);
  return inviaSuccesso(res, 200, segnalazione);
};

module.exports = {
  elenco,
  dettaglio,
  incaricabili,
  segnala,
  aggiorna,
};
