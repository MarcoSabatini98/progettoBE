// src/socket/stanze.js
//
// Nomi delle stanze socket.io e chi riceve gli eventi di una conversazione.
//
//   utente:<id>      → tutte le schede aperte di un utente
//   visitatore:<id>  → la chat del sito di un visitatore senza account
//   staff            → tutto lo staff (presenze)
//   assistenza       → lo staff con il permesso chat.assistenza
//
// Gli eventi vanno alle stanze personali, non a una stanza per
// conversazione: così chi entra o esce da un gruppo riceve subito (o smette
// di ricevere) i messaggi, senza dover spostare i socket da una stanza all'altra.

const chatRepo = require('../repositories/chat.repository');

const STANZA_STAFF = 'staff';
const STANZA_ASSISTENZA = 'assistenza';

const stanzaUtente = (utenteId) => `utente:${utenteId}`;
const stanzaVisitatore = (visitatoreId) => `visitatore:${visitatoreId}`;

/** La stanza personale di chi è collegato: { utenteId } oppure { visitatoreId }. */
function stanzaDi(chi) {
  return chi.visitatoreId ? stanzaVisitatore(chi.visitatoreId) : stanzaUtente(chi.utenteId);
}

/**
 * Chi deve ricevere gli eventi della conversazione.
 * Assistenza: il cliente (o il visitatore) e tutto lo staff che la gestisce,
 * come nell'elenco REST. Chat interna: i partecipanti ancora dentro.
 */
async function stanzeConversazione(conversazione) {
  if (conversazione.tipo === 'assistenza') {
    const stanze = [STANZA_ASSISTENZA];
    if (conversazione.cliente_id) {
      stanze.push(stanzaUtente(conversazione.cliente_id));
    }
    if (conversazione.visitatore_id) {
      stanze.push(stanzaVisitatore(conversazione.visitatore_id));
    }
    return stanze;
  }

  const partecipanti = await chatRepo.trovaIdPartecipanti(conversazione.id);
  return partecipanti.map(stanzaUtente);
}

module.exports = {
  STANZA_STAFF,
  STANZA_ASSISTENZA,
  stanzaUtente,
  stanzaVisitatore,
  stanzaDi,
  stanzeConversazione,
};
