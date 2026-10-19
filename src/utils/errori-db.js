// Traduce gli errori del database in ErroreApp con messaggio italiano.
// I trigger usano SIGNAL con un codice MAIUSCOLO; UNIQUE e CHECK hanno nomi
// espliciti (uq_*, chk_*). Un errore non riconosciuto torna com'è (→ 500).

const { ErroreApp } = require('./errori');

const SEGNALI = {
  CAMERA_NON_DISPONIBILE: [409, 'La camera non è disponibile per le date scelte'],
  CAMERA_IN_PRENOTAZIONE: [
    409,
    'Un altro utente sta completando una prenotazione per questa camera: riprova tra qualche minuto',
  ],
  CAPIENZA_SUPERATA: [422, 'Il numero di ospiti supera la capienza della camera'],
  CODICE_SCONTO_GIA_USATO: [409, 'Hai già usato questo codice sconto il numero massimo di volte'],
  CODICE_SCONTO_ESAURITO: [409, 'Il codice sconto ha raggiunto il numero massimo di utilizzi'],
  LIMITE_CONTANTI_SUPERATO: [
    422,
    'Superato il limite di legge per i pagamenti in contanti su questa prenotazione',
  ],
  FATTURA_NON_MODIFICABILE: [
    409,
    'La fattura è già stata emessa e non si può modificare: emetti una nota di credito',
  ],
  FATTURA_NON_ELIMINABILE: [409, 'Una fattura emessa non si può eliminare'],
  RECENSIONE_NON_CONSENTITA: [422, 'Puoi lasciare una recensione solo a soggiorno concluso'],
  CHAT_NON_CONSENTITA: [403, 'Questo utente non può partecipare alla conversazione'],
  INTERVALLO_DATE_NON_VALIDO: [400, 'La data di fine deve essere successiva a quella di inizio'],
};

const DUPLICATI = {
  uq_utenti_email: 'Esiste già un account con questa email',
  uq_utenti_ospite: 'Questa anagrafica è già collegata a un altro account',
  uq_traduzioni: 'Esiste già una traduzione per questo campo e questa lingua',
  uq_documenti_legali: 'Esiste già questa versione del documento in questa lingua',
  uq_tipologie_camera_nome: 'Esiste già una tipologia con questo nome',
  uq_tipologie_camera_slug: 'Esiste già una tipologia con questo indirizzo (slug)',
  uq_servizi_nome: 'Esiste già un servizio con questo nome',
  uq_camere_numero: 'Esiste già una camera con questo numero',
  uq_piani_tariffari_nome: 'Esiste già un piano tariffario con questo nome',
  uq_piani_tariffari_predefinito: 'Può esserci un solo piano tariffario predefinito',
  uq_codici_sconto_codice: 'Esiste già un codice sconto uguale',
  uq_pacchetti_slug: 'Esiste già un pacchetto con questo indirizzo (slug)',
  uq_livelli_fedelta_codice: 'Esiste già un livello fedeltà con questo codice',
  uq_livelli_fedelta_punti: 'Esiste già un livello fedeltà con questo punteggio minimo',
  uq_ospiti_documento: 'Esiste già un ospite con questo documento',
  uq_date_bloccate_ical: 'Evento del calendario già importato',
  uq_prenotazioni_esterna: 'Prenotazione del canale esterno già importata',
  uq_blocchi_temporanei_sessione: 'Hai già una camera bloccata in questa sessione di pagamento',
  uq_fatture_numero: 'Numero di fattura già usato',
  uq_pagamenti_transazione: 'Transazione di pagamento già registrata',
  uq_movimenti_punti_prenotazione: 'Punti già assegnati per questa prenotazione',
  uq_attivita_pulizia: 'Esiste già un’attività di pulizia di questo tipo per la camera e il giorno',
  uq_recensioni_prenotazione: 'Hai già lasciato una recensione per questo soggiorno',
};

