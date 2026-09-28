// src/controllers/pagamenti.controller.js
//
// Incassi registrati dalla struttura (bonifico, contanti, POS), pagamenti
// online con Stripe e PayPal, rimborsi e webhook dei provider.

const pagamentiService = require('../services/pagamenti.service');
const prenotazioniService = require('../services/prenotazioni.service');
const { inviaSuccesso } = require('../utils/risposta');

// ─────────────────────────────────────
// Cliente e ospite senza account
// ─────────────────────────────────────

// Il cliente vede e paga solo le sue prenotazioni: mia() lo verifica.
const riepilogoMio = async (req, res) => {
  const prenotazione = await prenotazioniService.mia(req.contesto.utenteId, req.params.id);
  const situazione = await pagamentiService.riepilogo(prenotazione.id);
  return inviaSuccesso(res, 200, situazione);
};

// Senza importo si paga quanto dovuto ora (acconto o saldo).
const pagaMia = async (req, res) => {
  const prenotazione = await prenotazioniService.mia(req.contesto.utenteId, req.params.id);
  const checkout = await pagamentiService.avviaOnline(
    prenotazione.id,
    { metodo: req.body.metodo, importo: req.body.importo },
    req.contesto,
  );
  return inviaSuccesso(res, 201, checkout);
};

// Chi ha prenotato senza account si riconosce con codice + email del titolare.
const riepilogoPerCodice = async (req, res) => {
  const prenotazione = await prenotazioniService.perCodice(req.body.codice, req.body.email);
  const situazione = await pagamentiService.riepilogo(prenotazione.id);
  return inviaSuccesso(res, 200, situazione);
};

const pagaPerCodice = async (req, res) => {
  const prenotazione = await prenotazioniService.perCodice(req.body.codice, req.body.email);
  const checkout = await pagamentiService.avviaOnline(
    prenotazione.id,
    { metodo: req.body.metodo, importo: req.body.importo },
    req.contesto,
  );
  return inviaSuccesso(res, 201, checkout);
};

// PayPal rimanda al sito con ?token=<id ordine>: il frontend lo gira qui.
const catturaPaypal = async (req, res) => {
  const pagamento = await pagamentiService.catturaPaypal(req.body.token);
  return inviaSuccesso(res, 200, pagamento);
};

// ─────────────────────────────────────
// Webhook
// ─────────────────────────────────────

// Stripe firma il corpo esatto: la rotta deve ricevere il Buffer grezzo (express.raw).
const webhookStripe = async (req, res) => {
  await pagamentiService.webhookStripe(req.body, req.get('stripe-signature'));
  return inviaSuccesso(res, 200, { ricevuto: true });
};

const webhookPaypal = async (req, res) => {
  await pagamentiService.webhookPaypal(req.headers, req.body);
  return inviaSuccesso(res, 200, { ricevuto: true });
};

// ─────────────────────────────────────
// Staff
// ─────────────────────────────────────

const elenco = async (req, res) => {
  const pagamenti = await pagamentiService.elenco(req.query);
  return inviaSuccesso(res, 200, pagamenti);
};

const diPrenotazione = async (req, res) => {
  const pagamenti = await pagamentiService.diPrenotazione(req.params.prenotazioneId);
  return inviaSuccesso(res, 200, pagamenti);
};

const riepilogo = async (req, res) => {
  const situazione = await pagamentiService.riepilogo(req.params.prenotazioneId);
  return inviaSuccesso(res, 200, situazione);
};

const registra = async (req, res) => {
  const pagamento = await pagamentiService.registra(
    req.params.prenotazioneId,
    req.body,
    req.contesto,
  );
  return inviaSuccesso(res, 201, pagamento);
};

// Link di pagamento creato dallo staff (anche inviato per email all'ospite).
const avviaOnline = async (req, res) => {
  const checkout = await pagamentiService.avviaOnline(
    req.params.prenotazioneId,
    req.body,
    req.contesto,
  );
  return inviaSuccesso(res, 201, checkout);
};

const annulla = async (req, res) => {
  const pagamento = await pagamentiService.annulla(req.params.id, req.body.motivo, req.contesto);
  return inviaSuccesso(res, 200, pagamento);
};

const rimborsa = async (req, res) => {
  const rimborso = await pagamentiService.rimborsa(req.params.id, req.body, req.contesto);
  return inviaSuccesso(res, 201, rimborso);
};

module.exports = {
  riepilogoMio,
  pagaMia,
  riepilogoPerCodice,
  pagaPerCodice,
  catturaPaypal,
  webhookStripe,
  webhookPaypal,
  elenco,
  diPrenotazione,
  riepilogo,
  registra,
  avviaOnline,
  annulla,
  rimborsa,
};
