// src/controllers/ospiti.controller.js
//
// Anagrafiche degli ospiti, documenti d'identità e ospiti di ogni soggiorno
// (dati per Alloggiati Web e tassa di soggiorno).

const ospitiService = require('../services/ospiti.service');
const { inviaSuccesso } = require('../utils/risposta');
const { locale } = require('../utils/file');

const elenco = async (req, res) => {
  const ospiti = await ospitiService.elenco(req.query);
  return inviaSuccesso(res, 200, ospiti);
};

const dettaglio = async (req, res) => {
  const ospite = await ospitiService.dettaglio(req.params.id);
  return inviaSuccesso(res, 200, ospite);
};

const crea = async (req, res) => {
  const ospite = await ospitiService.crea(req.body);
  return inviaSuccesso(res, 201, ospite);
};

const aggiorna = async (req, res) => {
  const ospite = await ospitiService.aggiorna(req.params.id, req.body, req.contesto);
  return inviaSuccesso(res, 200, ospite);
};

const elimina = async (req, res) => {
  await ospitiService.elimina(req.params.id);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// Documenti d'identità
// ─────────────────────────────────────

const aggiungiDocumento = async (req, res) => {
  const documento = await ospitiService.aggiungiDocumento(req.params.id, req.file);
  return inviaSuccesso(res, 201, documento);
};

const scaricaDocumento = async (req, res) => {
  const documento = await ospitiService.documento(req.params.documentoId);
  return res.download(await locale(documento.percorso), documento.nome_originale);
};

const eliminaDocumento = async (req, res) => {
  await ospitiService.eliminaDocumento(req.params.documentoId);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// Ospiti del soggiorno
// ─────────────────────────────────────

const diPrenotazione = async (req, res) => {
  const ospiti = await ospitiService.diPrenotazione(req.params.prenotazioneId);
  return inviaSuccesso(res, 200, ospiti);
};

const impostaDiPrenotazione = async (req, res) => {
  const ospiti = await ospitiService.impostaDiPrenotazione(
    req.params.prenotazioneId,
    req.body.ospiti,
    req.contesto,
  );
  return inviaSuccesso(res, 200, ospiti);
};

module.exports = {
  elenco,
  dettaglio,
  crea,
  aggiorna,
  elimina,
  aggiungiDocumento,
  scaricaDocumento,
  eliminaDocumento,
  diPrenotazione,
  impostaDiPrenotazione,
};
