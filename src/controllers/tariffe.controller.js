// src/controllers/tariffe.controller.js
//
// Preventivo per il sito e gestione di piani tariffari, periodi, promozioni,
// codici sconto, pacchetti e tassa di soggiorno.

const tariffeService = require('../services/tariffe.service');
const { inviaSuccesso } = require('../utils/risposta');

// ─────────────────────────────────────
// Sito pubblico
// ─────────────────────────────────────

const preventivo = async (req, res) => {
  const calcolo = await tariffeService.preventivo({
    tipologiaId: req.body.tipologia_id,
    arrivo: req.body.arrivo,
    partenza: req.body.partenza,
    adulti: req.body.adulti,
    bambini: req.body.bambini,
    etaBambini: req.body.eta_bambini,
    pianoId: req.body.piano_id,
    codiceSconto: req.body.codice_sconto,
    pacchettoId: req.body.pacchetto_id,
    servizi: req.body.servizi,
    utenteId: req.contesto.utenteId,
  });
  return inviaSuccesso(res, 200, calcolo);
};

// Al sito basta sapere cosa vale il codice: contatori e limiti restano interni.
const verificaCodiceSconto = async (req, res) => {
  const codice = await tariffeService.codiceValido(req.body.codice, req.contesto.utenteId);
  return inviaSuccesso(res, 200, {
    codice: codice.codice,
    descrizione: codice.descrizione,
    tipo_sconto: codice.tipo_sconto,
    valore: codice.valore,
    importo_minimo: codice.importo_minimo,
    notti_min: codice.notti_min,
  });
};

const promozioniPubbliche = async (req, res) => {
  const promozioni = await tariffeService.promozioniPubbliche(req.query.lingua);
  return inviaSuccesso(res, 200, promozioni);
};

const pacchettiPubblici = async (req, res) => {
  const pacchetti = await tariffeService.pacchettiPubblici(req.query.lingua);
  return inviaSuccesso(res, 200, pacchetti);
};

// ─────────────────────────────────────
// Piani tariffari
// ─────────────────────────────────────

const elencoPiani = async (req, res) => {
  const piani = await tariffeService.elencoPiani(req.query);
  return inviaSuccesso(res, 200, piani);
};

const dettaglioPiano = async (req, res) => {
  const piano = await tariffeService.dettaglioPiano(req.params.id);
  return inviaSuccesso(res, 200, piano);
};

const creaPiano = async (req, res) => {
  const piano = await tariffeService.creaPiano(req.body);
  return inviaSuccesso(res, 201, piano);
};

const aggiornaPiano = async (req, res) => {
  const piano = await tariffeService.aggiornaPiano(req.params.id, req.body);
  return inviaSuccesso(res, 200, piano);
};

