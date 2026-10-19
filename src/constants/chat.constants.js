// Chat di assistenza e chat interna dello staff.

// assistenza: cliente o visitatore ↔ struttura; staff: chat interna
const TIPI_CONVERSAZIONE = Object.freeze(['assistenza', 'staff']);

const STATI_CONVERSAZIONE = Object.freeze(['aperta', 'chiusa']);

// Stato di presenza mostrato agli altri membri dello staff.
const STATI_PRESENZA = Object.freeze(['online', 'occupato', 'assente', 'offline']);

// Nomi dei gruppi di squadra creati in automatico (vedi SQUADRE in ruoli.constants).
const GRUPPI_SQUADRA = Object.freeze({
  receptionist: '#receptionist',
  housekeeping: '#housekeeping',
});

const TESTO_MAX = 4000;
const ALLEGATI_MAX = 5;

// Nomi degli eventi del socket, condivisi con il frontend.
//   server → client: MESSAGGIO, MESSAGGIO_MODIFICATO, MESSAGGIO_ELIMINATO,
//                    LETTO, CONVERSAZIONE, PRESENZA, PRESENZE, NOTIFICA
//   client → server: SCRIVE (e ritorno agli altri), PRESENZA (cambio stato)
const EVENTI_SOCKET = Object.freeze({
  MESSAGGIO: 'chat:messaggio',
  MESSAGGIO_MODIFICATO: 'chat:messaggio-modificato',
  MESSAGGIO_ELIMINATO: 'chat:messaggio-eliminato',
  LETTO: 'chat:letto',
  CONVERSAZIONE: 'chat:conversazione',
  SCRIVE: 'chat:scrive',
  PRESENZA: 'chat:presenza',
  PRESENZE: 'chat:presenze',
  NOTIFICA: 'notifica',
});

module.exports = {
  TIPI_CONVERSAZIONE,
  STATI_CONVERSAZIONE,
  STATI_PRESENZA,
  GRUPPI_SQUADRA,
  TESTO_MAX,
  ALLEGATI_MAX,
  EVENTI_SOCKET,
};
