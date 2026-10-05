// src/services/calendari.service.js
//
// Calendari:
//  - chiusure manuali (una camera o tutta la struttura);
//  - feed iCal in uscita, uno per camera, da incollare nelle OTA;
//  - importazione dei calendari delle OTA come date bloccate.

const { sequelize } = require('../models');
const config = require('../config/env');
const logger = require('../config/logger');
const calendariRepo = require('../repositories/calendari.repository');
const camereRepo = require('../repositories/camere.repository');
const notifiche = require('./notifiche.service');
const { leggiIcs, scriviIcs } = require('./helpers/ical');
const { PERMESSI } = require('../constants/ruoli.constants');
const { oggi, aggiungiGiorni } = require('../utils/date');
const { nonTrovato, richiestaNonValida } = require('../utils/errori');

const ERRORI_PRIMA_DI_AVVISARE = 5;
const GIORNI_PASSATI_NEL_FEED = 30;

function controllaIntervallo(inizio, fine) {
  if (!inizio || !fine || fine <= inizio) {
    throw richiestaNonValida('INTERVALLO_DATE_NON_VALIDO', "La fine deve essere dopo l'inizio");
  }
}

// ─────────────────────────────────────
// Chiusure manuali
// ─────────────────────────────────────

/** query: { dal, al, camera_id } */
async function chiusure(query = {}) {
  return await calendariRepo.trovaChiusure({
    dal: query.dal,
    al: query.al,
    camera_id: query.camera_id,
  });
}

async function chiusuraManuale(id) {
  const chiusura = await calendariRepo.trovaChiusuraPerId(id);
  if (!chiusura) {
    throw nonTrovato('CHIUSURA_NON_TROVATA', 'Chiusura non trovata');
  }
  if (chiusura.origine !== 'manuale') {
    throw richiestaNonValida(
      'CHIUSURA_IMPORTATA',
      'Questa data arriva da un calendario esterno: modificala sul canale',
    );
  }
  return chiusura;
}

/**
 * Nuova chiusura. Le prenotazioni già presenti restano: vengono solo
 * restituite, così lo staff decide cosa farne.
 * dati: { camera_id?, data_inizio, data_fine, motivo? }
 */
async function blocca(dati, contesto) {
  controllaIntervallo(dati.data_inizio, dati.data_fine);
  const nuova = await calendariRepo.creaChiusura({
    camera_id: dati.camera_id ?? null,
    data_inizio: dati.data_inizio,
    data_fine: dati.data_fine,
    motivo: dati.motivo ?? null,
    creato_da: contesto.utenteId,
  });
  return {
    chiusura: await calendariRepo.trovaChiusuraPerId(nuova.id),
    prenotazioni_in_conflitto: await calendariRepo.trovaPrenotazioniSovrapposte(
      nuova.camera_id,
      nuova.data_inizio,
      nuova.data_fine,
    ),
  };
}

async function aggiornaBlocco(id, dati) {
  const chiusura = await chiusuraManuale(id);
  const inizio = dati.data_inizio ?? chiusura.data_inizio;
  const fine = dati.data_fine ?? chiusura.data_fine;
  controllaIntervallo(inizio, fine);
  await calendariRepo.aggiornaChiusura(id, {
    data_inizio: inizio,
    data_fine: fine,
    motivo: dati.motivo,
  });
  return await calendariRepo.trovaChiusuraPerId(id);
}

async function sblocca(id) {
  await chiusuraManuale(id);
  await calendariRepo.eliminaChiusura(id);
}

// ─────────────────────────────────────
// Esportazione verso le OTA
// ─────────────────────────────────────

function dominio() {
  return new URL(config.urlApp).hostname;
}

