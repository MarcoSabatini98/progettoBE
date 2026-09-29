// src/services/auth.service.js
//
// Registrazione, accesso, rotazione dei refresh token, verifica email, reset
// password e token per i visitatori della chat.
//
// Access token : JWT breve, firmato con JWT_ACCESS_SECRET.
// Refresh token: stringa casuale; nel DB solo l'HMAC. A ogni uso viene
//                sostituito; il riuso di un token già usato revoca tutta la
//                "famiglia" (qualcuno l'ha rubato).
// Visitatore   : JWT firmato con JWT_CHAT_SECRET, vale solo per la chat.

const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { sequelize } = require('../models');
const utentiRepo = require('../repositories/utenti.repository');
const ospitiRepo = require('../repositories/ospiti.repository');
const authRepo = require('../repositories/auth.repository');
const email = require('./email.service');
const permessi = require('./permessi.service');
const { RUOLI } = require('../constants/ruoli.constants');
const {
  ErroreApp,
  nonAutenticato,
  richiestaNonValida,
  conflitto,
  vietato,
} = require('../utils/errori');
const { tokenCasuale, codiceNumerico, uuid } = require('../utils/sicurezza');
const { aggiungiOre } = require('../utils/date');

const COSTO_BCRYPT = 12;
const TENTATIVI_MAX_CODICE = 5;
const DURATA_TOKEN_CHAT = '30d';

// HMAC con il segreto dei refresh: chi legge il DB non può fabbricare token validi.
function impronta(valore) {
  return crypto.createHmac('sha256', config.jwt.segretoRefresh).update(valore).digest('hex');
}

function normalizzaEmail(indirizzo) {
  return String(indirizzo).trim().toLowerCase();
}

async function hashPassword(password) {
  return await bcrypt.hash(password, COSTO_BCRYPT);
}

// Dati del client salvati con token e consensi (per sicurezza e prova del consenso).
function datiClient(meta) {
  return {
    ip: meta?.ip ?? null,
    user_agent: meta?.userAgent?.slice(0, 255) ?? null,
  };
}

// ─────────────────────────────────────
// Sessioni
// ─────────────────────────────────────

function firmaAccess(utente) {
  return jwt.sign({ id: utente.id, ruolo: utente.ruolo }, config.jwt.segretoAccess, {
    subject: utente.uuid,
    expiresIn: config.jwt.durataAccess,
  });
}

async function creaRefresh(utenteId, famiglia, meta, transaction = null) {
  const token = tokenCasuale();
  await authRepo.creaToken(
    {
      utente_id: utenteId,
      tipo: 'refresh',
      hash_token: impronta(token),
      famiglia,
      scade_il: aggiungiOre(new Date(), config.jwt.durataRefreshGiorni * 24),
      ...datiClient(meta),
    },
    transaction,
  );
  return token;
}

/** Dati che il frontend riceve a ogni accesso e rinnovo. */
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

// ─────────────────────────────────────
// Registrazione e accesso
// ─────────────────────────────────────

// Un consenso per ogni voce, legato alla versione pubblicata del documento.
async function registraConsensi(utenteId, ospiteId, consensi, meta, transaction) {
  const righe = [];
  for (const [tipo, accettato] of Object.entries(consensi ?? {})) {
    const documento = await authRepo.trovaDocumentoLegalePubblicato(tipo, transaction);
    righe.push({
      utente_id: utenteId,
      ospite_id: ospiteId,
      documento_id: documento?.id ?? null,
      tipo,
      accettato: Boolean(accettato),
      ...datiClient(meta),
    });
  }
  if (righe.length > 0) {
    await authRepo.creaConsensi(righe, transaction);
  }
}

/**
 * Registrazione di un cliente dal sito. Crea anche la sua anagrafica, che il
 * cliente completerà dall'area personale.
 */
