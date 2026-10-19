// src/services/prenotazioni.service.js
//
// Ciclo di vita della prenotazione:
//   in_attesa → confermata → in_soggiorno → conclusa
//            ↘ cancellata      ↘ no_show
// Disponibilità, capienza, codice, uso dei codici sconto, pulizie e punti
// fedeltà li controllano i trigger del DB; qui prezzo, penali, permessi e email.

const { transazione } = require('../models');
const config = require('../config/env');
const logger = require('../config/logger');
const prenotazioniRepo = require('../repositories/prenotazioni.repository');
const ospitiRepo = require('../repositories/ospiti.repository');
const camereRepo = require('../repositories/camere.repository');
const utentiRepo = require('../repositories/utenti.repository');
const impostazioni = require('./impostazioni.service');
const tariffe = require('./tariffe.service');
const disponibilita = require('./disponibilita.service');
const ospitiService = require('./ospiti.service');
const email = require('./email.service');
const notifiche = require('./notifiche.service');
const { totaleServizio } = require('./helpers/calcolo-prezzo');
const { STATI_ATTIVI } = require('../constants/prenotazioni.constants');
const { RUOLI, PERMESSI } = require('../constants/ruoli.constants');
const { nonTrovato, conflitto, vietato, richiestaNonValida } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { centesimi, euro, percentualeDi, formatoEuro } = require('../utils/denaro');
const { oggi, aggiungiGiorni, aggiungiOre, istanteLocale, dataItaliana } = require('../utils/date');
const { hash, tokenCasuale } = require('../utils/sicurezza');

// Stati in cui il cliente può ancora cambiare la propria prenotazione.
const STATI_MODIFICABILI_CLIENTE = ['in_attesa', 'confermata'];

// Campi che lo staff può cambiare con modifica().
const CAMPI_MODIFICABILI = [
  'camera_id',
  'data_arrivo',
  'data_partenza',
  'adulti',
  'bambini',
  'note_interne',
  'richieste_speciali',
  'ora_arrivo_prevista',
];

function eStaff(contesto) {
  return Boolean(contesto?.ruolo && contesto.ruolo !== RUOLI.CLIENTE);
}

function richiediStato(prenotazione, ammessi, azione) {
  if (!ammessi.includes(prenotazione.stato)) {
    throw conflitto(
      'STATO_NON_VALIDO',
      `Non puoi ${azione} una prenotazione in stato "${prenotazione.stato.replace('_', ' ')}"`,
    );
  }
}

function controllaProprietario(prenotazione, contesto) {
  if (!eStaff(contesto) && prenotazione.utente_id !== contesto?.utenteId) {
    throw vietato('PRENOTAZIONE_ALTRUI', 'Questa prenotazione non è tua');
  }
}

async function prenotazioneDaModificare(id, transaction) {
  const prenotazione = await prenotazioniRepo.bloccaPrenotazione(id, transaction);
  if (!prenotazione) {
    throw nonTrovato('PRENOTAZIONE_NON_TROVATA', 'Prenotazione non trovata');
  }
  return prenotazione;
}

async function cameraDaBloccare(id, transaction) {
  const camera = await camereRepo.bloccaCamera(id, transaction);
  if (!camera) {
    throw nonTrovato('CAMERA_NON_TROVATA', 'Camera non trovata');
  }
  return camera;
}

// Importi del preventivo come colonne della prenotazione.
function importiDalPreventivo(preventivo) {
  return {
    importo_soggiorno: preventivo.importo_soggiorno,
    sconto_promozione: preventivo.sconto_promozione,
    sconto_codice: preventivo.sconto_codice,
    percentuale_fedelta: preventivo.percentuale_fedelta,
    sconto_fedelta: preventivo.sconto_fedelta,
    importo_pacchetto: preventivo.importo_pacchetto,
    tassa_soggiorno: preventivo.tassa_soggiorno,
    acconto_richiesto: preventivo.acconto_richiesto,
    promozione_id: preventivo.promozione?.id ?? null,
    dettaglio_prezzo: {
      notti: preventivo.notti,
      promozione: preventivo.promozione,
      codice_sconto: preventivo.codice_sconto,
      pacchetto: preventivo.pacchetto,
    },
  };
}