/** Feed .ics di una camera, dal link segreto con token_ical. */
async function feed(token) {
  const camera = token ? await camereRepo.trovaCameraPerTokenIcal(token) : null;
  if (!camera) {
    throw nonTrovato('CALENDARIO_NON_TROVATO', 'Calendario non trovato');
  }

  const dal = aggiungiGiorni(oggi(), -GIORNI_PASSATI_NEL_FEED);
  const prenotazioni = await calendariRepo.trovaPrenotazioniCameraDal(camera.id, dal);
  const chiuse = await calendariRepo.trovaChiusureCameraDal(camera.id, dal);

  const eventi = [
    ...prenotazioni.map((prenotazione) => ({
      uid: `prenotazione-${prenotazione.id}`,
      inizio: prenotazione.data_arrivo,
      fine: prenotazione.data_partenza,
    })),
    ...chiuse.map((chiusura) => ({
      uid: `chiusura-${chiusura.id}`,
      inizio: chiusura.data_inizio,
      fine: chiusura.data_fine,
    })),
  ];
  return scriviIcs(`Calendario camera ${camera.numero}`, dominio(), eventi);
}

/** Per ogni camera, il link da incollare nelle OTA. */
async function linkEsportazione() {
  const camere = await camereRepo.trovaCamere();
  return camere.map((camera) => ({
    camera_id: camera.id,
    numero: camera.numero,
    nome: camera.nome,
    url: camera.token_ical ? `${config.urlApp}/api/calendari/feed/${camera.token_ical}.ics` : null,
  }));
}

// ─────────────────────────────────────
// Calendari esterni
// ─────────────────────────────────────

async function calendarioOppure404(id) {
  const calendario = await calendariRepo.trovaCalendarioPerId(id);
  if (!calendario) {
    throw nonTrovato('CALENDARIO_NON_TROVATO', 'Calendario esterno non trovato');
  }
  return calendario;
}

async function elencoCalendari() {
  return await calendariRepo.trovaCalendari();
}

async function dettaglioCalendario(id) {
  return await calendarioOppure404(id);
}

/** dati: { camera_id, canale, nome?, url, attivo? } */
async function creaCalendario(dati) {
  const nuovo = await calendariRepo.creaCalendario({
    camera_id: dati.camera_id,
    canale: dati.canale,
    nome: dati.nome ?? null,
    url: dati.url,
    attivo: dati.attivo ?? true,
  });
  return await calendarioOppure404(nuovo.id);
}

/**
 * Disattivato, le sue date bloccate vanno via subito: il job non lo legge più
 * e resterebbero ferme. Riattivato, la prossima sincronizzazione le reimporta.
 */
async function aggiornaCalendario(id, dati) {
  await calendarioOppure404(id);
  await sequelize.transaction(async (transaction) => {
    await calendariRepo.aggiornaCalendario(
      id,
      {
        canale: dati.canale,
        nome: dati.nome,
        url: dati.url,
        attivo: dati.attivo,
      },
      transaction,
    );
    if (dati.attivo === false) {
      await calendariRepo.eliminaImportatiTranne(id, [], transaction);
    }
  });
  return await calendarioOppure404(id);
}

async function eliminaCalendario(id) {
  await calendarioOppure404(id);
  await calendariRepo.eliminaCalendario(id);
}

// ─────────────────────────────────────
// Importazione
// ─────────────────────────────────────

async function scarica(url) {
  if (!['https:', 'http:'].includes(new URL(url).protocol)) {
    throw new Error('Il link del calendario deve iniziare con https://');
  }
  const risposta = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'text/calendar' },
  });
  if (!risposta.ok) {
    throw new Error(`Il canale ha risposto ${risposta.status}`);
  }
  const testo = await risposta.text();
  if (!testo.includes('BEGIN:VCALENDAR')) {
    throw new Error('Il link non restituisce un calendario');
  }
  return testo;
}

function nomeCanale(calendario) {
  return calendario.nome ?? calendario.canale;
}

// Un evento nuovo del canale sopra una prenotazione nostra = overbooking.
async function avvisaOverbooking(calendario, evento) {
  const conflitti = await calendariRepo.trovaPrenotazioniSovrapposte(
    calendario.camera_id,
    evento.inizio,
    evento.fine,
  );
  if (conflitti.length === 0) {
    return;
  }
  await notifiche.aChiPuo(PERMESSI.PRENOTAZIONI_GESTISCI, {
    tipo: 'prenotazione',
    priorita: 'errore',
    codice: 'overbooking',
    parametri: {
      camera: calendario.camera?.numero,
      canale: nomeCanale(calendario),
      inizio: evento.inizio,
      fine: evento.fine,
    },
    titolo: `Overbooking camera ${calendario.camera?.numero} (${nomeCanale(calendario)}) dal ${evento.inizio} al ${evento.fine}`,
    testo: conflitti.map((prenotazione) => prenotazione.codice).join(', '),
    link: `/staff/prenotazioni/${conflitti[0].id}`,
  });
}

