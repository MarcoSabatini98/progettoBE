// src/controllers/fedelta.controller.js
//
// Programma fedeltà: livelli, punti del cliente, classifica e rettifiche
// manuali dello staff.

const fedeltaService = require('../services/fedelta.service');
const { inviaSuccesso } = require('../utils/risposta');

// ─────────────────────────────────────
// Livelli (elenco anche per il sito)
// ─────────────────────────────────────

const elencoLivelli = async (req, res) => {
  const livelli = await fedeltaService.elencoLivelli();
  return inviaSuccesso(res, 200, livelli);
};

const dettaglioLivello = async (req, res) => {
  const livello = await fedeltaService.dettaglioLivello(req.params.id);
  return inviaSuccesso(res, 200, livello);
};

const creaLivello = async (req, res) => {
  const livello = await fedeltaService.creaLivello(req.body);
  return inviaSuccesso(res, 201, livello);
};

const aggiornaLivello = async (req, res) => {
  const livello = await fedeltaService.aggiornaLivello(req.params.id, req.body);
  return inviaSuccesso(res, 200, livello);
};

const eliminaLivello = async (req, res) => {
  await fedeltaService.eliminaLivello(req.params.id);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// Area personale
// ─────────────────────────────────────

const miaSituazione = async (req, res) => {
  const situazione = await fedeltaService.situazione(req.contesto.utenteId);
  return inviaSuccesso(res, 200, situazione);
};

const mieiMovimenti = async (req, res) => {
  const movimenti = await fedeltaService.movimenti(req.contesto.utenteId, req.query);
  return inviaSuccesso(res, 200, movimenti);
};

const mieStatistiche = async (req, res) => {
  const statistiche = await fedeltaService.statisticheAnno(req.contesto.utenteId, req.query.anno);
  return inviaSuccesso(res, 200, statistiche);
};

// ─────────────────────────────────────
// Staff
// ─────────────────────────────────────

const classifica = async (req, res) => {
  const clienti = await fedeltaService.classifica(req.query);
  return inviaSuccesso(res, 200, clienti);
};

const clientiPerLivello = async (req, res) => {
  const conteggi = await fedeltaService.clientiPerLivello();
  return inviaSuccesso(res, 200, conteggi);
};

const situazioneCliente = async (req, res) => {
  const situazione = await fedeltaService.situazione(req.params.utenteId);
  return inviaSuccesso(res, 200, situazione);
};

const movimentiCliente = async (req, res) => {
  const movimenti = await fedeltaService.movimenti(req.params.utenteId, req.query);
  return inviaSuccesso(res, 200, movimenti);
};

const assegnaPunti = async (req, res) => {
  const situazione = await fedeltaService.assegnaPunti(req.params.utenteId, req.body, req.contesto);
  return inviaSuccesso(res, 200, situazione);
};

const impostaLivello = async (req, res) => {
  const situazione = await fedeltaService.impostaLivello(
    req.params.utenteId,
    req.body.livello,
    req.contesto,
  );
  return inviaSuccesso(res, 200, situazione);
};

module.exports = {
  elencoLivelli,
  dettaglioLivello,
  creaLivello,
  aggiornaLivello,
  eliminaLivello,
  miaSituazione,
  mieiMovimenti,
  mieStatistiche,
  classifica,
  clientiPerLivello,
  situazioneCliente,
  movimentiCliente,
  assegnaPunti,
  impostaLivello,
};
