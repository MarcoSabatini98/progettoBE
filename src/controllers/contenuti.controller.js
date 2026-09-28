// src/controllers/contenuti.controller.js
//
// Contenuti del sito: traduzioni e immagini di ogni entità (tipologie,
// servizi, pacchetti...), FAQ, documenti legali ed eventi in zona.

const contenutiService = require('../services/contenuti.service');
const { inviaSuccesso } = require('../utils/risposta');

// ─────────────────────────────────────
// Sito pubblico
// ─────────────────────────────────────

const faqPubbliche = async (req, res) => {
  const faq = await contenutiService.faqPubbliche(req.query.lingua);
  return inviaSuccesso(res, 200, faq);
};

/** Privacy, termini, cookie: la versione in vigore nella lingua richiesta. */
const documentoLegaleVigente = async (req, res) => {
  const documento = await contenutiService.documentoLegaleVigente(
    req.params.tipo,
    req.query.lingua,
  );
  return inviaSuccesso(res, 200, documento);
};

// ─────────────────────────────────────
// Traduzioni
// ─────────────────────────────────────

const traduzioniDi = async (req, res) => {
  const traduzioni = await contenutiService.traduzioniDi(req.params.entita, req.params.entitaId);
  return inviaSuccesso(res, 200, traduzioni);
};

/** body: { en: { nome, descrizione }, de: { ... } } */
const salvaTraduzioni = async (req, res) => {
  const traduzioni = await contenutiService.salvaTraduzioni(
    req.params.entita,
    req.params.entitaId,
    req.body,
  );
  return inviaSuccesso(res, 200, traduzioni);
};

// ─────────────────────────────────────
// Immagini
// ─────────────────────────────────────

/** ?entita=tipologia&entita_id=3 (senza entita_id: le immagini generali di quell'entità). */
const elencoMedia = async (req, res) => {
  const media = await contenutiService.elencoMedia(req.query.entita, req.query.entita_id);
  return inviaSuccesso(res, 200, media);
};

const aggiungiMedia = async (req, res) => {
  const media = await contenutiService.aggiungiMedia(
    {
      entita: req.body.entita,
      entitaId: req.body.entita_id,
      testoAlternativo: req.body.testo_alternativo,
      ordine: req.body.ordine,
    },
    req.file,
  );
  return inviaSuccesso(res, 201, media);
};

const aggiornaMedia = async (req, res) => {
  const media = await contenutiService.aggiornaMedia(req.params.id, req.body);
  return inviaSuccesso(res, 200, media);
};

/** body.ids: id delle immagini nell'ordine voluto. */
const riordinaMedia = async (req, res) => {
  await contenutiService.riordinaMedia(req.body.ids);
  return inviaSuccesso(res, 200, null);
};

const eliminaMedia = async (req, res) => {
  await contenutiService.eliminaMedia(req.params.id);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// FAQ
// ─────────────────────────────────────

const elencoFaq = async (req, res) => {
  const faq = await contenutiService.elencoFaq(req.query);
  return inviaSuccesso(res, 200, faq);
};

const dettaglioFaq = async (req, res) => {
  const faq = await contenutiService.dettaglioFaq(req.params.id);
  return inviaSuccesso(res, 200, faq);
};

const creaFaq = async (req, res) => {
  const faq = await contenutiService.creaFaq(req.body, req.contesto);
  return inviaSuccesso(res, 201, faq);
};

const aggiornaFaq = async (req, res) => {
  const faq = await contenutiService.aggiornaFaq(req.params.id, req.body, req.contesto);
  return inviaSuccesso(res, 200, faq);
};

const eliminaFaq = async (req, res) => {
  await contenutiService.eliminaFaq(req.params.id);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// Documenti legali
// ─────────────────────────────────────

const elencoDocumentiLegali = async (req, res) => {
  const documenti = await contenutiService.elencoDocumentiLegali(req.query);
  return inviaSuccesso(res, 200, documenti);
};

const dettaglioDocumentoLegale = async (req, res) => {
  const documento = await contenutiService.dettaglioDocumentoLegale(req.params.id);
  return inviaSuccesso(res, 200, documento);
};

const creaDocumentoLegale = async (req, res) => {
  const documento = await contenutiService.creaDocumentoLegale(req.body, req.contesto);
  return inviaSuccesso(res, 201, documento);
};

const aggiornaDocumentoLegale = async (req, res) => {
  const documento = await contenutiService.aggiornaDocumentoLegale(req.params.id, req.body);
  return inviaSuccesso(res, 200, documento);
};

const pubblicaDocumentoLegale = async (req, res) => {
  const documento = await contenutiService.pubblicaDocumentoLegale(req.params.id);
  return inviaSuccesso(res, 200, documento);
};

const eliminaDocumentoLegale = async (req, res) => {
  await contenutiService.eliminaDocumentoLegale(req.params.id);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// Eventi in zona (pesano sui suggerimenti di prezzo)
// ─────────────────────────────────────

const elencoEventi = async (req, res) => {
  const eventi = await contenutiService.elencoEventi(req.query);
  return inviaSuccesso(res, 200, eventi);
};

const dettaglioEvento = async (req, res) => {
  const evento = await contenutiService.dettaglioEvento(req.params.id);
  return inviaSuccesso(res, 200, evento);
};

const creaEvento = async (req, res) => {
  const evento = await contenutiService.creaEvento(req.body);
  return inviaSuccesso(res, 201, evento);
};

const aggiornaEvento = async (req, res) => {
  const evento = await contenutiService.aggiornaEvento(req.params.id, req.body);
  return inviaSuccesso(res, 200, evento);
};

const eliminaEvento = async (req, res) => {
  await contenutiService.eliminaEvento(req.params.id);
  return inviaSuccesso(res, 200, null);
};

module.exports = {
  faqPubbliche,
  documentoLegaleVigente,
  traduzioniDi,
  salvaTraduzioni,
  elencoMedia,
  aggiungiMedia,
  aggiornaMedia,
  riordinaMedia,
  eliminaMedia,
  elencoFaq,
  dettaglioFaq,
  creaFaq,
  aggiornaFaq,
  eliminaFaq,
  elencoDocumentiLegali,
  dettaglioDocumentoLegale,
  creaDocumentoLegale,
  aggiornaDocumentoLegale,
  pubblicaDocumentoLegale,
  eliminaDocumentoLegale,
  elencoEventi,
  dettaglioEvento,
  creaEvento,
  aggiornaEvento,
  eliminaEvento,
};
