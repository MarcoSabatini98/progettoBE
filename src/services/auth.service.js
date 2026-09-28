// Autenticazione: registrazione, accesso, rotazione dei refresh token,
// verifica email, reset password e token per i visitatori della chat.
//
// Access token : JWT breve (15m), firmato con JWT_ACCESS_SECRET.
// Refresh token: stringa casuale; nel DB solo l'HMAC. A ogni uso viene
//                sostituito; il riuso di un token già usato revoca tutta la
//                "famiglia" (qualcuno l'ha rubato).
// Visitatore   : JWT firmato con JWT_CHAT_SECRET, vale solo per la chat.

const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const config = require('../config/env');
const {
  Utente,
  TokenUtente,
  Visitatore,
  Ospite,
  Consenso,
  DocumentoLegale,
  sequelize,
} = require('../models');
const {
  ErroreApp,
  nonAutenticato,
  richiestaNonValida,
  conflitto,
  vietato,
} = require('../utils/errori');
const { tokenCasuale, codiceNumerico, uuid } = require('../utils/sicurezza');
const { aggiungiOre } = require('../utils/date');
const email = require('./email.service');
const permessi = require('./permessi.service');

const COSTO_BCRYPT = 12;
const TENTATIVI_MAX_CODICE = 5;
const DURATA_CHAT = '30d';

// HMAC con il segreto dei refresh: chi legge il DB non può fabbricare token validi.
const impronta = (valore) =>
  crypto.createHmac('sha256', config.jwt.segretoRefresh).update(valore).digest('hex');

const normalizzaEmail = (e) => String(e).trim().toLowerCase();
const hashPassword = (password) => bcrypt.hash(password, COSTO_BCRYPT);

const ORA = () => new Date();

// --- sessioni -----------------------------------------------------------------

function firmaAccess(utente) {
  return jwt.sign({ id: utente.id, ruolo: utente.ruolo }, config.jwt.segretoAccess, {
    subject: utente.uuid,
    expiresIn: config.jwt.durataAccess,
  });
}

async function creaRefresh(utenteId, famiglia, meta, transaction) {
  const token = tokenCasuale();
  await TokenUtente.create(
    {
      utente_id: utenteId,
      tipo: 'refresh',
      hash_token: impronta(token),
      famiglia,
      scade_il: aggiungiOre(ORA(), config.jwt.durataRefreshGiorni * 24),
      ip: meta?.ip ?? null,
      user_agent: meta?.userAgent?.slice(0, 255) ?? null,
    },
    { transaction },
  );
  return token;
}

/** Dati che il frontend riceve a ogni accesso/rinnovo. */
async function sessione(utente, refreshToken) {
  return {
    accessToken: firmaAccess(utente),
    refreshToken,
    utente: {
      id: utente.id,
      uuid: utente.uuid,
      email: utente.email,
      nome: utente.nome,
      cognome: utente.cognome,
      ruolo: utente.ruolo,
      lingua: utente.lingua,
      colore_avatar: utente.colore_avatar,
      email_verificata: Boolean(utente.email_verificata_il),
      permessi: await permessi.permessiDi(utente.ruolo),
    },
  };
}

// --- registrazione e accesso ---------------------------------------------------

async function registraConsensi(utenteId, ospiteId, consensi, meta, transaction) {
  const righe = [];
  for (const [tipo, accettato] of Object.entries(consensi ?? {})) {
    const documento = await DocumentoLegale.findOne({
      where: { tipo, pubblicato_il: { [Op.ne]: null } },
      order: [['pubblicato_il', 'DESC']],
      transaction,
    });
    righe.push({
      utente_id: utenteId,
      ospite_id: ospiteId,
      documento_id: documento?.id ?? null,
      tipo,
      accettato: Boolean(accettato),
      ip: meta?.ip ?? null,
      user_agent: meta?.userAgent?.slice(0, 255) ?? null,
    });
  }
  if (righe.length) await Consenso.bulkCreate(righe, { transaction });
}

