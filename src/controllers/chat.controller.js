// src/controllers/chat.controller.js
//
// Chat di assistenza (clienti e visitatori del sito con lo staff) e chat
// interna dello staff. Chi scrive è req.contesto: utente collegato oppure
// visitatore con il token della chat. I messaggi in tempo reale partono dal
// service (eventi) e li inoltra il socket.

const chatService = require('../services/chat.service');
const authService = require('../services/auth.service');
const { inviaSuccesso, inviaFile } = require('../utils/risposta');

// ─────────────────────────────────────
// Visitatori del sito
// ─────────────────────────────────────

/** Token per un visitatore senza account che apre la chat di assistenza. */
const creaVisitatore = async (req, res) => {
  const visitatore = await authService.creaVisitatore(req.body, req.contesto);
  return inviaSuccesso(res, 201, visitatore);
};

/** Il sito mostra se c'è qualcuno dello staff disponibile. */
const statoAssistenza = async (req, res) => {
  const stato = await chatService.statoAssistenza();
  return inviaSuccesso(res, 200, stato);
};

// ─────────────────────────────────────
// Conversazioni
// ─────────────────────────────────────

const elenco = async (req, res) => {
  const conversazioni = await chatService.elenco(req.contesto, req.query);
  return inviaSuccesso(res, 200, conversazioni);
};

const totaleNonLetti = async (req, res) => {
  const totali = await chatService.totaleNonLetti(req.contesto);
  return inviaSuccesso(res, 200, totali);
};

const dettaglio = async (req, res) => {
  const conversazione = await chatService.dettaglio(req.params.uuid, req.contesto);
  return inviaSuccesso(res, 200, conversazione);
};

const apriAssistenza = async (req, res) => {
  const conversazione = await chatService.apriAssistenza(req.contesto, req.body);
  return inviaSuccesso(res, 201, conversazione);
};

/** Lo staff con cui si può aprire una chat interna. */
const colleghi = async (req, res) => {
  const staff = await chatService.colleghi(req.contesto);
  return inviaSuccesso(res, 200, staff);
};

const apriStaff = async (req, res) => {
  const conversazione = await chatService.apriStaff(req.contesto, req.body);
  return inviaSuccesso(res, 201, conversazione);
};

const segnaLetto = async (req, res) => {
  await chatService.segnaLetto(req.params.uuid, req.contesto);
  return inviaSuccesso(res, 200, null);
};

const assegna = async (req, res) => {
  const conversazione = await chatService.assegna(
    req.params.uuid,
    req.contesto,
    req.body.utente_id,
  );
  return inviaSuccesso(res, 200, conversazione);
};

const impostaStato = async (req, res) => {
  const conversazione = await chatService.impostaStato(
    req.params.uuid,
    req.contesto,
    req.body.stato,
  );
  return inviaSuccesso(res, 200, conversazione);
};

const aggiungiPartecipante = async (req, res) => {
  const conversazione = await chatService.aggiungiPartecipante(
    req.params.uuid,
    req.contesto,
    req.body.utente_id,
  );
  return inviaSuccesso(res, 200, conversazione);
};

const rinominaGruppo = async (req, res) => {
  const conversazione = await chatService.rinominaGruppo(
    req.params.uuid,
    req.contesto,
    req.body.titolo,
  );
  return inviaSuccesso(res, 200, conversazione);
};

const esci = async (req, res) => {
  await chatService.esci(req.params.uuid, req.contesto);
  return inviaSuccesso(res, 200, null);
};

const esportaPdf = async (req, res) => {
  const pdf = await chatService.esportaPdf(req.params.uuid, req.contesto);
  return inviaFile(res, {
    nome: `chat_${req.params.uuid}.pdf`,
    tipo: 'application/pdf',
    contenuto: pdf,
  });
};

// ─────────────────────────────────────
// Messaggi
// ─────────────────────────────────────

/** Pagine all'indietro: ?prima_di=<id messaggio>. */
const messaggi = async (req, res) => {
  const trovati = await chatService.messaggi(req.params.uuid, req.contesto, req.query);
  return inviaSuccesso(res, 200, trovati);
};

/** req.files: allegati ricevuti da multer (opzionali). */
const invia = async (req, res) => {
  const messaggio = await chatService.invia(
    req.params.uuid,
    req.contesto,
    req.body,
    req.files ?? [],
  );
  return inviaSuccesso(res, 201, messaggio);
};

const modificaMessaggio = async (req, res) => {
  const messaggio = await chatService.modificaMessaggio(
    req.params.id,
    req.contesto,
    req.body.testo,
  );
  return inviaSuccesso(res, 200, messaggio);
};

const eliminaMessaggio = async (req, res) => {
  await chatService.eliminaMessaggio(req.params.id, req.contesto);
  return inviaSuccesso(res, 200, null);
};

const scaricaAllegato = async (req, res) => {
  const { percorso, nome } = await chatService.allegato(req.params.id, req.contesto);
  return res.download(percorso, nome);
};

module.exports = {
  creaVisitatore,
  statoAssistenza,
  elenco,
  totaleNonLetti,
  dettaglio,
  apriAssistenza,
  colleghi,
  apriStaff,
  segnaLetto,
  assegna,
  impostaStato,
  aggiungiPartecipante,
  rinominaGruppo,
  esci,
  esportaPdf,
  messaggi,
  invia,
  modificaMessaggio,
  eliminaMessaggio,
  scaricaAllegato,
};