// ─────────────────────────────────────
// Lettura
// ─────────────────────────────────────

async function dettaglio(id) {
  const prenotazione = await prenotazioniRepo.trovaDettaglio(id);
  if (!prenotazione) {
    throw nonTrovato('PRENOTAZIONE_NON_TROVATA', 'Prenotazione non trovata');
  }
  return prenotazione;
}

async function dettaglioCliente(where) {
  const prenotazione = await prenotazioniRepo.trovaDettaglioCliente(where);
  if (!prenotazione) {
    throw nonTrovato('PRENOTAZIONE_NON_TROVATA', 'Prenotazione non trovata');
  }
  return prenotazione;
}

// Dopo un'azione fatta anche dal cliente: lui non vede le note interne.
async function dettaglioPer(id, contesto) {
  return eStaff(contesto) ? await dettaglio(id) : await dettaglioCliente({ id });
}

/** Area cliente: le prenotazioni dell'account, dalle più recenti. */
async function mie(utenteId, query) {
  const p = pagina(query);
  const trovate = await prenotazioniRepo.trovaPrenotazioniCliente(utenteId, p);
  return risultato(trovate, p);
}

async function mia(utenteId, id) {
  return await dettaglioCliente({ id, utente_id: utenteId });
}

/** Chi ha prenotato senza account ritrova la prenotazione con codice + email. */
async function perCodice(codice, emailTitolare) {
  const trovata = await prenotazioniRepo.trovaPerCodice(String(codice).trim().toUpperCase());
  const emailGiusta =
    trovata?.titolare?.email?.toLowerCase() === String(emailTitolare).trim().toLowerCase();
  if (!emailGiusta) {
    throw richiestaNonValida(
      'PRENOTAZIONE_NON_TROVATA',
      'Nessuna prenotazione con questo codice e questa email',
    );
  }
  return await dettaglioCliente({ id: trovata.id });
}

async function elenco(query) {
  const p = pagina(query);
  const trovate = await prenotazioniRepo.trovaPrenotazioni(query, p);
  return risultato(trovate, p);
}

/** Cruscotto reception: arrivi, partenze e ospiti in casa di un giorno. */
async function giornata(giorno = oggi()) {
  const [arrivi, partenze, inCasa] = await Promise.all([
    prenotazioniRepo.trovaArrivi(giorno),
    prenotazioniRepo.trovaPartenze(giorno),
    prenotazioniRepo.trovaInCasa(),
  ]);
  return { giorno, arrivi, partenze, in_casa: inCasa };
}

// ─────────────────────────────────────
// Email al titolare
// ─────────────────────────────────────

/**
 * Email al titolare e, se ha un account, notifica nella sua campanella.
 * Non blocca mai l'operazione: un errore finisce nel log.
 */
async function notifica(id, modello, extra = {}) {
  try {
    const prenotazione = await prenotazioniRepo.trovaDettaglio(id);
    await notifiche.alCliente(prenotazione, modello);
    const cliente = prenotazione?.titolare;
    if (!cliente?.email) {
      return;
    }
    const orari = await impostazioni.leggiMolte(['orario_checkin', 'orario_checkout']);
    await email.invia({
      a: cliente.email,
      modello,
      lingua: cliente.lingua,
      dati: {
        nome: cliente.nome,
        codice: prenotazione.codice,
        arrivo: dataItaliana(prenotazione.data_arrivo),
        partenza: dataItaliana(prenotazione.data_partenza),
        totale: formatoEuro(prenotazione.totale),
        acconto: formatoEuro(prenotazione.acconto_richiesto),
        penale: prenotazione.penale_applicata ? formatoEuro(prenotazione.penale_applicata) : null,
        checkin: orari.orario_checkin,
        checkout: orari.orario_checkout,
        ...extra,
      },
    });
  } catch (errore) {
    logger.warn('Notifica prenotazione non inviata', {
      prenotazione: id,
      modello,
      errore: errore.message,
    });
  }
}

/** Link di check-in online nuovo a ogni invio: quello vecchio smette di valere. */
async function linkCheckin(id) {
  const token = await generaTokenCheckin(id);
  return `${config.urlFrontend}/checkin-online?token=${token}`;
}

async function notificaConferma(id) {
  await notifica(id, 'prenotazione_confermata', { link: await linkCheckin(id) });
}

