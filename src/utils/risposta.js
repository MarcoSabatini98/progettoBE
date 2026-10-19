// src/utils/risposta.js
//
// Formato unico delle risposte:
//   successo → { successo: true, dati }
//   errore   → { successo: false, errore: { codice, messaggio, dettagli } }
//              (lo scrive il middleware degli errori a partire da ErroreApp)
//
// I controller non hanno try/catch: con Express 5 un errore lanciato da una
// funzione async arriva da solo al middleware degli errori.

function inviaSuccesso(res, status, dati) {
  return res.status(status).json({ successo: true, dati: dati ?? null });
}

/** File generato al volo (PDF, iCal, tracciati): contenuto è un Buffer o una stringa. */
function inviaFile(res, { nome, tipo, contenuto, inLinea = false }) {
  res.type(tipo);
  if (inLinea) {
    res.set('Content-Disposition', `inline; filename="${nome}"`);
  } else {
    res.attachment(nome);
  }
  return res.send(contenuto);
}

module.exports = { inviaSuccesso, inviaFile };
