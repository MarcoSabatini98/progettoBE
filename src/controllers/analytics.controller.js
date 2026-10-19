// src/controllers/analytics.controller.js
//
// Statistiche per l'admin: occupazione, ricavi, incassi, tassa di soggiorno,
// canali di vendita, cruscotto del giorno, suggerimenti di prezzo e report PDF.
// Il periodo arriva in query (?dal=&al= oppure ?anno=).

const analyticsService = require('../services/analytics.service');
const { inviaSuccesso, inviaFile } = require('../utils/risposta');
const { oggi } = require('../utils/date');

const occupazione = async (req, res) => {
  const dati = await analyticsService.occupazione(req.query);
  return inviaSuccesso(res, 200, dati);
};

const ricavi = async (req, res) => {
  const dati = await analyticsService.ricavi(req.query);
  return inviaSuccesso(res, 200, dati);
};

const incassi = async (req, res) => {
  const dati = await analyticsService.incassi(req.query);
  return inviaSuccesso(res, 200, dati);
};

const tassaSoggiorno = async (req, res) => {
  const dati = await analyticsService.tassaSoggiorno(req.query);
  return inviaSuccesso(res, 200, dati);
};

const canali = async (req, res) => {
  const dati = await analyticsService.canali(req.query);
  return inviaSuccesso(res, 200, dati);
};

const cruscotto = async (req, res) => {
  const dati = await analyticsService.cruscotto();
  return inviaSuccesso(res, 200, dati);
};

const suggerimentiPrezzo = async (req, res) => {
  const suggerimenti = await analyticsService.suggerimentiPrezzo(req.query);
  return inviaSuccesso(res, 200, suggerimenti);
};

const reportPdf = async (req, res) => {
  const pdf = await analyticsService.reportPdf(req.query);
  return inviaFile(res, {
    nome: `report_${oggi()}.pdf`,
    tipo: 'application/pdf',
    contenuto: pdf,
  });
};

module.exports = {
  occupazione,
  ricavi,
  incassi,
  tassaSoggiorno,
  canali,
  cruscotto,
  suggerimentiPrezzo,
  reportPdf,
};
