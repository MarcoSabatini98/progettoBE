// src/controllers/alloggiati.controller.js
//
// Schedine per il portale Alloggiati Web della Polizia di Stato: controllo
// dei dati degli ospiti, file da caricare sul portale e registro degli invii.

const alloggiatiService = require('../services/alloggiati.service');
const { inviaSuccesso, inviaFile } = require('../utils/risposta');

/** Pubblica: serve anche al check-in online e al profilo del cliente. */
const luoghi = async (req, res) => {
  const trovati = await alloggiatiService.cercaLuoghi(req.query);
  return inviaSuccesso(res, 200, trovati);
};

/** Schedine di una prenotazione, con i campi mancanti per ogni ospite. */
const daPrenotazione = async (req, res) => {
  const scheda = await alloggiatiService.daPrenotazione(req.params.prenotazioneId);
  return inviaSuccesso(res, 200, scheda);
};

/** body.prenotazioni: id delle prenotazioni da mettere nello stesso file. */
const file = async (req, res) => {
  const { nome, contenuto } = await alloggiatiService.file(req.body.prenotazioni);
  return inviaFile(res, { nome, tipo: 'text/plain', contenuto });
};

const registraInvio = async (req, res) => {
  const scheda = await alloggiatiService.registraInvio(
    req.params.prenotazioneId,
    req.body,
    req.contesto,
  );
  return inviaSuccesso(res, 201, scheda);
};

/** Promemoria per la reception: soggiorni iniziati senza invio riuscito. */
const daInviare = async (req, res) => {
  const soggiorni = await alloggiatiService.daInviare();
  return inviaSuccesso(res, 200, soggiorni);
};

module.exports = {
  luoghi,
  daPrenotazione,
  file,
  registraInvio,
  daInviare,
};
