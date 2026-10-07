// src/controllers/disponibilita.controller.js
//
// Ricerca delle camere libere e blocco temporaneo durante il pagamento.
// La sessione è l'identificativo del percorso di prenotazione: la manda il
// frontend, o nasce qui al primo blocco e il frontend la riusa.

const disponibilitaService = require('../services/disponibilita.service');
const { inviaSuccesso } = require('../utils/risposta');
const { uuid } = require('../utils/sicurezza');

const cerca = async (req, res) => {
  const risultati = await disponibilitaService.cerca({
    arrivo: req.query.arrivo,
    partenza: req.query.partenza,
    adulti: req.query.adulti,
    bambini: req.query.bambini,
    etaBambini: req.query.eta_bambini,
    sessione: req.query.sessione,
    pianoId: req.query.piano_id,
    lingua: req.query.lingua,
    utenteId: req.contesto.utenteId,
  });
  return inviaSuccesso(res, 200, risultati);
};

const occupazione = async (req, res) => {
  const risultato = await disponibilitaService.occupazione({
    dal: req.query.dal,
    al: req.query.al,
    cameraId: req.query.camera_id,
    tipologiaId: req.query.tipologia_id,
    sessione: req.query.sessione,
  });
  return inviaSuccesso(res, 200, risultato);
};

const blocca = async (req, res) => {
  const blocco = await disponibilitaService.blocca({
    sessione: req.body.sessione ?? uuid(),
    cameraId: req.body.camera_id,
    tipologiaId: req.body.tipologia_id,
    arrivo: req.body.arrivo,
    partenza: req.body.partenza,
    ospiti: req.body.ospiti,
    utenteId: req.contesto.utenteId,
    visitatoreId: req.contesto.visitatoreId,
  });
  return inviaSuccesso(res, 201, blocco);
};

const rilascia = async (req, res) => {
  await disponibilitaService.rilascia(req.params.sessione);
  return inviaSuccesso(res, 200, null);
};

module.exports = {
  cerca,
  occupazione,
  blocca,
  rilascia,
};