async function registraErrore(calendario, errore) {
  const errori = calendario.errori_consecutivi + 1;
  await calendariRepo.aggiornaCalendario(calendario.id, {
    ultima_sincronizzazione_il: new Date(),
    ultimo_esito: errore.message.slice(0, 255),
    errori_consecutivi: errori,
  });
  logger.warn('Sincronizzazione iCal fallita', {
    calendario: calendario.id,
    errore: errore.message,
  });

  if (errori === ERRORI_PRIMA_DI_AVVISARE) {
    await notifiche.aChiPuo(PERMESSI.CALENDARI_GESTISCI, {
      tipo: 'sistema',
      priorita: 'errore',
      codice: 'calendario_non_sincronizzato',
      parametri: { canale: nomeCanale(calendario) },
      titolo: `Il calendario ${nomeCanale(calendario)} non si sincronizza`,
      testo: errore.message,
      link: `/staff/calendari/${calendario.id}`,
    });
  }
}

/**
 * Sincronizza un calendario: gli eventi futuri del canale diventano date
 * bloccate (aggiornate per UID, tolte se il canale le ha cancellate).
 * Un calendario disattivato non si legge: le sue date sono state tolte apposta.
 */
async function sincronizza(id) {
  const calendario = await calendarioOppure404(id);
  if (!calendario.attivo) {
    throw richiestaNonValida(
      'CALENDARIO_DISATTIVATO',
      'Il calendario è disattivato: riattivalo per sincronizzarlo',
    );
  }
  let eventi;
  try {
    eventi = leggiIcs(await scarica(calendario.url)).filter((evento) => evento.fine > oggi());
  } catch (errore) {
    await registraErrore(calendario, errore);
    throw richiestaNonValida(
      'SINCRONIZZAZIONE_FALLITA',
      `Sincronizzazione non riuscita: ${errore.message}`,
    );
  }

  const giaImportati = new Set(await calendariRepo.trovaUidImportati(calendario.id));
  const righe = eventi.map((evento) => ({
    camera_id: calendario.camera_id,
    data_inizio: evento.inizio,
    data_fine: evento.fine,
    motivo: evento.titolo ?? `Occupato su ${nomeCanale(calendario)}`,
    origine: 'ical',
    calendario_id: calendario.id,
    uid_esterno: evento.uid,
  }));

  await sequelize.transaction(async (transaction) => {
    const uid = eventi.map((evento) => evento.uid);
    await calendariRepo.eliminaImportatiTranne(calendario.id, uid, transaction);
    await calendariRepo.salvaImportati(righe, transaction);
  });

  for (const evento of eventi) {
    if (!giaImportati.has(evento.uid)) {
      await avvisaOverbooking(calendario, evento);
    }
  }

  await calendariRepo.aggiornaCalendario(calendario.id, {
    ultima_sincronizzazione_il: new Date(),
    ultimo_esito: `OK: ${eventi.length} eventi`,
    errori_consecutivi: 0,
  });
  return { eventi: eventi.length };
}

/** Job: tutti i calendari attivi, uno alla volta. Gli errori restano sul calendario. */
async function sincronizzaTutti() {
  const attivi = await calendariRepo.trovaCalendariAttivi();
  let riusciti = 0;
  for (const calendario of attivi) {
    try {
      await sincronizza(calendario.id);
      riusciti += 1;
    } catch {
      // già registrato da registraErrore
    }
  }
  return { calendari: attivi.length, riusciti };
}

module.exports = {
  chiusure,
  blocca,
  aggiornaBlocco,
  sblocca,
  feed,
  linkEsportazione,
  elencoCalendari,
  dettaglioCalendario,
  creaCalendario,
  aggiornaCalendario,
  eliminaCalendario,
  sincronizza,
  sincronizzaTutti,
};
