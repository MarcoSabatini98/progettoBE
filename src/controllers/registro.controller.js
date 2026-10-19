// src/controllers/registro.controller.js
//
// Registro delle modifiche (scritto dai trigger del DB): elenco filtrabile e
// storia di un singolo record.

const registroService = require('../services/registro.service');
const { inviaSuccesso } = require('../utils/risposta');

/** ?tabella=&record_id=&utente_id=&azione=&dal=&al= più la paginazione. */
const elenco = async (req, res) => {
  const attivita = await registroService.elenco(req.query);
  return inviaSuccesso(res, 200, attivita);
};

/** es. /registro/prenotazioni/42: tutte le modifiche alla prenotazione 42. */
const storia = async (req, res) => {
  const attivita = await registroService.storia(req.params.tabella, req.params.id, req.query);
  return inviaSuccesso(res, 200, attivita);
};

module.exports = {
  elenco,
  storia,
};