async function notificaRicevuta(prenotazione) {
  const fuso = await impostazioni.leggi('fuso_orario', 'Europe/Rome');
  const scadenza = prenotazione.scade_il
    ? prenotazione.scade_il.toLocaleString('it-IT', { timeZone: fuso })
    : null;
  await notifica(prenotazione.id, 'prenotazione_ricevuta', {
    scadenza,
    link: `${config.urlFrontend}/prenotazioni/${prenotazione.codice}`,
  });
}

// ─────────────────────────────────────
// Creazione
// ─────────────────────────────────────

/**
 * Anagrafica del titolare. Per un cliente registrato è la sua (creata al primo
 * utilizzo dai dati dell'account), altrimenti quella dei dati inviati.
 * @returns {Promise<number>} id dell'ospite
 */
async function titolare(utenteId, datiTitolare, transaction) {
  if (!utenteId) {
    if (!datiTitolare?.nome || !datiTitolare?.cognome) {
      throw richiestaNonValida('TITOLARE_MANCANTE', 'Indica nome e cognome di chi prenota');
    }
    const ospite = await ospitiService.trovaOCrea(datiTitolare, transaction);
    return ospite.id;
  }

  const utente = await utentiRepo.trovaUtentePerId(utenteId, transaction);
  if (!utente) {
    throw nonTrovato('UTENTE_NON_TROVATO', 'Utente non trovato');
  }
  if (utente.ospite_id) {
    return utente.ospite_id;
  }

  const anagrafica = await ospitiRepo.creaOspite(
    {
      nome: utente.nome,
      cognome: utente.cognome,
      email: utente.email,
      telefono: utente.telefono,
      lingua: utente.lingua,
      utente_id: utente.id,
    },
    transaction,
  );
  await utentiRepo.aggiornaUtente(utente.id, { ospite_id: anagrafica.id }, transaction);
  return anagrafica.id;
}

/**
 * Camera della prenotazione. Online è quella bloccata dalla sessione di
 * pagamento; lo staff può indicarla direttamente.
 */
async function cameraScelta(dati, staff, transaction) {
  if (staff && dati.camera_id) {
    return dati.camera_id;
  }

  const blocco = await disponibilita.bloccoDi(dati.sessione, transaction);
  if (blocco.data_arrivo !== dati.arrivo || blocco.data_partenza !== dati.partenza) {
    throw richiestaNonValida(
      'BLOCCO_DIVERSO',
      'Le date non corrispondono alla camera riservata: ripeti la ricerca',
    );
  }
  return blocco.camera_id;
}

/**
 * Nuova prenotazione.
 *  - online (cliente o visitatore): la camera è quella bloccata con `sessione`;
 *    resta in_attesa fino al pagamento dell'acconto (confermata subito se il
 *    piano non chiede acconto)
 *  - staff (telefono, email, walk-in): `camera_id` esplicita, può nascere confermata
 *
 * @param {object} dati  { sessione | camera_id, arrivo, partenza, adulti, bambini, eta_bambini,
 *   piano_id, codice_sconto, pacchetto_id, servizi, titolare, richieste_speciali,
 *   ora_arrivo_prevista, (staff) utente_id, canale, id_esterno, stato, note_interne }
 * @param {{ utenteId?: number, ruolo?: string, ip?: string }} contesto
 */
