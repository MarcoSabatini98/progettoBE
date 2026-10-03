// src/controllers/pulizie.controller.js
//
// Attività di pulizia, avanzamento con checklist e voci della checklist.

const pulizieService = require('../services/pulizie.service');
const { inviaSuccesso } = require('../utils/risposta');

// ─────────────────────────────────────
// Attività
// ─────────────────────────────────────

/** ?mie=true: solo le attività assegnate a chi chiama. */
const elenco = async (req, res) => {
  const attivita = await pulizieService.elenco(req.query, req.contesto);
  return inviaSuccesso(res, 200, attivita);
};

const dettaglio = async (req, res) => {
  const attivita = await pulizieService.dettaglio(req.params.id);
  return inviaSuccesso(res, 200, attivita);
};

const crea = async (req, res) => {
  const attivita = await pulizieService.crea(req.body, req.contesto);
  return inviaSuccesso(res, 201, attivita);
};

const aggiorna = async (req, res) => {
  const attivita = await pulizieService.aggiorna(req.params.id, req.body);
  return inviaSuccesso(res, 200, attivita);
};

const elimina = async (req, res) => {
  await pulizieService.elimina(req.params.id);
  return inviaSuccesso(res, 200, null);
};

/** Cambio di stato con la checklist spuntata (es. da in_corso a completata). */
const avanza = async (req, res) => {
  const attivita = await pulizieService.avanza(req.params.id, req.body, req.contesto);
  return inviaSuccesso(res, 200, attivita);
};

/** Riassetti delle camere occupate e checklist mancanti del giorno (predefinito oggi). */
const generaGiornata = async (req, res) => {
  const esito = await pulizieService.generaGiornata(req.body.giorno);
  return inviaSuccesso(res, 200, esito);
};

/** Addetti a cui assegnare le attività (chi gestisce le pulizie può non vedere gli utenti). */
const addetti = async (req, res) => {
  const squadra = await pulizieService.addetti();
  return inviaSuccesso(res, 200, squadra);
};

/** Distribuisce le attività libere del giorno tra gli addetti. */
const autoassegna = async (req, res) => {
  const esito = await pulizieService.autoassegna(req.body.giorno);
  return inviaSuccesso(res, 200, esito);
};

// ─────────────────────────────────────
// Checklist
// ─────────────────────────────────────

const vociChecklist = async (req, res) => {
  const voci = await pulizieService.vociChecklist();
  return inviaSuccesso(res, 200, voci);
};

const aggiungiVoce = async (req, res) => {
  const voce = await pulizieService.aggiungiVoce(req.body);
  return inviaSuccesso(res, 201, voce);
};

const aggiornaVoce = async (req, res) => {
  const voce = await pulizieService.aggiornaVoce(req.params.id, req.body);
  return inviaSuccesso(res, 200, voce);
};

const eliminaVoce = async (req, res) => {
  await pulizieService.eliminaVoce(req.params.id);
  return inviaSuccesso(res, 200, null);
};

module.exports = {
  elenco,
  dettaglio,
  crea,
  aggiorna,
  elimina,
  avanza,
  generaGiornata,
  addetti,
  autoassegna,
  vociChecklist,
  aggiungiVoce,
  aggiornaVoce,
  eliminaVoce,
};
