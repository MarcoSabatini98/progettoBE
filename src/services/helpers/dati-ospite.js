// Campi dell'anagrafica ospite accettati in scrittura.

function datiOspite(dati) {
  return {
    nome: dati.nome,
    cognome: dati.cognome,
    email: dati.email,
    telefono: dati.telefono,
    sesso: dati.sesso,
    data_nascita: dati.data_nascita,
    cittadinanza_codice: dati.cittadinanza_codice,
    stato_nascita_codice: dati.stato_nascita_codice,
    comune_nascita_codice: dati.comune_nascita_codice,
    provincia_nascita: dati.provincia_nascita,
    tipo_documento: dati.tipo_documento,
    numero_documento: dati.numero_documento,
    luogo_rilascio_codice: dati.luogo_rilascio_codice,
    scadenza_documento: dati.scadenza_documento,
    codice_fiscale: dati.codice_fiscale,
    indirizzo: dati.indirizzo,
    cap: dati.cap,
    citta: dati.citta,
    provincia: dati.provincia,
    paese: dati.paese,
    lingua: dati.lingua,
    note: dati.note,
  };
}

/**
 * Campi da scrivere: solo quelli compilati. Con soloVuoti anche solo quelli
 * che l'anagrafica non ha già.
 */
function campiDaScrivere(dati, presente = {}, soloVuoti = false) {
  return Object.fromEntries(
    Object.entries(datiOspite(dati)).filter(
      ([campo, valore]) =>
        valore !== undefined && valore !== null && valore !== '' && !(soloVuoti && presente[campo]),
    ),
  );
}

module.exports = { datiOspite, campiDaScrivere };
