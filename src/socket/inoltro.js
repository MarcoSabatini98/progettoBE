// src/socket/inoltro.js
//
// Dai service al socket: chat.service e notifiche.service emettono un evento
// dopo aver scritto sul DB, qui lo si consegna in tempo reale a chi deve
// riceverlo. Senza socket attivo (test, script) nessuno ascolta e il
// service funziona lo stesso.
//
// Ogni evento della chat porta l'uuid in `conversazione`; MESSAGGIO e
// CONVERSAZIONE portano anche la conversazione intera in `dettaglio`, così
// il client può aggiungerla all'elenco se non ce l'ha ancora.

const chatService = require('../services/chat.service');
const notificheService = require('../services/notifiche.service');
const { EVENTI_SOCKET } = require('../constants/chat.constants');
const { STANZA_STAFF, stanzaUtente, stanzeConversazione } = require('./stanze');
const { descriviErrore } = require('./errori');

// Gli ascolti attivi, per poterli togliere alla chiusura.
let ascolti = [];

/** Un errore nella consegna finisce nel log e non risale al service. */
function ascolta(emettitore, nome, consegna) {
  const funzione = async (dati) => {
    try {
      await consegna(dati);
    } catch (errore) {
      descriviErrore(errore, nome);
    }
  };
  emettitore.on(nome, funzione);
  ascolti.push({ emettitore, nome, funzione });
}

function collegaEventi(io) {
  const aConversazione = async (conversazione, evento, dati) => {
    const stanze = await stanzeConversazione(conversazione);
    io.to(stanze).emit(evento, { conversazione: conversazione.uuid, ...dati });
  };

  ascolta(chatService.eventi, 'messaggio', async ({ conversazione, messaggio }) => {
    await aConversazione(conversazione, EVENTI_SOCKET.MESSAGGIO, {
      messaggio,
      dettaglio: conversazione,
    });
  });

  ascolta(chatService.eventi, 'messaggio_modificato', async ({ conversazione, messaggio }) => {
    await aConversazione(conversazione, EVENTI_SOCKET.MESSAGGIO_MODIFICATO, { messaggio });
  });

  ascolta(chatService.eventi, 'messaggio_eliminato', async ({ conversazione, messaggioId }) => {
    await aConversazione(conversazione, EVENTI_SOCKET.MESSAGGIO_ELIMINATO, {
      messaggio_id: messaggioId,
    });
  });

  ascolta(chatService.eventi, 'letto', async ({ conversazione, chi, il }) => {
    await aConversazione(conversazione, EVENTI_SOCKET.LETTO, {
      utente_id: chi.utenteId ?? null,
      visitatore_id: chi.visitatoreId ?? null,
      il,
    });
  });

  ascolta(chatService.eventi, 'conversazione', async ({ conversazione }) => {
    await aConversazione(conversazione, EVENTI_SOCKET.CONVERSAZIONE, {
      dettaglio: conversazione,
    });
  });

  ascolta(chatService.eventi, 'presenza', ({ utenteId, stato }) => {
    io.to(STANZA_STAFF).emit(EVENTI_SOCKET.PRESENZA, { utente_id: utenteId, stato });
  });

  ascolta(notificheService.eventi, 'nuova', (notifica) => {
    io.to(stanzaUtente(notifica.utente_id)).emit(EVENTI_SOCKET.NOTIFICA, notifica);
  });
}

function scollegaEventi() {
  for (const { emettitore, nome, funzione } of ascolti) {
    emettitore.off(nome, funzione);
  }
  ascolti = [];
}

module.exports = { collegaEventi, scollegaEventi };