async function registra(dati, meta) {
  if (!dati.consensi?.privacy || !dati.consensi?.termini) {
    throw richiestaNonValida(
      'CONSENSI_OBBLIGATORI',
      'Devi accettare privacy e termini di servizio',
    );
  }
  const indirizzo = normalizzaEmail(dati.email);
  if (await utentiRepo.esisteEmail(indirizzo)) {
    throw conflitto('EMAIL_GIA_REGISTRATA', 'Esiste già un account con questa email');
  }
  const passwordHash = await hashPassword(dati.password);

  const { utente, refreshToken } = await sequelize.transaction(async (transaction) => {
    const nuovo = await utentiRepo.creaUtente(
      {
        email: indirizzo,
        password_hash: passwordHash,
        ruolo: RUOLI.CLIENTE,
        nome: dati.nome.trim(),
        cognome: dati.cognome.trim(),
        telefono: dati.telefono ?? null,
        lingua: dati.lingua ?? 'it',
        ultimo_accesso_il: new Date(),
      },
      transaction,
    );
    const anagrafica = await ospitiRepo.creaOspite(
      {
        utente_id: nuovo.id,
        nome: nuovo.nome,
        cognome: nuovo.cognome,
        email: indirizzo,
        telefono: nuovo.telefono,
        lingua: nuovo.lingua,
      },
      transaction,
    );
    await nuovo.update({ ospite_id: anagrafica.id }, { transaction });
    await registraConsensi(nuovo.id, anagrafica.id, dati.consensi, meta, transaction);

    const token = await creaRefresh(nuovo.id, uuid(), meta, transaction);
    return { utente: nuovo, refreshToken: token };
  });

  await inviaCodiceVerifica(utente);
  return await sessione(utente, refreshToken);
}

async function accedi(indirizzo, password, meta) {
  const utente = await utentiRepo.trovaUtentePerAutenticazione({
    email: normalizzaEmail(indirizzo),
  });

  // Stesso messaggio per email e password sbagliate: non si rivela chi è registrato.
  const passwordGiusta = utente ? await bcrypt.compare(password, utente.password_hash) : false;
  if (!passwordGiusta) {
    throw nonAutenticato('CREDENZIALI_NON_VALIDE', 'Email o password non corretti');
  }
  if (!utente.attivo) {
    throw vietato('ACCOUNT_DISATTIVATO', 'Questo account è stato disattivato');
  }

  await utente.update({ ultimo_accesso_il: new Date() });
  const refreshToken = await creaRefresh(utente.id, uuid(), meta);
  return await sessione(utente, refreshToken);
}

function sessioneScaduta() {
  return nonAutenticato('SESSIONE_SCADUTA', 'Sessione scaduta: accedi di nuovo');
}

/** Rotazione: il vecchio refresh diventa usato e ne nasce uno nuovo, stessa famiglia. */
async function rinnova(refreshToken, meta) {
  if (!refreshToken) {
    throw sessioneScaduta();
  }

  const record = await authRepo.trovaToken(impronta(refreshToken), 'refresh');
  if (!record || record.revocato_il || record.scade_il < new Date()) {
    throw sessioneScaduta();
  }

  // Un refresh già usato che torna indietro è stato copiato: si chiude la famiglia.
  if (record.usato_il) {
    await authRepo.revocaFamiglia(record.famiglia);
    throw nonAutenticato(
      'SESSIONE_COMPROMESSA',
      'Sessione non più valida per sicurezza: accedi di nuovo',
    );
  }

  return await sequelize.transaction(async (transaction) => {
    const segnato = await authRepo.segnaTokenUsato(record.id, transaction);
    if (!segnato) {
      throw sessioneScaduta();
    }

    const utente = await utentiRepo.trovaUtentePerId(record.utente_id, transaction);
    if (!utente?.attivo) {
      throw sessioneScaduta();
    }
    const nuovoToken = await creaRefresh(utente.id, record.famiglia, meta, transaction);
    return await sessione(utente, nuovoToken);
  });
}