async function crea(dati, contesto) {
  const staff = eStaff(contesto);
  const clienteId = staff ? (dati.utente_id ?? null) : (contesto?.utenteId ?? null);
  const bambini = dati.bambini ?? 0;
  const [scadenzaOre, valuta] = await Promise.all([
    impostazioni.leggi('prenotazioni_scadenza_ore', 24),
    impostazioni.leggi('valuta', 'EUR'),
  ]);

  const id = await transazione(contesto, async (transaction) => {
    const cameraId = await cameraScelta(dati, staff, transaction);
    const camera = await cameraDaBloccare(cameraId, transaction);

    const preventivo = await tariffe.preventivo({
      tipologiaId: camera.tipologia_id,
      arrivo: dati.arrivo,
      partenza: dati.partenza,
      adulti: dati.adulti,
      bambini,
      etaBambini: dati.eta_bambini,
      pianoId: dati.piano_id,
      codiceSconto: dati.codice_sconto,
      pacchettoId: dati.pacchetto_id,
      servizi: dati.servizi,
      utenteId: clienteId,
    });

    // Online senza acconto si conferma subito; lo staff sceglie.
    const confermata = staff ? dati.stato === 'confermata' : preventivo.acconto_richiesto === 0;
    const stato = confermata ? 'confermata' : 'in_attesa';
    const piano = preventivo.piano;

    const prenotazione = await prenotazioniRepo.creaPrenotazione(
      {
        ospite_id: await titolare(clienteId, dati.titolare, transaction),
        utente_id: clienteId,
        camera_id: camera.id,
        piano_tariffario_id: piano?.id ?? null,
        codice_sconto_id: preventivo.codice_sconto?.id ?? null,
        pacchetto_id: preventivo.pacchetto?.id ?? null,
        data_arrivo: dati.arrivo,
        data_partenza: dati.partenza,
        adulti: dati.adulti,
        bambini,
        stato,
        canale: staff ? (dati.canale ?? 'telefono') : 'diretto',
        id_esterno: staff ? (dati.id_esterno ?? null) : null,
        valuta,
        ...importiDalPreventivo(preventivo),
        rimborsabile: piano?.rimborsabile ?? true,
        ore_cancellazione_gratuita: piano?.ore_cancellazione_gratuita ?? 48,
        penale_percentuale: piano?.penale_percentuale ?? 0,
        richieste_speciali: dati.richieste_speciali ?? null,
        note_interne: staff ? (dati.note_interne ?? null) : null,
        ora_arrivo_prevista: dati.ora_arrivo_prevista ?? null,
        // le prenotazioni online non pagate scadono (job scadiInAttesa)
        scade_il: !staff && stato === 'in_attesa' ? aggiungiOre(new Date(), scadenzaOre) : null,
        creato_da: contesto?.utenteId ?? null,
      },
      transaction,
    );

    if (preventivo.servizi.length > 0) {
      await prenotazioniRepo.creaRigheServizi(
        preventivo.servizi.map((servizio) => ({
          prenotazione_id: prenotazione.id,
          servizio_id: servizio.servizio_id,
          quantita: servizio.quantita,
          prezzo_unitario: servizio.prezzo_unitario,
          calcolo_prezzo: servizio.calcolo_prezzo,
          totale: servizio.totale,
        })),
        transaction,
      );
    }

    // Il titolare è anche il primo ospite del soggiorno.
    await ospitiRepo.creaRigaOspite(
      {
        prenotazione_id: prenotazione.id,
        ospite_id: prenotazione.ospite_id,
        tipo_alloggiato: dati.adulti + bambini === 1 ? 'ospite_singolo' : 'capofamiglia',
      },
      transaction,
    );

    if (dati.sessione) {
      await disponibilita.rilascia(dati.sessione, transaction);
    }
    return prenotazione.id;
  });

  const creata = await dettaglio(id);
  if (creata.stato === 'confermata') {
    await notificaConferma(id);
  } else {
    await notificaRicevuta(creata);
  }
  return creata;
}

// ─────────────────────────────────────
// Check-in online
// ─────────────────────────────────────

/**
 * Nuovo link di check-in online, valido fino al giorno di partenza.
 * Nel DB si salva solo l'hash del token.
 */
async function generaTokenCheckin(id) {
  const token = tokenCasuale(32);
  const prenotazione = await prenotazioniRepo.trovaPrenotazionePerId(id);
  if (!prenotazione) {
    throw nonTrovato('PRENOTAZIONE_NON_TROVATA', 'Prenotazione non trovata');
  }
  await transazione({ utenteId: null, ip: 'sistema' }, async (transaction) => {
    await prenotazioniRepo.aggiornaPrenotazione(
      id,
      {
        token_checkin: hash(token),
        token_checkin_scade_il: new Date(`${prenotazione.data_partenza}T23:59:59Z`),
      },
      transaction,
    );
  });
  return token;
}

