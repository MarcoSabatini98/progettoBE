// src/controllers/impostazioni.controller.js
//
// Impostazioni della struttura: quelle pubbliche servono al sito (nome,
// contatti, lingue), tutte le altre solo all'admin.

const impostazioniService = require('../services/impostazioni.service');
const { inviaSuccesso } = require('../utils/risposta');

const pubbliche = async (req, res) => {
  const impostazioni = await impostazioniService.pubbliche();
  return inviaSuccesso(res, 200, impostazioni);
};

const elenco = async (req, res) => {
  const impostazioni = await impostazioniService.elenco();
  return inviaSuccesso(res, 200, impostazioni);
};

/** body: { chiave: valore, ... } solo le impostazioni da cambiare. */
const aggiorna = async (req, res) => {
  const impostazioni = await impostazioniService.aggiorna(req.body, req.contesto);
  return inviaSuccesso(res, 200, impostazioni);
};

module.exports = {
  pubbliche,
  elenco,
  aggiorna,
};