/**
 * Registrazione di un cliente dal sito. Crea anche la sua anagrafica
 * (ospite), che il cliente completerà dall'area personale.
 */
async function registra(dati, meta) {
  if (!dati.consensi?.privacy || !dati.consensi?.termini) {
    throw richiestaNonValida(
      'CONSENSI_OBBLIGATORI',
      'Devi accettare privacy e termini di servizio',
    );
  }
  const indirizzo = normalizzaEmail(dati.email);
  if (await Utente.findOne({ where: { email: indirizzo }, paranoid: false })) {
    throw conflitto('EMAIL_GIA_REGISTRATA', 'Esiste già un account con questa email');
  }
  const passwordHash = await hashPassword(dati.password);

  const { utente, refreshToken } = await sequelize.transaction(async (transaction) => {
    const nuovo = await Utente.create(
      {
        email: indirizzo,
        password_hash: passwordHash,
        ruolo: 'cliente',
        nome: dati.nome.trim(),
        cognome: dati.cognome.trim(),
        telefono: dati.telefono ?? null,
        lingua: dati.lingua ?? 'it',
        ultimo_accesso_il: ORA(),
      },
      { transaction },
    );
    const anagrafica = await Ospite.create(
      {
        utente_id: nuovo.id,
        nome: nuovo.nome,
        cognome: nuovo.cognome,
        email: indirizzo,
        telefono: nuovo.telefono,
        lingua: nuovo.lingua,
      },
      { transaction },
    );
    await nuovo.update({ ospite_id: anagrafica.id }, { transaction });
    await registraConsensi(nuovo.id, anagrafica.id, dati.consensi, meta, transaction);
    return { utente: nuovo, refreshToken: await creaRefresh(nuovo.id, uuid(), meta, transaction) };
  });

  await inviaCodiceVerifica(utente);
  return sessione(utente, refreshToken);
}

async function accedi(indirizzo, password, meta) {
  const utente = await Utente.scope('autenticazione').findOne({
    where: { email: normalizzaEmail(indirizzo) },
  });
  // stesso messaggio per email e password sbagliate: non si rivela chi è registrato
  const valida = utente ? await bcrypt.compare(password, utente.password_hash) : false;
  if (!valida) throw nonAutenticato('CREDENZIALI_NON_VALIDE', 'Email o password non corretti');
  if (!utente.attivo) throw vietato('ACCOUNT_DISATTIVATO', 'Questo account è stato disattivato');

  await utente.update({ ultimo_accesso_il: ORA() });
  return sessione(utente, await creaRefresh(utente.id, uuid(), meta));
}

/** Rotazione: il vecchio refresh diventa usato e ne nasce uno nuovo, stessa famiglia. */
async function rinnova(refreshToken, meta) {
  const nonValido = () => nonAutenticato('SESSIONE_SCADUTA', 'Sessione scaduta: accedi di nuovo');
  if (!refreshToken) throw nonValido();

  const record = await TokenUtente.findOne({
    where: { hash_token: impronta(refreshToken), tipo: 'refresh' },
  });
  if (!record || record.revocato_il || record.scade_il < ORA()) throw nonValido();

  if (record.usato_il) {
    await revocaFamiglia(record.famiglia);
    throw nonAutenticato(
      'SESSIONE_COMPROMESSA',
      'Sessione non più valida per sicurezza: accedi di nuovo',
    );
  }

  return sequelize.transaction(async (transaction) => {
    // UPDATE condizionato: due rinnovi simultanei con lo stesso token → uno solo passa
    const [aggiornati] = await TokenUtente.update(
      { usato_il: ORA() },
      { where: { id: record.id, usato_il: null }, transaction },
    );
    if (aggiornati === 0) throw nonValido();

    const utente = await Utente.findByPk(record.utente_id, { transaction });
    if (!utente?.attivo) throw nonValido();
    return sessione(utente, await creaRefresh(utente.id, record.famiglia, meta, transaction));
  });
}

