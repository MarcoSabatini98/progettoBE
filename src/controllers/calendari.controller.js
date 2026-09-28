// src/controllers/calendari.controller.js
//
// Chiusure delle camere (manutenzione, uso privato), feed iCal verso le OTA
// e calendari esterni (Booking, Airbnb...) importati per evitare overbooking.

const calendariService = require('../services/calendari.service');
const { inviaSuccesso, inviaFile } = require('../utils/risposta');

// ─────────────────────────────────────
// Chiusure
// ─────────────────────────────────────

const chiusure = async (req, res) => {
  const trovate = await calendariService.chiusure(req.query);
  return inviaSuccesso(res, 200, trovate);
};

const blocca = async (req, res) => {
  const chiusura = await calendariService.blocca(req.body, req.contesto);
  return inviaSuccesso(res, 201, chiusura);
};

const aggiornaBlocco = async (req, res) => {
  const chiusura = await calendariService.aggiornaBlocco(req.params.id, req.body);
  return inviaSuccesso(res, 200, chiusura);
};

const sblocca = async (req, res) => {
  await calendariService.sblocca(req.params.id);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// Esportazione verso le OTA
// ─────────────────────────────────────

/** Link pubblico con il token della camera: lo leggono le OTA, non il frontend. */
const feed = async (req, res) => {
  const ics = await calendariService.feed(req.params.token);
  return inviaFile(res, {
    nome: 'calendario.ics',
    tipo: 'text/calendar',
    contenuto: ics,
    inLinea: true,
  });
};

const linkEsportazione = async (req, res) => {
  const link = await calendariService.linkEsportazione();
  return inviaSuccesso(res, 200, link);
};

// ─────────────────────────────────────
// Calendari esterni
// ─────────────────────────────────────

const elencoCalendari = async (req, res) => {
  const calendari = await calendariService.elencoCalendari();
  return inviaSuccesso(res, 200, calendari);
};

const dettaglioCalendario = async (req, res) => {
  const calendario = await calendariService.dettaglioCalendario(req.params.id);
  return inviaSuccesso(res, 200, calendario);
};

const creaCalendario = async (req, res) => {
  const calendario = await calendariService.creaCalendario(req.body);
  return inviaSuccesso(res, 201, calendario);
};

const aggiornaCalendario = async (req, res) => {
  const calendario = await calendariService.aggiornaCalendario(req.params.id, req.body);
  return inviaSuccesso(res, 200, calendario);
};

const eliminaCalendario = async (req, res) => {
  await calendariService.eliminaCalendario(req.params.id);
  return inviaSuccesso(res, 200, null);
};

/** Sincronizzazione immediata (oltre a quella periodica del job). */
const sincronizza = async (req, res) => {
  const esito = await calendariService.sincronizza(req.params.id);
  return inviaSuccesso(res, 200, esito);
};

module.exports = {
  chiusure,
  blocca,
  aggiornaBlocco,
  sblocca,
  feed,
  linkEsportazione,
  elencoCalendari,
  dettaglioCalendario,
  creaCalendario,
  aggiornaCalendario,
  eliminaCalendario,
  sincronizza,
};