const eliminaPiano = async (req, res) => {
  await tariffeService.eliminaPiano(req.params.id);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// Periodi (stagioni e prezzi per data)
// ─────────────────────────────────────

const elencoPeriodi = async (req, res) => {
  const periodi = await tariffeService.elencoPeriodi(req.query);
  return inviaSuccesso(res, 200, periodi);
};

const dettaglioPeriodo = async (req, res) => {
  const periodo = await tariffeService.dettaglioPeriodo(req.params.id);
  return inviaSuccesso(res, 200, periodo);
};

const creaPeriodo = async (req, res) => {
  const periodo = await tariffeService.creaPeriodo(req.body, req.contesto);
  return inviaSuccesso(res, 201, periodo);
};

const aggiornaPeriodo = async (req, res) => {
  const periodo = await tariffeService.aggiornaPeriodo(req.params.id, req.body, req.contesto);
  return inviaSuccesso(res, 200, periodo);
};

const eliminaPeriodo = async (req, res) => {
  await tariffeService.eliminaPeriodo(req.params.id);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// Promozioni
// ─────────────────────────────────────

const elencoPromozioni = async (req, res) => {
  const promozioni = await tariffeService.elencoPromozioni(req.query);
  return inviaSuccesso(res, 200, promozioni);
};

const dettaglioPromozione = async (req, res) => {
  const promozione = await tariffeService.dettaglioPromozione(req.params.id);
  return inviaSuccesso(res, 200, promozione);
};

const creaPromozione = async (req, res) => {
  const promozione = await tariffeService.creaPromozione(req.body, req.contesto);
  return inviaSuccesso(res, 201, promozione);
};

const aggiornaPromozione = async (req, res) => {
  const promozione = await tariffeService.aggiornaPromozione(req.params.id, req.body);
  return inviaSuccesso(res, 200, promozione);
};

const eliminaPromozione = async (req, res) => {
  await tariffeService.eliminaPromozione(req.params.id);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// Codici sconto
// ─────────────────────────────────────

const elencoCodiciSconto = async (req, res) => {
  const codici = await tariffeService.elencoCodiciSconto(req.query);
  return inviaSuccesso(res, 200, codici);
};

const dettaglioCodiceSconto = async (req, res) => {
  const codice = await tariffeService.dettaglioCodiceSconto(req.params.id);
  return inviaSuccesso(res, 200, codice);
};

const creaCodiceSconto = async (req, res) => {
  const codice = await tariffeService.creaCodiceSconto(req.body, req.contesto);
  return inviaSuccesso(res, 201, codice);
};

const aggiornaCodiceSconto = async (req, res) => {
  const codice = await tariffeService.aggiornaCodiceSconto(req.params.id, req.body);
  return inviaSuccesso(res, 200, codice);
};

const eliminaCodiceSconto = async (req, res) => {
  await tariffeService.eliminaCodiceSconto(req.params.id);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// Pacchetti
// ─────────────────────────────────────

const elencoPacchetti = async (req, res) => {
  const pacchetti = await tariffeService.elencoPacchetti(req.query);
  return inviaSuccesso(res, 200, pacchetti);
};

const dettaglioPacchetto = async (req, res) => {
  const pacchetto = await tariffeService.dettaglioPacchetto(req.params.id);
  return inviaSuccesso(res, 200, pacchetto);
};

const creaPacchetto = async (req, res) => {
  const pacchetto = await tariffeService.creaPacchetto(req.body);
  return inviaSuccesso(res, 201, pacchetto);
};

const aggiornaPacchetto = async (req, res) => {
  const pacchetto = await tariffeService.aggiornaPacchetto(req.params.id, req.body);
  return inviaSuccesso(res, 200, pacchetto);
};

const eliminaPacchetto = async (req, res) => {
  await tariffeService.eliminaPacchetto(req.params.id);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// Tassa di soggiorno
// ─────────────────────────────────────

const elencoTasse = async (req, res) => {
  const tasse = await tariffeService.elencoTasse();
  return inviaSuccesso(res, 200, tasse);
};

const dettaglioTassa = async (req, res) => {
  const tassa = await tariffeService.dettaglioTassa(req.params.id);
  return inviaSuccesso(res, 200, tassa);
};

const creaTassa = async (req, res) => {
  const tassa = await tariffeService.creaTassa(req.body);
  return inviaSuccesso(res, 201, tassa);
};

const aggiornaTassa = async (req, res) => {
  const tassa = await tariffeService.aggiornaTassa(req.params.id, req.body);
  return inviaSuccesso(res, 200, tassa);
};

const eliminaTassa = async (req, res) => {
  await tariffeService.eliminaTassa(req.params.id);
  return inviaSuccesso(res, 200, null);
};

module.exports = {
  preventivo,
  verificaCodiceSconto,
  promozioniPubbliche,
  pacchettiPubblici,
  elencoPiani,
  dettaglioPiano,
  creaPiano,
  aggiornaPiano,
  eliminaPiano,
  elencoPeriodi,
  dettaglioPeriodo,
  creaPeriodo,
  aggiornaPeriodo,
  eliminaPeriodo,
  elencoPromozioni,
  dettaglioPromozione,
  creaPromozione,
  aggiornaPromozione,
  eliminaPromozione,
  elencoCodiciSconto,
  dettaglioCodiceSconto,
  creaCodiceSconto,
  aggiornaCodiceSconto,
  eliminaCodiceSconto,
  elencoPacchetti,
  dettaglioPacchetto,
  creaPacchetto,
  aggiornaPacchetto,
  eliminaPacchetto,
  elencoTasse,
  dettaglioTassa,
  creaTassa,
  aggiornaTassa,
  eliminaTassa,
};
