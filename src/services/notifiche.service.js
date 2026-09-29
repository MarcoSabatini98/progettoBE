// src/services/notifiche.service.js
//
// Notifiche in app (campanella). Il socket ascolta `eventi` e le spinge in
// tempo reale; chi è offline le trova al prossimo accesso.

const { EventEmitter } = require('node:events');
const logger = require('../config/logger');
const notificheRepo = require('../repositories/notifiche.repository');
const { nonTrovato } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { aggiungiGiorni, oggi } = require('../utils/date');

// Evento 'nuova' → (notifica) per ogni notifica creata.
const eventi = new EventEmitter();

/**
 * Crea la stessa notifica per più utenti. Non lancia mai: una notifica persa
 * non deve far fallire l'operazione che l'ha generata.
 * dati: { tipo, titolo, testo?, link?, priorita? }
 */
async function invia(utentiIds, dati) {
  const destinatari = [...new Set(utentiIds.filter(Boolean))];
  if (destinatari.length === 0) {
    return [];
  }

  const righe = destinatari.map((utenteId) => ({
    utente_id: utenteId,
    tipo: dati.tipo,
    priorita: dati.priorita ?? 'info',
    titolo: dati.titolo,
    testo: dati.testo ?? null,
    link: dati.link ?? null,
  }));

  try {
    const create = await notificheRepo.creaNotifiche(righe);
    for (const notifica of create) {
      eventi.emit('nuova', notifica.toJSON());
    }
    return create;
  } catch (errore) {
    logger.error('Creazione notifica non riuscita', {
      tipo: dati.tipo,
      titolo: dati.titolo,
      errore: errore.message,
    });
    return [];
  }
}

async function utentiConPermesso(permesso) {
  return await notificheRepo.trovaIdUtentiConPermesso(permesso);
}

/** Notifica a tutto lo staff con il permesso, tranne chi ha generato l'evento. */
async function aChiPuo(permesso, dati, esclusoId) {
  const utenti = await utentiConPermesso(permesso);
  const destinatari = utenti.filter((id) => id !== esclusoId);
  return await invia(destinatari, dati);
}

async function nonLette(utenteId) {
  return await notificheRepo.contaNonLette(utenteId);
}

async function elenco(utenteId, query = {}) {
  const p = pagina(query);
  const soloNonLette = query.non_lette === true;
  const trovate = await notificheRepo.trovaNotificheUtente(utenteId, soloNonLette, p);
  return { ...risultato(trovate, p), non_lette: await nonLette(utenteId) };
}

async function notificaDiUtente(id, utenteId) {
  const notifica = await notificheRepo.trovaNotificaDiUtente(id, utenteId);
  if (!notifica) {
    throw nonTrovato('NOTIFICA_NON_TROVATA', 'Notifica non trovata');
  }
  return notifica;
}

async function segnaLetta(id, utenteId) {
  await notificaDiUtente(id, utenteId);
  await notificheRepo.segnaLetta(id);
  return await notificaDiUtente(id, utenteId);
}

async function segnaTutteLette(utenteId) {
  const aggiornate = await notificheRepo.segnaTutteLette(utenteId);
  return { aggiornate };
}

async function elimina(id, utenteId) {
  await notificaDiUtente(id, utenteId);
  await notificheRepo.eliminaNotifica(id);
}

/** Job: via le notifiche lette da più di `giorni` giorni. */
async function eliminaVecchie(giorni = 90) {
  return await notificheRepo.eliminaLettePrimaDel(aggiungiGiorni(oggi(), -giorni));
}

module.exports = {
  eventi,
  invia,
  aChiPuo,
  utentiConPermesso,
  elenco,
  nonLette,
  segnaLetta,
  segnaTutteLette,
  elimina,
  eliminaVecchie,
};
