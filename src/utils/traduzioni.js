// Traduzioni dei contenuti (tipologie, servizi, pacchetti, FAQ).
// L'italiano sta nella tabella originale; le altre lingue arrivano con
// l'include "traduzioni" già filtrato sulla lingua richiesta.

/**
 * Restituisce il record come oggetto semplice con i campi tradotti.
 * Dove manca la traduzione resta il testo italiano.
 */
function applicaTraduzioni(record) {
  const dati = typeof record.toJSON === 'function' ? record.toJSON() : { ...record };

  for (const traduzione of dati.traduzioni ?? []) {
    if (traduzione.campo in dati) {
      dati[traduzione.campo] = traduzione.testo;
    }
  }

  delete dati.traduzioni;
  return dati;
}

module.exports = { applicaTraduzioni };
