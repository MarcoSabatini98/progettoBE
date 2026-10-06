// src/socket/connessione.js
//
// Cosa succede a ogni socket collegato:
//  1. entra nella sua stanza personale; lo staff anche in 'staff' e, se
//     gestisce l'assistenza, in 'assistenza' (vedi stanze.js);
//  2. presenza dello staff: online alla prima scheda aperta, offline quando
//     chiude l'ultima; con PRESENZA sceglie occupato, assente o invisibile;
//  3. SCRIVE: "sta scrivendo" girato agli altri della conversazione;
//  4. alla scadenza del token il socket si chiude: il client rinnova il
//     token e si ricollega.
//
// I messaggi non passano da qui: partono dal service e li consegna
// inoltro.js, così quello che arriva via REST e via socket è la stessa cosa.
// Un permesso o un ruolo cambiato vale dalla connessione successiva.

const chatService = require('../services/chat.service');
const permessiService = require('../services/permessi.service');
const { RUOLI, PERMESSI } = require('../constants/ruoli.constants');
const { EVENTI_SOCKET } = require('../constants/chat.constants');
const { STANZA_STAFF, STANZA_ASSISTENZA, stanzaDi, stanzeConversazione } = require('./stanze');
const { descriviErrore } = require('./errori');

// setTimeout non regge attese oltre ~24 giorni (il token del visitatore
// dura 30): i socket si chiudono comunque dopo un giorno e si ricollegano.
const DURATA_MASSIMA_MS = 24 * 60 * 60 * 1000;

// Ogni SCRIVE costa query al database e lo manda anche chi non ha un account:
// dallo stesso socket se ne accetta al massimo uno ogni tanto (l'ultimo, che
// spegne l'indicatore, passa sempre).
const SCRIVE_OGNI_MS = 1000;

// Schede aperte da ogni membro dello staff.
// ponytail: in memoria del processo come le presenze del service; con più
// istanze servirebbe l'adapter Redis di socket.io.
const schedeAperte = new Map();

function segnaCollegato(utenteId) {
  const schede = (schedeAperte.get(utenteId) ?? 0) + 1;
  schedeAperte.set(utenteId, schede);
  if (schede === 1) {
    chatService.impostaPresenza(utenteId, 'online');
  }
}

function segnaScollegato(utenteId) {
  const schede = schedeAperte.get(utenteId) - 1;
  if (schede > 0) {
    schedeAperte.set(utenteId, schede);
    return;
  }
  schedeAperte.delete(utenteId);
  chatService.impostaPresenza(utenteId, 'offline');
}

/** Risponde al client, se ha chiesto una conferma (ack). */
function rispondi(ack, esito) {
  if (typeof ack === 'function') {
    ack(esito);
  }
}

function chiudiAllaScadenza(socket) {
  const attesa = Math.min(socket.data.scadenza - Date.now(), DURATA_MASSIMA_MS);
  const timer = setTimeout(() => socket.disconnect(true), attesa);
  socket.on('disconnect', () => clearTimeout(timer));
}

/**
 * dati: { conversazione: uuid, attivo: true (inizia) | false (smette) }.
 * Gli altri socket dello stesso utente lo ricevono: il client scarta i suoi.
 * ponytail: controlla l'accesso a ogni evento (2-3 query); il client lo
 * manda al massimo ogni 2-3 secondi. Cache per socket se diventa un problema.
 */
function ascoltaScrittura(socket) {
  const { chi } = socket.data;
  let ultima = 0;
  socket.on(EVENTI_SOCKET.SCRIVE, async (dati, ack) => {
    const adesso = Date.now();
    if (dati?.attivo !== false && adesso - ultima < SCRIVE_OGNI_MS) {
      rispondi(ack, { successo: true });
      return;
    }
    ultima = adesso;
    try {
      const uuid = typeof dati?.conversazione === 'string' ? dati.conversazione : '';
      const conversazione = await chatService.accessibile(uuid, chi);
      const stanze = await stanzeConversazione(conversazione);
      socket.to(stanze).emit(EVENTI_SOCKET.SCRIVE, {
        conversazione: conversazione.uuid,
        utente_id: chi.utenteId ?? null,
        visitatore_id: chi.visitatoreId ?? null,
        attivo: dati.attivo !== false,
      });
      rispondi(ack, { successo: true });
    } catch (errore) {
      rispondi(ack, { successo: false, errore: descriviErrore(errore, EVENTI_SOCKET.SCRIVE) });
    }
  });
}

/** dati: { stato: 'online' | 'occupato' | 'assente' | 'offline' }. */
function ascoltaPresenza(socket) {
  const { utenteId } = socket.data.chi;
  socket.on(EVENTI_SOCKET.PRESENZA, (dati, ack) => {
    try {
      chatService.impostaPresenza(utenteId, dati?.stato);
      rispondi(ack, { successo: true });
    } catch (errore) {
      rispondi(ack, { successo: false, errore: descriviErrore(errore, EVENTI_SOCKET.PRESENZA) });
    }
  });
}

async function entraNelloStaff(socket) {
  const { utenteId, ruolo } = socket.data.chi;
  socket.join(STANZA_STAFF);
  // Prima di qualunque attesa: se il socket cade subito, il conteggio resta giusto.
  segnaCollegato(utenteId);
  socket.on('disconnect', () => segnaScollegato(utenteId));
  ascoltaPresenza(socket);
  socket.emit(EVENTI_SOCKET.PRESENZE, chatService.presenzeStaff());

  if (await permessiService.ha(ruolo, PERMESSI.CHAT_ASSISTENZA)) {
    socket.join(STANZA_ASSISTENZA);
  }
}

async function alCollegamento(socket) {
  const { chi } = socket.data;
  socket.join(stanzaDi(chi));
  chiudiAllaScadenza(socket);
  ascoltaScrittura(socket);

  if (chi.utenteId && chi.ruolo !== RUOLI.CLIENTE) {
    try {
      await entraNelloStaff(socket);
    } catch (errore) {
      descriviErrore(errore, 'collegamento');
      socket.disconnect(true);
    }
  }
}

module.exports = { alCollegamento };
