// src/controllers/camere.controller.js
//
// Tipologie, camere fisiche e servizi: gestione dallo staff e pagine pubbliche
// del sito (nella lingua richiesta con ?lingua=).

const camereService = require('../services/camere.service');
const { inviaSuccesso } = require('../utils/risposta');

// ─────────────────────────────────────
// Sito pubblico
// ─────────────────────────────────────

const tipologiePubbliche = async (req, res) => {
  const tipologie = await camereService.tipologiePubbliche(req.query.lingua);
  return inviaSuccesso(res, 200, tipologie);
};

const tipologiaPubblica = async (req, res) => {
  const tipologia = await camereService.tipologiaPubblica(req.params.slug, req.query.lingua);
  return inviaSuccesso(res, 200, tipologia);
};

const extraPubblici = async (req, res) => {
  const extra = await camereService.extraPubblici(req.query.lingua);
  return inviaSuccesso(res, 200, extra);
};

// ─────────────────────────────────────
// Tipologie
// ─────────────────────────────────────

const elencoTipologie = async (req, res) => {
  const tipologie = await camereService.elencoTipologie(req.query);
  return inviaSuccesso(res, 200, tipologie);
};

const dettaglioTipologia = async (req, res) => {
  const tipologia = await camereService.dettaglioTipologia(req.params.id);
  return inviaSuccesso(res, 200, tipologia);
};

const creaTipologia = async (req, res) => {
  const tipologia = await camereService.creaTipologia(req.body);
  return inviaSuccesso(res, 201, tipologia);
};

const aggiornaTipologia = async (req, res) => {
  const tipologia = await camereService.aggiornaTipologia(req.params.id, req.body);
  return inviaSuccesso(res, 200, tipologia);
};

const eliminaTipologia = async (req, res) => {
  await camereService.eliminaTipologia(req.params.id);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// Camere
// ─────────────────────────────────────

const elencoCamere = async (req, res) => {
  const camere = await camereService.elencoCamere(req.query);
  return inviaSuccesso(res, 200, camere);
};

const dettaglioCamera = async (req, res) => {
  const camera = await camereService.dettaglioCamera(req.params.id);
  return inviaSuccesso(res, 200, camera);
};

const creaCamera = async (req, res) => {
  const camera = await camereService.creaCamera(req.body);
  return inviaSuccesso(res, 201, camera);
};

const aggiornaCamera = async (req, res) => {
  const camera = await camereService.aggiornaCamera(req.params.id, req.body);
  return inviaSuccesso(res, 200, camera);
};

const eliminaCamera = async (req, res) => {
  await camereService.eliminaCamera(req.params.id);
  return inviaSuccesso(res, 200, null);
};

const rigeneraTokenIcal = async (req, res) => {
  const camera = await camereService.rigeneraTokenIcal(req.params.id);
  return inviaSuccesso(res, 200, camera);
};

const statoCamere = async (req, res) => {
  const stato = await camereService.statoCamere();
  return inviaSuccesso(res, 200, stato);
};

const planning = async (req, res) => {
  const righe = await camereService.planning(req.query.dal, req.query.al);
  return inviaSuccesso(res, 200, righe);
};

// ─────────────────────────────────────
// Servizi
// ─────────────────────────────────────

const elencoServizi = async (req, res) => {
  const servizi = await camereService.elencoServizi(req.query);
  return inviaSuccesso(res, 200, servizi);
};

const dettaglioServizio = async (req, res) => {
  const servizio = await camereService.dettaglioServizio(req.params.id);
  return inviaSuccesso(res, 200, servizio);
};

const creaServizio = async (req, res) => {
  const servizio = await camereService.creaServizio(req.body);
  return inviaSuccesso(res, 201, servizio);
};

const aggiornaServizio = async (req, res) => {
  const servizio = await camereService.aggiornaServizio(req.params.id, req.body);
  return inviaSuccesso(res, 200, servizio);
};

const eliminaServizio = async (req, res) => {
  await camereService.eliminaServizio(req.params.id);
  return inviaSuccesso(res, 200, null);
};

module.exports = {
  tipologiePubbliche,
  tipologiaPubblica,
  extraPubblici,
  elencoTipologie,
  dettaglioTipologia,
  creaTipologia,
  aggiornaTipologia,
  eliminaTipologia,
  elencoCamere,
  dettaglioCamera,
  creaCamera,
  aggiornaCamera,
  eliminaCamera,
  rigeneraTokenIcal,
  statoCamere,
  planning,
  elencoServizi,
  dettaglioServizio,
  creaServizio,
  aggiornaServizio,
  eliminaServizio,
};