async function prenotazioneDaToken(token) {
  const prenotazione = await prenotazioniRepo.trovaPerTokenCheckin(hash(token ?? ''));
  const valida =
    prenotazione &&
    prenotazione.token_checkin_scade_il >= new Date() &&
    ['confermata', 'in_soggiorno'].includes(prenotazione.stato);
  if (!valida) {
    throw richiestaNonValida(
      'LINK_CHECKIN_NON_VALIDO',
      'Il link per il check-in online non è valido o è scaduto',
    );
  }
  return prenotazione;
}

/**
 * Riepilogo per la pagina di check-in online. Chi ha il link vede degli ospiti
 * solo il nome e cosa manca, non i dati già registrati.
 */
async function datiCheckinOnline(token) {
  const prenotazione = await prenotazioneDaToken(token);
  return {
    codice: prenotazione.codice,
    data_arrivo: prenotazione.data_arrivo,
    data_partenza: prenotazione.data_partenza,
    adulti: prenotazione.adulti,
    bambini: prenotazione.bambini,
    checkin_online_il: prenotazione.checkin_online_il,
    ospiti: await ospitiService.mancantiDiPrenotazione(prenotazione.id),
  };
}

/** L'ospite inserisce da solo i dati di tutti gli alloggiati prima dell'arrivo. */
async function checkinOnline(token, ospiti, ip) {
  const prenotazione = await prenotazioneDaToken(token);
  const contesto = { utenteId: prenotazione.utente_id, ip };

  await ospitiService.impostaDaCheckin(prenotazione.id, ospiti, contesto);
  await transazione(contesto, async (transaction) => {
    await prenotazioniRepo.aggiornaPrenotazione(
      prenotazione.id,
      { checkin_online_il: new Date() },
      transaction,
    );
  });
  return await datiCheckinOnline(token);
}

// ─────────────────────────────────────
// Cambi di stato
// ─────────────────────────────────────

async function conferma(id, contesto) {
  await transazione(contesto, async (transaction) => {
    const prenotazione = await prenotazioneDaModificare(id, transaction);
    richiediStato(prenotazione, ['in_attesa'], 'confermare');
    await prenotazioniRepo.aggiornaPrenotazione(
      id,
      { stato: 'confermata', scade_il: null },
      transaction,
    );
  });
  await notificaConferma(id);
  return await dettaglio(id);
}

/**
 * Penale se si cancella adesso. La tassa di soggiorno non è mai dovuta.
 *  - in attesa (non pagata): nessuna penale
 *  - non rimborsabile: tutto il soggiorno
 *  - rimborsabile: gratis fino a N ore prima del check-in, poi la percentuale del piano
 * @returns {Promise<{ penale: number, gratuita_fino_al: Date|null }>}
 */
async function calcolaPenale(prenotazione, adesso = new Date()) {
  const base = centesimi(prenotazione.totale) - centesimi(prenotazione.tassa_soggiorno);

  if (prenotazione.stato === 'in_attesa') {
    return { penale: 0, gratuita_fino_al: null };
  }
  if (!prenotazione.rimborsabile) {
    return { penale: euro(base), gratuita_fino_al: null };
  }

  const { orario_checkin: orario, fuso_orario: fuso } = await impostazioni.leggiMolte([
    'orario_checkin',
    'fuso_orario',
  ]);
  const inizioSoggiorno = istanteLocale(
    prenotazione.data_arrivo,
    orario ?? '15:00',
    fuso ?? 'Europe/Rome',
  );
  const gratuitaFinoAl = aggiungiOre(inizioSoggiorno, -prenotazione.ore_cancellazione_gratuita);

  const penale = adesso < gratuitaFinoAl ? 0 : percentualeDi(base, prenotazione.penale_percentuale);
  return { penale: euro(penale), gratuita_fino_al: gratuitaFinoAl };
}

/** Cosa succede se si cancella adesso (per la conferma nel frontend). */
async function anteprimaCancellazione(id, contesto) {
  const prenotazione = await prenotazioniRepo.trovaPrenotazionePerId(id);
  if (!prenotazione) {
    throw nonTrovato('PRENOTAZIONE_NON_TROVATA', 'Prenotazione non trovata');
  }
  controllaProprietario(prenotazione, contesto);
  richiediStato(prenotazione, STATI_MODIFICABILI_CLIENTE, 'cancellare');

  const [penale, saldo] = await Promise.all([
    calcolaPenale(prenotazione),
    prenotazioniRepo.trovaSaldo(id),
  ]);
  return { ...penale, incassato: saldo.incassato };
}

