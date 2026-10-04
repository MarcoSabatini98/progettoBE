// src/jobs/index.js
//
// Attività pianificate. La logica sta nei service: qui c'è solo il "quando".
// server.js chiama avviaJob dopo la connessione al database e fermaJob allo
// spegnimento.
//
// Gli orari seguono l'impostazione `fuso_orario` (letta all'avvio: se cambia
// serve un riavvio). Un job non parte se il giro precedente è ancora in corso;
// un errore finisce nel log e non ferma gli altri.
//
// ponytail: timer nel processo. Su Render il piano gratuito si addormenta
// senza traffico e i job si fermano con lui; con più istanze ogni job
// girerebbe su tutte (servirebbe un lock sul DB).

const cron = require('node-cron');
const logger = require('../config/logger');
const impostazioni = require('../services/impostazioni.service');
const disponibilitaService = require('../services/disponibilita.service');
const prenotazioniService = require('../services/prenotazioni.service');
const pagamentiService = require('../services/pagamenti.service');
const chatService = require('../services/chat.service');
const calendariService = require('../services/calendari.service');
const pulizieService = require('../services/pulizie.service');
const alloggiatiService = require('../services/alloggiati.service');
const notificheService = require('../services/notifiche.service');
const authService = require('../services/auth.service');

// quando: minuto ora giorno mese giorno-settimana.
// I job con una data (promemoria, pulizie) girano di giorno: oggi() è in UTC
// e in Europa coincide con la data locale dopo le 2 di notte.
const JOB = [
  {
    nome: 'blocchi-scaduti',
    quando: '*/5 * * * *', // ogni 5 minuti
    descrizione: 'Libera le camere bloccate da pagamenti online mai conclusi',
    esegui: () => disponibilitaService.eliminaBlocchiScaduti(),
  },
  {
    nome: 'prenotazioni-scadute',
    quando: '*/10 * * * *', // ogni 10 minuti
    descrizione: 'Cancella le prenotazioni in attesa non pagate entro la scadenza',
    esegui: () => prenotazioniService.scadiInAttesa(),
  },
  {
    nome: 'pagamenti-abbandonati',
    quando: '0 * * * *', // ogni ora
    descrizione: 'Annulla i pagamenti online iniziati e mai conclusi da 24 ore',
    esegui: () => pagamentiService.annullaOnlineAbbandonati(),
  },
  {
    nome: 'riepiloghi-chat',
    quando: '*/5 * * * *', // ogni 5 minuti
    descrizione: 'Email a chi ha messaggi della chat non letti',
    esegui: () => chatService.inviaRiepiloghi(),
  },
  {
    nome: 'calendari-esterni',
    quando: '*/15 * * * *', // ogni 15 minuti
    descrizione: 'Importa i calendari delle OTA (Booking, Airbnb, ...)',
    esegui: () => calendariService.sincronizzaTutti(),
  },
  {
    nome: 'pulizie-giornata',
    quando: '0 6 * * *', // alle 6:00
    descrizione:
      'Riporta le pulizie non finite, crea i riassetti del giorno e, se attivo, li assegna',
    esegui: () => pulizieService.preparaGiornata(),
  },
  {
    nome: 'alloggiati-promemoria',
    quando: '0 9 * * *', // alle 9:00
    descrizione: 'Avvisa la reception delle schedine Alloggiati ancora da inviare',
    esegui: () => alloggiatiService.avvisaDaInviare(),
  },
  {
    nome: 'promemoria-checkin',
    quando: '0 10 * * *', // alle 10:00
    descrizione: 'Promemoria agli ospiti che arrivano domani',
    esegui: () => prenotazioniService.inviaPromemoriaCheckin(),
  },
  {
    nome: 'prenotazioni-dimenticate',
    quando: '0 13 * * *', // alle 13:00, dopo l'orario di check-out
    descrizione: 'No-show per gli arrivi mancati, partenze concluse dei giorni passati',
    esegui: () => prenotazioniService.chiudiDimenticate(),
  },
  {
    nome: 'invito-recensione',
    quando: '0 17 * * *', // alle 17:00
    descrizione: 'Invita a recensire chi è partito ieri',
    esegui: () => prenotazioniService.invitaARecensire(),
  },
  {
    nome: 'notifiche-vecchie',
    quando: '0 3 * * *', // alle 3:00
    descrizione: 'Elimina le notifiche lette da più di 90 giorni',
    esegui: () => notificheService.eliminaVecchie(),
  },
  {
    nome: 'chat-vecchie',
    quando: '30 3 * * *', // alle 3:30
    descrizione: 'Elimina le conversazioni chiuse oltre la conservazione, con i file',
    esegui: () => chatService.eliminaVecchie(),
  },
  {
    nome: 'token-scaduti',
    quando: '0 4 * * *', // alle 4:00
    descrizione: 'Elimina i token di accesso scaduti',
    esegui: () => authService.eliminaTokenScaduti(),
  },
];

// Allo spegnimento si aspettano i giri in corso al massimo per questo tempo.
const ATTESA_CHIUSURA_MS = 5_000;

/** Un giro di un job: l'esito va nel log di debug, gli errori nel log degli errori. */
async function esegui(job) {
  try {
    const esito = await job.esegui();
    logger.debug(`Job ${job.nome} completato`, { esito });
  } catch (errore) {
    logger.error(`Job ${job.nome} non riuscito`, { errore: errore.stack });
  }
}

async function avviaJob() {
  const fusoOrario = await impostazioni.leggi('fuso_orario', 'Europe/Rome');
  for (const job of JOB) {
    cron.schedule(job.quando, () => esegui(job), {
      name: job.nome,
      timezone: fusoOrario,
      noOverlap: true,
    });
  }
  logger.info(`Job pianificati: ${JOB.length}`, { fuso_orario: fusoOrario });
}

/** Nessun nuovo giro; si aspettano quelli in corso prima di chiudere il database. */
async function fermaJob() {
  await cron.shutdown(ATTESA_CHIUSURA_MS);
}

module.exports = { JOB, esegui, avviaJob, fermaJob };
