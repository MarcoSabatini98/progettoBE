// src/services/notifiche.service.js
//
// Notifiche in app (campanella). Il socket ascolta `eventi` e le spinge in
// tempo reale; chi è offline le trova al prossimo accesso.

const { EventEmitter } = require('node:events');
const config = require('../config/env');
const logger = require('../config/logger');
const notificheRepo = require('../repositories/notifiche.repository');
const { nonTrovato } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { aggiungiGiorni, dataItaliana, oggi } = require('../utils/date');
const auth = require('./auth.service');
const email = require('./email.service');

// Evento 'nuova' → (notifica) per ogni notifica creata.
const eventi = new EventEmitter();

/**
 * Crea la stessa notifica per più utenti. Non lancia mai: una notifica persa
 * non deve far fallire l'operazione che l'ha generata.
 * dati: { tipo, codice, parametri?, titolo, testo?, link?, priorita? }
 * codice e parametri traducono il titolo nel gestionale; testo porta solo dati
 * (codici, messaggi), che non si traducono.
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
    codice: dati.codice,
    parametri: dati.parametri ?? null,
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

// ─────────────────────────────────────
// Notifiche ai clienti
// ─────────────────────────────────────

// Pagine dell'area personale aperte al clic (percorsi del sito).
const AREA_PERSONALE = '/area-personale';
const paginaPrenotazione = (prenotazione) => `${AREA_PERSONALE}/prenotazioni/${prenotazione.id}`;

// Per codice: tipo, priorità, titolo in italiano e pagina da aprire.
const AVVISI_CLIENTE = Object.freeze({
  prenotazione_ricevuta: {
    tipo: 'prenotazione',
    titolo: (p) => `Prenotazione ${p.codice} ricevuta`,
  },
  prenotazione_confermata: {
    tipo: 'prenotazione',
    priorita: 'successo',
    titolo: (p) => `Prenotazione ${p.codice} confermata`,
  },
  prenotazione_cancellata: {
    tipo: 'prenotazione',
    priorita: 'avviso',
    titolo: (p) => `Prenotazione ${p.codice} cancellata`,
  },
  promemoria_checkin: {
    tipo: 'prenotazione',
    titolo: (p) => `Arrivo il ${p.data}: fai il check-in online`,
  },
  invito_recensione: {
    tipo: 'recensione',
    titolo: (p) => `Com'è andato il soggiorno ${p.codice}? Lascia una recensione`,
  },
  link_pagamento: {
    tipo: 'pagamento',
    priorita: 'avviso',
    titolo: (p) => `Pagamento da completare per la prenotazione ${p.codice}`,
  },
  pagamento_ricevuto: {
    tipo: 'pagamento',
    priorita: 'successo',
    titolo: (p) => `Pagamento di ${p.importo} ricevuto per ${p.codice}`,
  },
  rimborso_eseguito: {
    tipo: 'pagamento',
    titolo: (p) => `Rimborso di ${p.importo} eseguito per ${p.codice}`,
  },
  fattura_emessa: {
    tipo: 'pagamento',
    titolo: (p) => `Fattura ${p.numero} disponibile`,
    pagina: () => `${AREA_PERSONALE}/fatture`,
  },
});

/**
 * Notifica al titolare con account (prenotazione.utente_id): chi ha prenotato
 * senza registrarsi riceve solo l'email.
 */
async function alCliente(prenotazione, codice, extra = {}) {
  if (!prenotazione?.utente_id) {
    return [];
  }
  const avviso = AVVISI_CLIENTE[codice];
  const parametri = { codice: prenotazione.codice, data: prenotazione.data_arrivo, ...extra };
  return await invia([prenotazione.utente_id], {
    tipo: avviso.tipo,
    priorita: avviso.priorita,
    codice,
    parametri,
    titolo: avviso.titolo(parametri),
    link: (avviso.pagina ?? paginaPrenotazione)(prenotazione),
  });
}

/**
 * Nuova promozione attiva: la vedono tutti i clienti registrati nella campanella
 * e chi ha dato il consenso la riceve anche per email.
 * ponytail: un solo bulkCreate per tutti i clienti; a lotti se diventano decine di migliaia.
 */
async function promozioneAiClienti(promozione) {
  // Le email partono in sottofondo: chi pubblica l'offerta non aspetta l'SMTP.
  promozionePerEmail(promozione).catch((errore) =>
    logger.warn('Email della promozione non inviate', { errore: errore.message }),
  );
  const clienti = await notificheRepo.trovaIdClienti();
  return await invia(clienti, {
    tipo: 'promozione',
    codice: 'nuova_promozione',
    parametri: {
      nome: promozione.nome,
      inizio: promozione.soggiorno_dal,
      fine: promozione.soggiorno_al,
    },
    titolo: `Nuova offerta: ${promozione.nome}`,
    link: '/offerte',
  });
}

/**
 * Una email per cliente, nella sua lingua, col link per disiscriversi.
 * ponytail: invio uno alla volta; una coda se i destinatari diventano migliaia.
 */
async function promozionePerEmail(promozione) {
  const clienti = await notificheRepo.trovaClientiMarketing();
  for (const cliente of clienti) {
    await email.invia({
      a: cliente.email,
      modello: 'promozione',
      lingua: cliente.lingua,
      dati: {
        nome: cliente.nome,
        offerta: promozione.nome,
        descrizione: promozione.descrizione,
        dal: dataItaliana(promozione.soggiorno_dal),
        al: dataItaliana(promozione.soggiorno_al),
        link: `${config.urlFrontend}/offerte`,
        disiscrizione: auth.linkDisiscrizione(cliente),
      },
    });
  }
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
  alCliente,
  promozioneAiClienti,
  utentiConPermesso,
  elenco,
  nonLette,
  segnaLetta,
  segnaTutteLette,
  elimina,
  eliminaVecchie,
};