/**
 * Cancellazione. Lo staff può indicare una penale diversa da quella del piano.
 * L'eventuale rimborso (incassato − penale) si registra poi dai pagamenti.
 */
async function cancella(id, { motivo, penale } = {}, contesto) {
  await transazione(contesto, async (transaction) => {
    const prenotazione = await prenotazioneDaModificare(id, transaction);
    controllaProprietario(prenotazione, contesto);
    richiediStato(prenotazione, STATI_MODIFICABILI_CLIENTE, 'cancellare');

    const penaleScelta = eStaff(contesto) && penale !== undefined && penale !== null;
    const penaleDovuta = penaleScelta ? penale : (await calcolaPenale(prenotazione)).penale;

    await prenotazioniRepo.aggiornaPrenotazione(
      id,
      {
        stato: 'cancellata',
        motivo_cancellazione: motivo ?? null,
        penale_applicata: penaleDovuta,
        token_checkin: null,
      },
      transaction,
    );
  });
  await notifica(id, 'prenotazione_cancellata');
  return await dettaglioPer(id, contesto);
}

async function checkIn(id, contesto) {
  await transazione(contesto, async (transaction) => {
    const prenotazione = await prenotazioneDaModificare(id, transaction);
    richiediStato(prenotazione, ['confermata'], "registrare l'arrivo di");
    if (prenotazione.data_arrivo > oggi()) {
      throw conflitto(
        'ARRIVO_FUTURO',
        `L'arrivo è previsto il ${dataItaliana(prenotazione.data_arrivo)}`,
      );
    }
    await prenotazioniRepo.aggiornaPrenotazione(id, { stato: 'in_soggiorno' }, transaction);
  });
  return await dettaglio(id);
}

/** Partenza. Con saldo aperto serve `forza` (es. pagamento concordato dopo). */
async function checkOut(id, { forza = false } = {}, contesto) {
  await transazione(contesto, async (transaction) => {
    const prenotazione = await prenotazioneDaModificare(id, transaction);
    richiediStato(prenotazione, ['in_soggiorno'], 'registrare la partenza di');

    const { saldo } = await prenotazioniRepo.trovaSaldo(id, transaction);
    if (saldo > 0 && !forza) {
      throw conflitto('SALDO_APERTO', `Restano da incassare ${formatoEuro(saldo)}`, { saldo });
    }
    await prenotazioniRepo.aggiornaPrenotazione(
      id,
      { stato: 'conclusa', token_checkin: null },
      transaction,
    );
  });
  return await dettaglio(id);
}

async function noShow(id, contesto) {
  await transazione(contesto, async (transaction) => {
    const prenotazione = await prenotazioneDaModificare(id, transaction);
    richiediStato(prenotazione, ['confermata'], 'segnare come mancato arrivo');
    if (prenotazione.data_arrivo > oggi()) {
      throw conflitto('ARRIVO_FUTURO', 'Il giorno di arrivo non è ancora arrivato');
    }
    await prenotazioniRepo.aggiornaPrenotazione(
      id,
      { stato: 'no_show', token_checkin: null },
      transaction,
    );
  });
  return await dettaglio(id);
}

// ─────────────────────────────────────
// Modifiche (staff)
// ─────────────────────────────────────

function datiModifica(dati) {
  const scelti = {};
  for (const campo of CAMPI_MODIFICABILI) {
    if (dati[campo] !== undefined) {
      scelti[campo] = dati[campo];
    }
  }
  return scelti;
}

/** I servizi a notte o a persona costano diversamente se cambiano notti o ospiti. */
async function ricalcolaServizi(id, ospiti, transaction) {
  const aggiornata = await prenotazioniRepo.trovaPrenotazionePerId(id, transaction);
  const righe = await prenotazioniRepo.trovaRigheServizi(id, transaction);

  for (const riga of righe) {
    const totale = totaleServizio(
      {
        prezzo: riga.prezzo_unitario,
        quantita: riga.quantita,
        calcolo_prezzo: riga.calcolo_prezzo,
      },
      aggiornata.notti,
      ospiti,
    );
    await prenotazioniRepo.aggiornaTotaleRigaServizio(
      id,
      riga.servizio_id,
      euro(totale),
      transaction,
    );
  }
}

