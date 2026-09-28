// src/services/registro.service.js
//
// Storico delle modifiche a prenotazioni, pagamenti e fatture (chi, quando,
// com'era prima e com'è dopo). Lo scrivono i trigger: qui si consulta.

const registroRepo = require('../repositories/registro.repository');
const { pagina, risultato } = require('../utils/paginazione');

/** Elenco paginato, dal più recente. query: { tabella, record_id, utente_id, azione, dal, al } */
async function elenco(query = {}) {
  const p = pagina(query);
  const trovati = await registroRepo.trovaAttivita(query, p);
  return risultato(trovati, p);
}

/** Storia di un singolo record (es. tutte le modifiche alla prenotazione 42). */
async function storia(tabella, recordId, query = {}) {
  return await elenco({ ...query, tabella, record_id: recordId });
}

module.exports = { elenco, storia };