async function revocaFamiglia(famiglia) {
  if (!famiglia) return;
  await TokenUtente.update(
    { revocato_il: ORA() },
    { where: { famiglia, tipo: 'refresh', revocato_il: null } },
  );
}

async function esci(refreshToken) {
  if (!refreshToken) return;
  const record = await TokenUtente.findOne({
    where: { hash_token: impronta(refreshToken), tipo: 'refresh' },
  });
  await revocaFamiglia(record?.famiglia);
}

/** Chiude tutte le sessioni dell'utente (cambio password, disattivazione). */
async function esciOvunque(utenteId, transaction) {
  await TokenUtente.update(
    { revocato_il: ORA() },
    { where: { utente_id: utenteId, tipo: 'refresh', revocato_il: null }, transaction },
  );
}

// --- verifica email ---------------------------------------------------------------

async function inviaCodiceVerifica(utente) {
  if (utente.email_verificata_il) {
    throw richiestaNonValida('EMAIL_GIA_VERIFICATA', 'L’email è già verificata');
  }
  const codice = codiceNumerico();
  const sale = uuid();
  await sequelize.transaction(async (transaction) => {
    await TokenUtente.update(
      { revocato_il: ORA() },
      {
        where: { utente_id: utente.id, tipo: 'verifica_email', usato_il: null, revocato_il: null },
        transaction,
      },
    );
    await TokenUtente.create(
      {
        utente_id: utente.id,
        tipo: 'verifica_email',
        // il sale sta in "famiglia": due codici uguali non collidono sull'hash
        hash_token: impronta(`${sale}:${codice}`),
        famiglia: sale,
        scade_il: aggiungiOre(ORA(), 24),
      },
      { transaction },
    );
  });
  await email.invia({
    a: utente.email,
    modello: 'verifica_email',
    lingua: utente.lingua,
    dati: { nome: utente.nome, codice },
  });
}

async function verificaEmail(utenteId, codice) {
  const record = await TokenUtente.findOne({
    where: {
      utente_id: utenteId,
      tipo: 'verifica_email',
      usato_il: null,
      revocato_il: null,
      scade_il: { [Op.gt]: ORA() },
    },
    order: [['creato_il', 'DESC']],
  });
  if (!record) {
    throw richiestaNonValida('CODICE_SCADUTO', 'Codice scaduto: richiedine uno nuovo');
  }
  if (impronta(`${record.famiglia}:${String(codice).trim()}`) !== record.hash_token) {
    const tentativi = record.tentativi + 1;
    await record.update({
      tentativi,
      revocato_il: tentativi >= TENTATIVI_MAX_CODICE ? ORA() : null,
    });
    throw richiestaNonValida(
      'CODICE_ERRATO',
      tentativi >= TENTATIVI_MAX_CODICE
        ? 'Troppi tentativi: richiedi un nuovo codice'
        : `Codice errato (tentativi rimasti: ${TENTATIVI_MAX_CODICE - tentativi})`,
    );
  }
  await sequelize.transaction(async (transaction) => {
    await record.update({ usato_il: ORA() }, { transaction });
    await Utente.update({ email_verificata_il: ORA() }, { where: { id: utenteId }, transaction });
  });
}

// --- password ------------------------------------------------------------------------

/** Risponde sempre allo stesso modo: non rivela se l'email è registrata. */
async function richiediResetPassword(indirizzo) {
  const utente = await Utente.findOne({
    where: { email: normalizzaEmail(indirizzo), attivo: true },
  });
  if (!utente) return;
  const token = tokenCasuale();
  await TokenUtente.create({
    utente_id: utente.id,
    tipo: 'reset_password',
    hash_token: impronta(token),
    scade_il: aggiungiOre(ORA(), 1),
  });
  await email.invia({
    a: utente.email,
    modello: 'reset_password',
    lingua: utente.lingua,
    dati: {
      nome: utente.nome,
      link: `${config.urlFrontend}/reimposta-password?token=${encodeURIComponent(token)}`,
    },
  });
}