/**
 * Cambio camera, date o ospiti. Se cambiano tipologia, date o ospiti il prezzo
 * si ricalcola con piano, codice, pacchetto e fedeltà già applicati.
 */
async function modifica(id, dati, contesto) {
  await transazione(contesto, async (transaction) => {
    const prenotazione = await prenotazioneDaModificare(id, transaction);
    richiediStato(prenotazione, STATI_ATTIVI, 'modificare');

    const nuovi = datiModifica(dati);
    const cambiaArrivo = nuovi.data_arrivo && nuovi.data_arrivo !== prenotazione.data_arrivo;
    if (prenotazione.stato === 'in_soggiorno' && cambiaArrivo) {
      throw conflitto(
        'SOGGIORNO_INIZIATO',
        "L'ospite è già arrivato: puoi cambiare solo la partenza",
      );
    }

    const cameraAttuale = await cameraDaBloccare(prenotazione.camera_id, transaction);
    const camera = nuovi.camera_id
      ? await cameraDaBloccare(nuovi.camera_id, transaction)
      : cameraAttuale;

    const dopo = { ...prenotazione.get({ plain: true }), ...nuovi };
    const vaRiprezzata =
      camera.tipologia_id !== cameraAttuale.tipologia_id ||
      dopo.data_arrivo !== prenotazione.data_arrivo ||
      dopo.data_partenza !== prenotazione.data_partenza ||
      dopo.adulti !== prenotazione.adulti ||
      dopo.bambini !== prenotazione.bambini;

    if (vaRiprezzata) {
      const preventivo = await tariffe.preventivo({
        tipologiaId: camera.tipologia_id,
        arrivo: dopo.data_arrivo,
        partenza: dopo.data_partenza,
        adulti: dopo.adulti,
        bambini: dopo.bambini,
        pianoId: prenotazione.piano_tariffario_id,
        pacchettoId: prenotazione.pacchetto_id,
        esistente: {
          codiceScontoId: prenotazione.codice_sconto_id,
          percentualeFedelta: prenotazione.percentuale_fedelta,
        },
      });
      Object.assign(nuovi, importiDalPreventivo(preventivo));
    }

    await prenotazioniRepo.aggiornaPrenotazione(id, nuovi, transaction);

    if (vaRiprezzata) {
      await ricalcolaServizi(id, dopo.adulti + dopo.bambini, transaction);
    }
  });
  return await dettaglio(id);
}

// ─────────────────────────────────────
// Servizi extra
// ─────────────────────────────────────

// Il cliente cambia gli extra solo delle proprie prenotazioni, prima dell'arrivo.
function statiPerServizi(contesto) {
  return eStaff(contesto) ? STATI_ATTIVI : STATI_MODIFICABILI_CLIENTE;
}

/** Aggiunge un extra, o ne cambia la quantità se c'è già. */
async function aggiungiServizio(id, { servizio_id: servizioId, quantita = 1 }, contesto) {
  await transazione(contesto, async (transaction) => {
    const prenotazione = await prenotazioneDaModificare(id, transaction);
    controllaProprietario(prenotazione, contesto);
    richiediStato(prenotazione, statiPerServizi(contesto), 'aggiungere servizi a');

    const [servizio] = await camereRepo.trovaExtraPerIds([servizioId], transaction);
    if (!servizio) {
      throw nonTrovato('SERVIZIO_NON_TROVATO', 'Servizio non disponibile');
    }

    const totale = totaleServizio(
      { prezzo: servizio.prezzo, quantita, calcolo_prezzo: servizio.calcolo_prezzo },
      prenotazione.notti,
      prenotazione.adulti + prenotazione.bambini,
    );
    await prenotazioniRepo.salvaRigaServizio(
      {
        prenotazione_id: id,
        servizio_id: servizio.id,
        quantita,
        prezzo_unitario: servizio.prezzo,
        calcolo_prezzo: servizio.calcolo_prezzo,
        totale: euro(totale),
      },
      transaction,
    );
  });
  return await dettaglioPer(id, contesto);
}

