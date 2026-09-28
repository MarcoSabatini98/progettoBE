// src/controllers/prenotazioni.controller.js
//
// Prenotazioni: dal sito (cliente registrato o ospite senza account), dall'area
// personale, dal check-in online e dal gestionale dello staff.

const prenotazioniService = require('../services/prenotazioni.service');
const { inviaSuccesso } = require('../utils/risposta');

// ─────────────────────────────────────
// Sito e area personale
// ─────────────────────────────────────

// Anche lo staff crea da qui (telefono, walk-in): il service distingue dal ruolo.
const crea = async (req, res) => {
  const prenotazione = await prenotazioniService.crea(req.body, req.contesto);
  return inviaSuccesso(res, 201, prenotazione);
};

const mie = async (req, res) => {
  const prenotazioni = await prenotazioniService.mie(req.contesto.utenteId, req.query);
  return inviaSuccesso(res, 200, prenotazioni);
};

const mia = async (req, res) => {
  const prenotazione = await prenotazioniService.mia(req.contesto.utenteId, req.params.id);
  return inviaSuccesso(res, 200, prenotazione);
};

// POST e non GET: l'email non deve finire negli URL e nei log.
const perCodice = async (req, res) => {
  const prenotazione = await prenotazioniService.perCodice(req.body.codice, req.body.email);
  return inviaSuccesso(res, 200, prenotazione);
};

const anteprimaCancellazione = async (req, res) => {
  const anteprima = await prenotazioniService.anteprimaCancellazione(req.params.id, req.contesto);
  return inviaSuccesso(res, 200, anteprima);
};

const cancella = async (req, res) => {
  const prenotazione = await prenotazioniService.cancella(req.params.id, req.body, req.contesto);
  return inviaSuccesso(res, 200, prenotazione);
};

// ─────────────────────────────────────
// Check-in online (link con token inviato all'ospite)
// ─────────────────────────────────────

const datiCheckinOnline = async (req, res) => {
  const dati = await prenotazioniService.datiCheckinOnline(req.params.token);
  return inviaSuccesso(res, 200, dati);
};

const checkinOnline = async (req, res) => {
  const esito = await prenotazioniService.checkinOnline(
    req.params.token,
    req.body.ospiti,
    req.contesto.ip,
  );
  return inviaSuccesso(res, 200, esito);
};

// ─────────────────────────────────────
// Staff
// ─────────────────────────────────────

const elenco = async (req, res) => {
  const prenotazioni = await prenotazioniService.elenco(req.query);
  return inviaSuccesso(res, 200, prenotazioni);
};

/** Arrivi, partenze e presenti del giorno (?giorno=, predefinito oggi). */
const giornata = async (req, res) => {
  const situazione = await prenotazioniService.giornata(req.query.giorno);
  return inviaSuccesso(res, 200, situazione);
};

const dettaglio = async (req, res) => {
  const prenotazione = await prenotazioniService.dettaglio(req.params.id);
  return inviaSuccesso(res, 200, prenotazione);
};

const modifica = async (req, res) => {
  const prenotazione = await prenotazioniService.modifica(req.params.id, req.body, req.contesto);
  return inviaSuccesso(res, 200, prenotazione);
};

const conferma = async (req, res) => {
  const prenotazione = await prenotazioniService.conferma(req.params.id, req.contesto);
  return inviaSuccesso(res, 200, prenotazione);
};

const checkIn = async (req, res) => {
  const prenotazione = await prenotazioniService.checkIn(req.params.id, req.contesto);
  return inviaSuccesso(res, 200, prenotazione);
};

const checkOut = async (req, res) => {
  const prenotazione = await prenotazioniService.checkOut(req.params.id, req.body, req.contesto);
  return inviaSuccesso(res, 200, prenotazione);
};

const noShow = async (req, res) => {
  const prenotazione = await prenotazioniService.noShow(req.params.id, req.contesto);
  return inviaSuccesso(res, 200, prenotazione);
};

const linkCheckin = async (req, res) => {
  const link = await prenotazioniService.linkCheckin(req.params.id);
  return inviaSuccesso(res, 200, link);
};

const aggiungiServizio = async (req, res) => {
  const prenotazione = await prenotazioniService.aggiungiServizio(
    req.params.id,
    req.body,
    req.contesto,
  );
  return inviaSuccesso(res, 201, prenotazione);
};

const rimuoviServizio = async (req, res) => {
  const prenotazione = await prenotazioniService.rimuoviServizio(
    req.params.id,
    req.params.servizioId,
    req.contesto,
  );
  return inviaSuccesso(res, 200, prenotazione);
};

module.exports = {
  crea,
  mie,
  mia,
  perCodice,
  anteprimaCancellazione,
  cancella,
  datiCheckinOnline,
  checkinOnline,
  elenco,
  giornata,
  dettaglio,
  modifica,
  conferma,
  checkIn,
  checkOut,
  noShow,
  linkCheckin,
  aggiungiServizio,
  rimuoviServizio,
};
