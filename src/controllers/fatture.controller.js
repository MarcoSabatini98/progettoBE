// src/controllers/fatture.controller.js
//
// Fatture elettroniche: bozze dalle prenotazioni, emissione, note di credito,
// esito SDI e download di PDF e XML (?tipo=pdf|xml).

const fattureService = require('../services/fatture.service');
const { inviaSuccesso } = require('../utils/risposta');

// ─────────────────────────────────────
// Area personale
// ─────────────────────────────────────

const mie = async (req, res) => {
  const fatture = await fattureService.fattureCliente(req.contesto.utenteId);
  return inviaSuccesso(res, 200, fatture);
};

const scaricaMia = async (req, res) => {
  const { percorso, nome } = await fattureService.filePerCliente(
    req.params.id,
    req.contesto.utenteId,
    req.query.tipo,
  );
  return res.download(percorso, nome);
};

// ─────────────────────────────────────
// Staff
// ─────────────────────────────────────

const elenco = async (req, res) => {
  const fatture = await fattureService.elenco(req.query);
  return inviaSuccesso(res, 200, fatture);
};

const dettaglio = async (req, res) => {
  const fattura = await fattureService.dettaglio(req.params.id);
  return inviaSuccesso(res, 200, fattura);
};

const scarica = async (req, res) => {
  const { percorso, nome } = await fattureService.percorsoFile(req.params.id, req.query.tipo);
  return res.download(percorso, nome);
};

/** body.cliente: dati di fatturazione diversi dal titolare (azienda, P.IVA, SDI, PEC). */
const bozzaDaPrenotazione = async (req, res) => {
  const bozza = await fattureService.bozzaDaPrenotazione(
    req.params.prenotazioneId,
    req.body.cliente,
    req.contesto,
  );
  return inviaSuccesso(res, 201, bozza);
};

const aggiornaBozza = async (req, res) => {
  const bozza = await fattureService.aggiornaBozza(req.params.id, req.body, req.contesto);
  return inviaSuccesso(res, 200, bozza);
};

const eliminaBozza = async (req, res) => {
  await fattureService.eliminaBozza(req.params.id, req.contesto);
  return inviaSuccesso(res, 200, null);
};

const emetti = async (req, res) => {
  const fattura = await fattureService.emetti(req.params.id, req.contesto);
  return inviaSuccesso(res, 200, fattura);
};

const notaDiCredito = async (req, res) => {
  const nota = await fattureService.notaDiCredito(req.params.id, req.body, req.contesto);
  return inviaSuccesso(res, 201, nota);
};

const aggiornaSdi = async (req, res) => {
  const fattura = await fattureService.aggiornaSdi(req.params.id, req.body, req.contesto);
  return inviaSuccesso(res, 200, fattura);
};

const rigeneraFile = async (req, res) => {
  const fattura = await fattureService.rigeneraFile(req.params.id, req.contesto);
  return inviaSuccesso(res, 200, fattura);
};

module.exports = {
  mie,
  scaricaMia,
  elenco,
  dettaglio,
  scarica,
  bozzaDaPrenotazione,
  aggiornaBozza,
  eliminaBozza,
  emetti,
  notaDiCredito,
  aggiornaSdi,
  rigeneraFile,
};