async function rimuoviServizio(id, servizioId, contesto) {
  await transazione(contesto, async (transaction) => {
    const prenotazione = await prenotazioneDaModificare(id, transaction);
    controllaProprietario(prenotazione, contesto);
    richiediStato(prenotazione, statiPerServizi(contesto), 'togliere servizi da');
    await prenotazioniRepo.eliminaRigaServizio(id, servizioId, transaction);
  });
  return await dettaglioPer(id, contesto);
}

// ─────────────────────────────────────
// Job
// ─────────────────────────────────────

/** Cancella le prenotazioni online non pagate entro la scadenza. */
async function scadiInAttesa() {
  const scadute = await transazione({ utenteId: null, ip: 'job' }, async (transaction) => {
    return await prenotazioniRepo.cancellaScadute(transaction);
  });
  if (scadute > 0) {
    logger.info('Prenotazioni scadute cancellate', { numero: scadute });
  }
  return scadute;
}

/**
 * Promemoria agli ospiti che arrivano domani, con il link al check-in online
 * se non l'hanno ancora fatto.
 */
async function inviaPromemoriaCheckin() {
  const domani = aggiungiGiorni(oggi(), 1);
  const inArrivo = await prenotazioniRepo.trovaConfermateInArrivo(domani);

  for (const prenotazione of inArrivo) {
    const link = prenotazione.checkin_online_il ? null : await linkCheckin(prenotazione.id);
    await notifica(prenotazione.id, 'promemoria_checkin', { link });
  }
  return inArrivo.length;
}

const CONTESTO_JOB = { utenteId: null, ip: 'job' };

/**
 * Chiude quello che lo staff non ha registrato nei giorni passati: arrivi mai
 * avvenuti → no-show (la camera torna libera); partenze → concluse (pulizia e
 * punti dal trigger). Con saldo aperto la partenza resta alla reception.
 * ponytail: niente tolleranza per chi arriva dopo mezzanotte, il job gira a metà giornata.
 */
async function chiudiDimenticate() {
  const giorno = oggi();
  const mancati = await prenotazioniRepo.trovaFermePrimaDi('confermata', 'data_arrivo', giorno);
  for (const prenotazione of mancati) {
    await noShow(prenotazione.id, CONTESTO_JOB);
  }

  const partite = await prenotazioniRepo.trovaFermePrimaDi('in_soggiorno', 'data_partenza', giorno);
  const conSaldo = [];
  for (const prenotazione of partite) {
    try {
      await checkOut(prenotazione.id, {}, CONTESTO_JOB);
    } catch (errore) {
      if (errore.codice !== 'SALDO_APERTO') throw errore;
      conSaldo.push(prenotazione.codice);
    }
  }
  if (conSaldo.length > 0) {
    await notifiche.aChiPuo(PERMESSI.PRENOTAZIONI_GESTISCI, {
      tipo: 'sistema',
      priorita: 'avviso',
      codice: 'partenze_saldo_aperto',
      parametri: { totale: conSaldo.length },
      titolo: `Partenze da chiudere: ${conSaldo.length} con saldo aperto`,
      testo: conSaldo.join(', '),
      link: '/staff/prenotazioni',
    });
  }
  return {
    no_show: mancati.length,
    concluse: partite.length - conSaldo.length,
    saldo_aperto: conSaldo.length,
  };
}

/** Il giorno dopo la partenza, invito a lasciare una recensione a chi non l'ha scritta. */
async function invitaARecensire() {
  const partiti = await prenotazioniRepo.trovaDaRecensire(aggiungiGiorni(oggi(), -1));
  for (const prenotazione of partiti) {
    await notifica(prenotazione.id, 'invito_recensione', {
      link: `${config.urlFrontend}/prenotazioni/${prenotazione.codice}`,
    });
  }
  return partiti.length;
}

module.exports = {
  dettaglio,
  mie,
  mia,
  perCodice,
  elenco,
  giornata,
  crea,
  linkCheckin,
  datiCheckinOnline,
  checkinOnline,
  conferma,
  calcolaPenale,
  anteprimaCancellazione,
  cancella,
  checkIn,
  checkOut,
  noShow,
  modifica,
  aggiungiServizio,
  rimuoviServizio,
  notifica,
  scadiInAttesa,
  inviaPromemoriaCheckin,
  chiudiDimenticate,
  invitaARecensire,
};