async function reimpostaPassword(token, nuovaPassword) {
  const record = await TokenUtente.findOne({
    where: {
      hash_token: impronta(String(token)),
      tipo: 'reset_password',
      usato_il: null,
      revocato_il: null,
      scade_il: { [Op.gt]: ORA() },
    },
  });
  if (!record) {
    throw richiestaNonValida(
      'LINK_NON_VALIDO',
      'Il link non è valido o è scaduto: richiedine uno nuovo',
    );
  }
  const passwordHash = await hashPassword(nuovaPassword);
  await sequelize.transaction(async (transaction) => {
    await record.update({ usato_il: ORA() }, { transaction });
    await Utente.update(
      { password_hash: passwordHash },
      { where: { id: record.utente_id }, transaction },
    );
    await esciOvunque(record.utente_id, transaction);
  });
}

async function cambiaPassword(utenteId, attuale, nuova) {
  const utente = await Utente.scope('autenticazione').findByPk(utenteId);
  if (!utente || !(await bcrypt.compare(attuale, utente.password_hash))) {
    throw richiestaNonValida('PASSWORD_ATTUALE_ERRATA', 'La password attuale non è corretta');
  }
  const passwordHash = await hashPassword(nuova);
  await sequelize.transaction(async (transaction) => {
    await utente.update({ password_hash: passwordHash }, { transaction });
    await esciOvunque(utenteId, transaction);
  });
}

// --- verifica dei token (usata dai middleware) -------------------------------------

function verificaAccess(token) {
  try {
    return jwt.verify(token, config.jwt.segretoAccess);
  } catch (err) {
    throw err.name === 'TokenExpiredError'
      ? nonAutenticato('TOKEN_SCADUTO', 'Sessione scaduta')
      : nonAutenticato('TOKEN_NON_VALIDO', 'Token di accesso non valido');
  }
}

// --- visitatori della chat ---------------------------------------------------------

/** Crea un visitatore anonimo e gli dà il token per la chat di assistenza. */
const firmaVisitatore = (v) =>
  jwt.sign({ tipo: 'visitatore', id: v.id }, config.jwt.segretoChat, {
    subject: v.uuid,
    expiresIn: DURATA_CHAT,
  });

async function creaVisitatore(dati, meta) {
  const visitatore = await Visitatore.create({
    nome: dati?.nome ?? null,
    email: dati?.email ? normalizzaEmail(dati.email) : null,
    lingua: dati?.lingua ?? 'it',
    ip: meta?.ip ?? null,
    user_agent: meta?.userAgent?.slice(0, 255) ?? null,
    ultimo_accesso_il: ORA(),
  });
  return {
    token: firmaVisitatore(visitatore),
    visitatore: { uuid: visitatore.uuid, nome: visitatore.nome },
  };
}

async function verificaVisitatore(token) {
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.segretoChat);
  } catch {
    throw nonAutenticato(
      'TOKEN_CHAT_NON_VALIDO',
      'Sessione della chat scaduta: ricarica la pagina',
    );
  }
  const visitatore = await Visitatore.findOne({ where: { uuid: payload.sub } });
  if (!visitatore) throw nonAutenticato('TOKEN_CHAT_NON_VALIDO', 'Sessione della chat non valida');
  if (visitatore.bloccato)
    throw new ErroreApp(403, 'VISITATORE_BLOCCATO', 'Non puoi più usare la chat');
  return visitatore;
}

module.exports = {
  registra,
  accedi,
  rinnova,
  esci,
  esciOvunque,
  inviaCodiceVerifica,
  verificaEmail,
  richiediResetPassword,
  reimpostaPassword,
  cambiaPassword,
  hashPassword,
  verificaAccess,
  creaVisitatore,
  verificaVisitatore,
  normalizzaEmail,
};
