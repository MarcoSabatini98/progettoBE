// src/repositories/auth.repository.js
//
// Token degli utenti (refresh, verifica email, reset password), consensi
// dati alla registrazione e visitatori anonimi della chat.
// Nel DB c'è solo l'impronta dei token, mai il token in chiaro.

const { Op } = require('sequelize');
const { TokenUtente, Visitatore, Consenso, DocumentoLegale } = require('../models');

// ─────────────────────────────────────
// Token
// ─────────────────────────────────────

const trovaToken = async (impronta, tipo) => {
  return await TokenUtente.findOne({ where: { hash_token: impronta, tipo } });
};

// Token ancora utilizzabile: non usato, non revocato, non scaduto.
const trovaTokenValido = async (where) => {
  return await TokenUtente.findOne({
    where: {
      ...where,
      usato_il: null,
      revocato_il: null,
      scade_il: { [Op.gt]: new Date() },
    },
    order: [['creato_il', 'DESC']],
  });
};

const creaToken = async (dati, transaction = null) => {
  return await TokenUtente.create(dati, { transaction });
};

const aggiornaToken = async (id, dati, transaction = null) => {
  return await TokenUtente.update(dati, { where: { id }, transaction });
};

// UPDATE condizionato: se due richieste usano lo stesso token ne passa una sola.
// Restituisce true se il token è stato segnato come usato da questa chiamata.
const segnaTokenUsato = async (id, transaction = null) => {
  const [aggiornati] = await TokenUtente.update(
    { usato_il: new Date() },
    { where: { id, usato_il: null }, transaction },
  );
  return aggiornati === 1;
};

const revocaFamiglia = async (famiglia) => {
  return await TokenUtente.update(
    { revocato_il: new Date() },
    { where: { famiglia, tipo: 'refresh', revocato_il: null } },
  );
};

// Revoca i token di un tipo ancora aperti per l'utente.
const revocaTokenUtente = async (utenteId, tipo, transaction = null) => {
  return await TokenUtente.update(
    { revocato_il: new Date() },
    { where: { utente_id: utenteId, tipo, usato_il: null, revocato_il: null }, transaction },
  );
};

// Pulizia periodica: token scaduti da più di un giorno.
const eliminaTokenScaduti = async () => {
  const ieri = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return await TokenUtente.destroy({ where: { scade_il: { [Op.lt]: ieri } } });
};

// ─────────────────────────────────────
// Consensi
// ─────────────────────────────────────

// Ultima versione pubblicata del documento (privacy, termini, ...).
const trovaDocumentoLegalePubblicato = async (tipo, transaction = null) => {
  return await DocumentoLegale.findOne({
    where: { tipo, pubblicato_il: { [Op.ne]: null } },
    order: [['pubblicato_il', 'DESC']],
    transaction,
  });
};

const creaConsensi = async (righe, transaction = null) => {
  return await Consenso.bulkCreate(righe, { transaction });
};

// ─────────────────────────────────────
// Visitatori della chat
// ─────────────────────────────────────

const creaVisitatore = async (dati) => {
  return await Visitatore.create(dati);
};

const trovaVisitatorePerUuid = async (uuid) => {
  return await Visitatore.findOne({ where: { uuid } });
};

module.exports = {
  trovaToken,
  trovaTokenValido,
  creaToken,
  aggiornaToken,
  segnaTokenUsato,
  revocaFamiglia,
  revocaTokenUtente,
  eliminaTokenScaduti,
  trovaDocumentoLegalePubblicato,
  creaConsensi,
  creaVisitatore,
  trovaVisitatorePerUuid,
};