const VINCOLI = {
  chk_utenti_punti: 'Il saldo punti non può diventare negativo',
  chk_tipologie_camera_prezzo: 'Il prezzo base non può essere negativo',
  chk_tipologie_camera_ospiti: 'La capienza deve essere almeno 1',
  chk_servizi_prezzo: 'Il prezzo del servizio non può essere negativo',
  chk_camere_ospiti: 'La capienza della camera deve essere almeno 1',
  chk_piani_tariffari_penale: 'La penale deve essere tra 0 e 100%',
  chk_piani_tariffari_acconto: 'L’acconto deve essere tra 0 e 100%',
  chk_periodi_tariffari_date: 'La data di fine periodo non può precedere quella di inizio',
  chk_periodi_tariffari_giorni: 'Seleziona almeno un giorno della settimana',
  chk_periodi_tariffari_prezzo: 'Il prezzo fisso non può essere negativo',
  chk_promozioni_date: 'La fine del periodo di soggiorno non può precedere l’inizio',
  chk_promozioni_valore: 'Lo sconto deve essere positivo (al massimo 100%)',
  chk_promozioni_ospiti: 'Il numero massimo di ospiti non può essere inferiore al minimo',
  chk_codici_sconto_valore: 'Lo sconto deve essere positivo (al massimo 100%)',
  chk_codici_sconto_date: 'La fine validità non può precedere l’inizio',
  chk_pacchetti_prezzo: 'Il prezzo del pacchetto non può essere negativo',
  chk_tassa_soggiorno_date: 'La fine validità non può precedere l’inizio',
  chk_tassa_soggiorno_importo: 'L’importo della tassa non può essere negativo',
  chk_livelli_fedelta_sconto: 'Lo sconto deve essere tra 0 e 100%',
  chk_consensi_soggetto: 'Il consenso deve riferirsi a un utente, un visitatore o un ospite',
  chk_date_bloccate_date: 'La data di fine deve essere successiva a quella di inizio',
  chk_prenotazioni_date: 'La data di partenza deve essere successiva a quella di arrivo',
  chk_prenotazioni_adulti: 'Serve almeno un adulto',
  chk_prenotazioni_importi: 'Gli importi della prenotazione non sono validi',
  chk_prenotazioni_penale: 'La penale deve essere tra 0 e 100%',
  chk_prenotazioni_servizi_quantita: 'La quantità deve essere almeno 1',
  chk_prenotazioni_servizi_totale: 'Importi del servizio non validi',
  chk_blocchi_temporanei_date: 'La data di partenza deve essere successiva a quella di arrivo',
  chk_fatture_cliente: 'Indica la ragione sociale oppure nome e cognome del cliente',
  chk_fatture_nota_credito: 'Una nota di credito deve riferirsi alla fattura originale',
  chk_fatture_righe_natura: 'Una riga senza IVA richiede il codice natura dell’esenzione',
  chk_pagamenti_importo: 'L’importo deve essere maggiore di zero',
  chk_movimenti_punti: 'Il movimento punti non può essere zero',
  chk_recensioni_voti: 'I voti devono essere tra 1 e 5',
  chk_conversazioni_interlocutore: 'La conversazione non ha un interlocutore valido',
  chk_messaggi_mittente: 'Il messaggio non ha un mittente valido',
  chk_eventi_speciali_date: 'La data di fine non può precedere quella di inizio',
  chk_eventi_speciali_impatto: 'L’impatto deve essere tra 1 e 10',
};

/** Messaggio originale del driver, anche se Sequelize lo ha avvolto. */
const messaggioDriver = (err) => err?.original?.sqlMessage ?? err?.parent?.sqlMessage ?? '';

/**
 * @param {unknown} err
 * @returns {ErroreApp|unknown} l'errore tradotto, o quello originale
 */
function traduciErroreDb(err) {
  if (!err || err instanceof ErroreApp) return err;
  const testo = messaggioDriver(err);

  const segnale = SEGNALI[testo];
  if (segnale) return new ErroreApp(segnale[0], testo, segnale[1]);

  if (err.name === 'SequelizeUniqueConstraintError') {
    const vincolo = Object.keys(DUPLICATI).find(
      (k) => testo.includes(`'${k}'`) || testo.includes(`.${k}'`),
    );
    return new ErroreApp(409, 'DATO_DUPLICATO', DUPLICATI[vincolo] ?? 'Il dato esiste già');
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return /Cannot delete or update a parent row/i.test(testo)
      ? new ErroreApp(409, 'RISORSA_IN_USO', 'Impossibile eliminare: il dato è usato altrove')
      : new ErroreApp(422, 'RIFERIMENTO_NON_VALIDO', 'Un dato collegato non esiste');
  }

  const chk = testo.match(/\b(chk_\w+)/);
  if (chk) return new ErroreApp(422, chk[1].toUpperCase(), VINCOLI[chk[1]] ?? 'Dato non valido');

  if (err.name === 'SequelizeValidationError') {
    const dettagli = err.errors?.map((e) => ({ campo: e.path, messaggio: e.message }));
    return new ErroreApp(422, 'DATI_NON_VALIDI', 'Alcuni dati non sono validi', dettagli);
  }

  return err;
}

module.exports = { traduciErroreDb, SEGNALI, DUPLICATI, VINCOLI };
