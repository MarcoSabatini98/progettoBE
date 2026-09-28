// Errore applicativo unico: il middleware finale lo trasforma nella risposta
// { successo: false, errore: { codice, messaggio, dettagli } } con lo status.
// Il codice (MAIUSCOLO) serve al frontend e a chi legge i log per capire
// subito dove è nato il problema; il messaggio è per l'utente, in italiano.

class ErroreApp extends Error {
  /**
   * @param {number} status   status HTTP
   * @param {string} codice   es. 'PRENOTAZIONE_NON_TROVATA'
   * @param {string} messaggio in italiano, mostrabile all'utente
   * @param {unknown} [dettagli] es. elenco dei campi non validi
   */
  constructor(status, codice, messaggio, dettagli) {
    super(messaggio);
    this.name = 'ErroreApp';
    this.status = status;
    this.codice = codice;
    this.dettagli = dettagli;
  }
}

const richiestaNonValida = (codice, messaggio, dettagli) =>
  new ErroreApp(400, codice, messaggio, dettagli);
const nonAutenticato = (codice = 'NON_AUTENTICATO', messaggio = 'Devi effettuare l’accesso') =>
  new ErroreApp(401, codice, messaggio);
const vietato = (
  codice = 'PERMESSO_NEGATO',
  messaggio = 'Non hai i permessi per questa operazione',
) => new ErroreApp(403, codice, messaggio);
const conflitto = (codice, messaggio) => new ErroreApp(409, codice, messaggio);
const nonElaborabile = (codice, messaggio, dettagli) =>
  new ErroreApp(422, codice, messaggio, dettagli);
const servizioNonDisponibile = (codice, messaggio) => new ErroreApp(503, codice, messaggio);

const nonTrovato = (codice, messaggio) => new ErroreApp(404, codice, messaggio);

module.exports = {
  ErroreApp,
  richiestaNonValida,
  nonAutenticato,
  vietato,
  nonTrovato,
  conflitto,
  nonElaborabile,
  servizioNonDisponibile,
};
