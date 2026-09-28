// Ruoli e permessi. Stessi codici delle tabelle ruoli e permessi
// (database/schema.sql): usare queste costanti al posto delle stringhe evita
// errori di battitura sparsi nel codice.

const RUOLI = Object.freeze({
  ADMIN: 'admin',
  RECEPTIONIST: 'receptionist',
  HOUSEKEEPER_SENIOR: 'housekeeper_senior',
  HOUSEKEEPER: 'housekeeper',
  CLIENTE: 'cliente',
});

// Ruoli che l'admin può assegnare a un account staff. L'admin non è
// assegnabile da API (si crea solo da seed) per evitare escalation.
const RUOLI_ASSEGNABILI = Object.freeze([
  RUOLI.RECEPTIONIST,
  RUOLI.HOUSEKEEPER_SENIOR,
  RUOLI.HOUSEKEEPER,
]);

// Squadre della chat interna: ogni membro dello staff entra in automatico
// nel gruppo della propria squadra.
const SQUADRE = Object.freeze({
  receptionist: Object.freeze([RUOLI.RECEPTIONIST]),
  housekeeping: Object.freeze([RUOLI.HOUSEKEEPER_SENIOR, RUOLI.HOUSEKEEPER]),
});

const PERMESSI = Object.freeze({
  CAMERE_GESTISCI: 'camere.gestisci',
  TARIFFE_GESTISCI: 'tariffe.gestisci',
  CALENDARI_GESTISCI: 'calendari.gestisci',
  PRENOTAZIONI_LEGGI: 'prenotazioni.leggi',
  PRENOTAZIONI_GESTISCI: 'prenotazioni.gestisci',
  CHECKIN_GESTISCI: 'checkin.gestisci',
  OSPITI_GESTISCI: 'ospiti.gestisci',
  ALLOGGIATI_INVIA: 'alloggiati.invia',
  PAGAMENTI_LEGGI: 'pagamenti.leggi',
  PAGAMENTI_REGISTRA: 'pagamenti.registra',
  FATTURE_GESTISCI: 'fatture.gestisci',
  PULIZIE_LEGGI: 'pulizie.leggi',
  PULIZIE_ESEGUI: 'pulizie.esegui',
  PULIZIE_GESTISCI: 'pulizie.gestisci',
  MANUTENZIONE_SEGNALA: 'manutenzione.segnala',
  MANUTENZIONE_GESTISCI: 'manutenzione.gestisci',
  RECENSIONI_MODERA: 'recensioni.modera',
  CHAT_ASSISTENZA: 'chat.assistenza',
  FAQ_GESTISCI: 'faq.gestisci',
  CONTENUTI_GESTISCI: 'contenuti.gestisci',
  UTENTI_GESTISCI: 'utenti.gestisci',
  IMPOSTAZIONI_GESTISCI: 'impostazioni.gestisci',
  ANALYTICS_LEGGI: 'analytics.leggi',
});

const TIPI_TOKEN = Object.freeze(['refresh', 'verifica_email', 'reset_password']);

module.exports = { RUOLI, RUOLI_ASSEGNABILI, SQUADRE, PERMESSI, TIPI_TOKEN };