async function esci(refreshToken) {
  if (!refreshToken) {
    return;
  }
  const record = await authRepo.trovaToken(impronta(refreshToken), 'refresh');
  if (record?.famiglia) {
    await authRepo.revocaFamiglia(record.famiglia);
  }
}

/** Chiude tutte le sessioni dell'utente (cambio password, disattivazione). */
async function esciOvunque(utenteId, transaction = null) {
  await authRepo.revocaTokenUtente(utenteId, 'refresh', transaction);
}

// ─────────────────────────────────────
// Verifica email
// ─────────────────────────────────────

async function inviaCodiceVerifica(utente) {
  if (utente.email_verificata_il) {
    throw richiestaNonValida('EMAIL_GIA_VERIFICATA', "L'email è già verificata");
  }
  const codice = codiceNumerico();
  // Il sale sta in "famiglia": due codici uguali non collidono sull'hash.
  const sale = uuid();

  await sequelize.transaction(async (transaction) => {
    await authRepo.revocaTokenUtente(utente.id, 'verifica_email', transaction);
    await authRepo.creaToken(
      {
        utente_id: utente.id,
        tipo: 'verifica_email',
        hash_token: impronta(`${sale}:${codice}`),
        famiglia: sale,
        scade_il: aggiungiOre(new Date(), 24),
      },
      transaction,
    );
  });

  await email.invia({
    a: utente.email,
    modello: 'verifica_email',
    lingua: utente.lingua,
    dati: { nome: utente.nome, codice },
  });
}

/** Nuovo codice su richiesta dell'utente. */
async function reinviaCodiceVerifica(utenteId) {
  const utente = await utentiRepo.trovaUtentePerId(utenteId);
  if (!utente) {
    throw nonAutenticato('SESSIONE_SCADUTA', 'Sessione scaduta: accedi di nuovo');
  }
  await inviaCodiceVerifica(utente);
}

async function verificaEmail(utenteId, codice) {
  const record = await authRepo.trovaTokenValido({ utente_id: utenteId, tipo: 'verifica_email' });
  if (!record) {
    throw richiestaNonValida('CODICE_SCADUTO', 'Codice scaduto: richiedine uno nuovo');
  }

  const codiceGiusto =
    impronta(`${record.famiglia}:${String(codice).trim()}`) === record.hash_token;
  if (!codiceGiusto) {
    const tentativi = record.tentativi + 1;
    const esauriti = tentativi >= TENTATIVI_MAX_CODICE;
    await authRepo.aggiornaToken(record.id, {
      tentativi,
      revocato_il: esauriti ? new Date() : null,
    });
    throw richiestaNonValida(
      'CODICE_ERRATO',
      esauriti
        ? 'Troppi tentativi: richiedi un nuovo codice'
        : `Codice errato (tentativi rimasti: ${TENTATIVI_MAX_CODICE - tentativi})`,
    );
  }

  await sequelize.transaction(async (transaction) => {
    await authRepo.segnaTokenUsato(record.id, transaction);
    await utentiRepo.aggiornaUtente(utenteId, { email_verificata_il: new Date() }, transaction);
  });
}

// ─────────────────────────────────────
// Password
// ─────────────────────────────────────

