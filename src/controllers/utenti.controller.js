// src/controllers/utenti.controller.js
//
// Area personale del cliente (profilo, documenti) e gestione degli account
// dello staff da parte dell'admin.

const utentiService = require('../services/utenti.service');
const { inviaSuccesso } = require('../utils/risposta');
const { locale } = require('../utils/file');

// ─────────────────────────────────────
// Area personale
// ─────────────────────────────────────

const profilo = async (req, res) => {
  const utente = await utentiService.profilo(req.contesto.utenteId);
  return inviaSuccesso(res, 200, utente);
};

const aggiornaDatiPersonali = async (req, res) => {
  const utente = await utentiService.aggiornaDatiPersonali(req.contesto.utenteId, req.body);
  return inviaSuccesso(res, 200, utente);
};

const aggiornaPreferenzeEmail = async (req, res) => {
  const utente = await utentiService.aggiornaPreferenzeEmail(
    req.contesto.utenteId,
    req.body,
    req.contesto,
  );
  return inviaSuccesso(res, 200, utente);
};

const aggiungiDocumento = async (req, res) => {
  const documento = await utentiService.aggiungiDocumento(req.contesto.utenteId, req.file);
  return inviaSuccesso(res, 201, documento);
};

const scaricaDocumento = async (req, res) => {
  const documento = await utentiService.mioDocumento(req.contesto.utenteId, req.params.id);
  return res.download(await locale(documento.percorso), documento.nome_originale);
};

const eliminaDocumento = async (req, res) => {
  await utentiService.eliminaDocumento(req.contesto.utenteId, req.params.id);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// Account (admin)
// ─────────────────────────────────────

const elenco = async (req, res) => {
  const utenti = await utentiService.elenco(req.query);
  return inviaSuccesso(res, 200, utenti);
};

const dettaglio = async (req, res) => {
  const utente = await utentiService.dettaglio(req.params.id);
  return inviaSuccesso(res, 200, utente);
};

const elencoRuoli = async (req, res) => {
  const ruoli = await utentiService.elencoRuoli();
  return inviaSuccesso(res, 200, ruoli);
};

const creaStaff = async (req, res) => {
  const utente = await utentiService.creaStaff(req.body);
  return inviaSuccesso(res, 201, utente);
};

const aggiornaAccount = async (req, res) => {
  const utente = await utentiService.aggiornaAccount(req.params.id, req.body, req.contesto);
  return inviaSuccesso(res, 200, utente);
};

const elimina = async (req, res) => {
  await utentiService.elimina(req.params.id, req.contesto);
  return inviaSuccesso(res, 200, null);
};

module.exports = {
  profilo,
  aggiornaDatiPersonali,
  aggiornaPreferenzeEmail,
  aggiungiDocumento,
  scaricaDocumento,
  eliminaDocumento,
  elenco,
  dettaglio,
  elencoRuoli,
  creaStaff,
  aggiornaAccount,
  elimina,
};
