// src/controllers/recensioni.controller.js
//
// Recensioni degli ospiti a soggiorno concluso: pubblicate sul sito dopo la
// moderazione dello staff, con eventuale risposta della struttura.

const recensioniService = require('../services/recensioni.service');
const { inviaSuccesso } = require('../utils/risposta');

// ─────────────────────────────────────
// Sito e area personale
// ─────────────────────────────────────

const pubbliche = async (req, res) => {
  const recensioni = await recensioniService.pubbliche(req.query);
  return inviaSuccesso(res, 200, recensioni);
};

const valutazioni = async (req, res) => {
  const medie = await recensioniService.valutazioni();
  return inviaSuccesso(res, 200, medie);
};

const crea = async (req, res) => {
  const recensione = await recensioniService.crea(
    req.params.prenotazioneId,
    req.body,
    req.contesto,
  );
  return inviaSuccesso(res, 201, recensione);
};

// Ospite senza account: codice prenotazione + email del titolare (link nell'email).
const creaDaCodice = async (req, res) => {
  const { codice, email, ...dati } = req.body;
  const recensione = await recensioniService.creaDaCodice(codice, email, dati);
  return inviaSuccesso(res, 201, recensione);
};

// ─────────────────────────────────────
// Staff
// ─────────────────────────────────────

const elenco = async (req, res) => {
  const recensioni = await recensioniService.elenco(req.query);
  return inviaSuccesso(res, 200, recensioni);
};

const dettaglio = async (req, res) => {
  const recensione = await recensioniService.dettaglio(req.params.id);
  return inviaSuccesso(res, 200, recensione);
};

const modera = async (req, res) => {
  const recensione = await recensioniService.modera(req.params.id, req.body.stato, req.contesto);
  return inviaSuccesso(res, 200, recensione);
};

const rispondi = async (req, res) => {
  const recensione = await recensioniService.rispondi(
    req.params.id,
    req.body.risposta,
    req.contesto,
  );
  return inviaSuccesso(res, 200, recensione);
};

module.exports = {
  pubbliche,
  valutazioni,
  crea,
  creaDaCodice,
  elenco,
  dettaglio,
  modera,
  rispondi,
};