/** Risponde sempre allo stesso modo: non rivela se l'email è registrata. */
async function richiediResetPassword(indirizzo) {
  const utente = await utentiRepo.trovaUtentePerEmail(normalizzaEmail(indirizzo));
  if (!utente?.attivo) {
    return;
  }

  const token = tokenCasuale();
  await authRepo.creaToken({
    utente_id: utente.id,
    tipo: 'reset_password',
    hash_token: impronta(token),
    scade_il: aggiungiOre(new Date(), 1),
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
  const record = await authRepo.trovaTokenValido({
    hash_token: impronta(String(token)),
    tipo: 'reset_password',
  });
  if (!record) {
    throw richiestaNonValida(
      'LINK_NON_VALIDO',
      'Il link non è valido o è scaduto: richiedine uno nuovo',
    );
  }

  const passwordHash = await hashPassword(nuovaPassword);
  await sequelize.transaction(async (transaction) => {
    await authRepo.segnaTokenUsato(record.id, transaction);
    await utentiRepo.aggiornaUtente(record.utente_id, { password_hash: passwordHash }, transaction);
    await esciOvunque(record.utente_id, transaction);
  });
}

async function cambiaPassword(utenteId, attuale, nuova) {
  const utente = await utentiRepo.trovaUtentePerAutenticazione({ id: utenteId });
  const attualeGiusta = utente ? await bcrypt.compare(attuale, utente.password_hash) : false;
  if (!attualeGiusta) {
    throw richiestaNonValida('PASSWORD_ATTUALE_ERRATA', 'La password attuale non è corretta');
  }

  const passwordHash = await hashPassword(nuova);
  await sequelize.transaction(async (transaction) => {
    await utente.update({ password_hash: passwordHash }, { transaction });
    await esciOvunque(utenteId, transaction);
  });
}

// ─────────────────────────────────────
// Verifica dei token (per i middleware)
// ─────────────────────────────────────

function verificaAccess(token) {
  try {
    return jwt.verify(token, config.jwt.segretoAccess);
  } catch (errore) {
    if (errore.name === 'TokenExpiredError') {
      throw nonAutenticato('TOKEN_SCADUTO', 'Sessione scaduta');
    }
    throw nonAutenticato('TOKEN_NON_VALIDO', 'Token di accesso non valido');
  }
}

// ─────────────────────────────────────
// Visitatori della chat
// ─────────────────────────────────────

function firmaVisitatore(visitatore) {
  return jwt.sign({ tipo: 'visitatore', id: visitatore.id }, config.jwt.segretoChat, {
    subject: visitatore.uuid,
    expiresIn: DURATA_TOKEN_CHAT,
  });
}

/** Crea un visitatore anonimo e gli dà il token per la chat di assistenza. */
async function creaVisitatore(dati, meta) {
  const visitatore = await authRepo.creaVisitatore({
    nome: dati?.nome ?? null,
    email: dati?.email ? normalizzaEmail(dati.email) : null,
    lingua: dati?.lingua ?? 'it',
    ...datiClient(meta),
    ultimo_accesso_il: new Date(),
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

  const visitatore = await authRepo.trovaVisitatorePerUuid(payload.sub);
  if (!visitatore) {
    throw nonAutenticato('TOKEN_CHAT_NON_VALIDO', 'Sessione della chat non valida');
  }
  if (visitatore.bloccato) {
    throw new ErroreApp(403, 'VISITATORE_BLOCCATO', 'Non puoi più usare la chat');
  }
  return visitatore;
}

/**
 * Chi usa la chat: utente collegato oppure visitatore del sito. I due token
 * sono firmati con segreti diversi: il campo "tipo" (letto senza verifica)
 * dice solo con quale segreto verificarlo.
 * Restituisce { utenteId, ruolo } oppure { visitatoreId }.
 */
async function verificaChat(token) {
  if (jwt.decode(token)?.tipo === 'visitatore') {
    const visitatore = await verificaVisitatore(token);
    return { visitatoreId: visitatore.id };
  }
  const payload = verificaAccess(token);
  return { utenteId: payload.id, ruolo: payload.ruolo };
}

/** Job: elimina i token scaduti da tempo. */
async function eliminaTokenScaduti() {
  return await authRepo.eliminaTokenScaduti();
}

module.exports = {
  normalizzaEmail,
  hashPassword,
  registra,
  accedi,
  rinnova,
  esci,
  esciOvunque,
  inviaCodiceVerifica,
  reinviaCodiceVerifica,
  verificaEmail,
  richiediResetPassword,
  reimpostaPassword,
  cambiaPassword,
  verificaAccess,
  creaVisitatore,
  verificaVisitatore,
  verificaChat,
  eliminaTokenScaduti,
};
