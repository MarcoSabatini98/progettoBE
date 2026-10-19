// src/services/pulizie.service.js
//
// Attività di pulizia con checklist.
// Il DB fa da solo: attività di partenza al check-out, date di avanzamento e
// stato di pulizia della camera (trigger su attivita_pulizia).
//
// Chi fa cosa:
//  - pulizie.esegui: avanza le PROPRIE attività (o prende quelle libere)
//  - pulizie.gestisci: crea, assegna, verifica, riapre qualsiasi attività
//
// Pulizie a turno (impostazione pulizie_autoassegna): al mattino una camera a
// ogni addetto, a chi finisce la successiva sullo stesso piano o il più vicino.

const pulizieRepo = require('../repositories/pulizie.repository');
const prenotazioniRepo = require('../repositories/prenotazioni.repository');
const utentiRepo = require('../repositories/utenti.repository');
const permessi = require('./permessi.service');
const notifiche = require('./notifiche.service');
const impostazioni = require('./impostazioni.service');
const { PERMESSI, SQUADRE } = require('../constants/ruoli.constants');
const { TRANSIZIONI_PULIZIA, PRIORITA } = require('../constants/pulizie.constants');
const {
  nonTrovato,
  vietato,
  richiestaNonValida,
  nonElaborabile,
  conflitto,
} = require('../utils/errori');
const { oggi, aggiungiGiorni } = require('../utils/date');

async function attivitaOppure404(id) {
  const attivita = await pulizieRepo.trovaAttivitaPerId(id);
  if (!attivita) {
    throw nonTrovato('PULIZIA_NON_TROVATA', 'Attività di pulizia non trovata');
  }
  return attivita;
}

async function voceOppure404(id) {
  const voce = await pulizieRepo.trovaVocePerId(id);
  if (!voce) {
    throw nonTrovato('VOCE_CHECKLIST_NON_TROVATA', 'Voce della checklist non trovata');
  }
  return voce;
}

async function puoGestire(contesto) {
  return await permessi.ha(contesto.ruolo, PERMESSI.PULIZIE_GESTISCI);
}

/** Solo chi gestisce tocca le attività assegnate ad altri. Restituisce se gestisce. */
async function controllaAltrui(attivita, contesto) {
  const gestore = await puoGestire(contesto);
  const altrui = attivita.assegnata_a && attivita.assegnata_a !== contesto.utenteId;
  if (altrui && !gestore) {
    throw vietato('PULIZIA_ALTRUI', "L'attività è assegnata a un altro addetto");
  }
  return gestore;
}

async function avvisaAddetto(attivita) {
  if (!attivita.assegnata_a) {
    return;
  }
  const numeroCamera = attivita.camera?.numero ?? attivita.camera_id;
  await notifiche.invia([attivita.assegnata_a], {
    tipo: 'pulizia',
    priorita: attivita.priorita === 'urgente' ? 'avviso' : 'info',
    codice: 'pulizia_assegnata',
    parametri: { camera: numeroCamera, data: attivita.data_prevista },
    titolo: `Pulizia assegnata: camera ${numeroCamera} per il ${attivita.data_prevista}`,
    link: `/staff/pulizie/${attivita.id}`,
  });
}

// ─────────────────────────────────────
// Checklist
// ─────────────────────────────────────

/** Checklist nuova (tutto da fare) per un tipo di pulizia. */
async function checklistPer(tipo) {
  const voci = await pulizieRepo.trovaVociAttive(tipo);
  return voci.map((voce) => ({ voce: voce.voce, fatto: false }));
}

async function vociChecklist() {
  return await pulizieRepo.trovaVociChecklist();
}

function valePer(voce, attivita) {
  return voce.tipo_pulizia === null || voce.tipo_pulizia === attivita.tipo;
}

/** Nuova voce: si aggiunge anche alle attività non ancora completate. */
async function aggiungiVoce(dati) {
  const voce = await pulizieRepo.creaVoce({
    voce: dati.voce,
    tipo_pulizia: dati.tipo_pulizia ?? null,
    ordine: dati.ordine ?? (await pulizieRepo.ultimoOrdineChecklist()) + 1,
  });

  for (const attivita of await pulizieRepo.trovaAttivitaAperte()) {
    const checklist = attivita.checklist ?? [];
    const presente = checklist.some((riga) => riga.voce === voce.voce);
    if (valePer(voce, attivita) && !presente) {
      await pulizieRepo.aggiornaAttivita(attivita.id, {
        checklist: [...checklist, { voce: voce.voce, fatto: false }],
      });
    }
  }
  return voce;
}

/** Rinomina, riordina o disattiva una voce (vale per le attività future). */
async function aggiornaVoce(id, dati) {
  await voceOppure404(id);
  await pulizieRepo.aggiornaVoce(id, {
    voce: dati.voce,
    tipo_pulizia: dati.tipo_pulizia,
    ordine: dati.ordine,
    attiva: dati.attiva,
  });
  return await voceOppure404(id);
}

/** Voce eliminata: sparisce anche dalle attività non ancora completate. */
async function eliminaVoce(id) {
  const voce = await voceOppure404(id);
  await pulizieRepo.eliminaVoce(id);

  for (const attivita of await pulizieRepo.trovaAttivitaAperte()) {
    const checklist = attivita.checklist ?? [];
    const senzaVoce = checklist.filter((riga) => riga.voce !== voce.voce);
    if (senzaVoce.length !== checklist.length) {
      await pulizieRepo.aggiornaAttivita(attivita.id, { checklist: senzaVoce });
    }
  }
}

// ─────────────────────────────────────
// Attività
// ─────────────────────────────────────

/** Attività del giorno (default oggi). `mie` → solo quelle assegnate a me. */
async function elenco(query, contesto) {
  const filtri = {
    stato: query.stato,
    camera_id: query.camera_id,
    assegnata_a: query.mie === true ? contesto.utenteId : query.assegnata_a,
  };
  return await pulizieRepo.trovaAttivitaDelGiorno(query.data ?? oggi(), filtri);
}

async function dettaglio(id) {
  return await attivitaOppure404(id);
}

async function crea(dati, contesto) {
  const tipo = dati.tipo ?? 'riassetto';
  const nuova = await pulizieRepo.creaAttivita({
    camera_id: dati.camera_id,
    prenotazione_id: dati.prenotazione_id ?? null,
    assegnata_a: dati.assegnata_a ?? null,
    data_prevista: dati.data_prevista ?? oggi(),
    tipo,
    priorita: dati.priorita ?? 'normale',
    note: dati.note ?? null,
    checklist: await checklistPer(tipo),
    creato_da: contesto.utenteId,
  });

  const attivita = await attivitaOppure404(nuova.id);
  await avvisaAddetto(attivita);
  return attivita;
}

/** Pianificazione: addetto, data, priorità, tipo, note. */
async function aggiorna(id, dati) {
  const attivita = await attivitaOppure404(id);
  if (attivita.stato === 'verificata') {
    throw richiestaNonValida('PULIZIA_CHIUSA', "L'attività è già stata verificata");
  }

  await pulizieRepo.aggiornaAttivita(id, {
    assegnata_a: dati.assegnata_a,
    data_prevista: dati.data_prevista,
    priorita: dati.priorita,
    tipo: dati.tipo,
    note: dati.note,
  });

  const aggiornata = await attivitaOppure404(id);
  const riassegnata = dati.assegnata_a !== undefined && dati.assegnata_a !== attivita.assegnata_a;
  if (riassegnata) {
    await avvisaAddetto(aggiornata);
  }
  return aggiornata;
}

async function elimina(id) {
  const attivita = await attivitaOppure404(id);
  if (attivita.stato !== 'da_fare') {
    throw richiestaNonValida(
      'PULIZIA_INIZIATA',
      'Si possono eliminare solo attività non ancora iniziate',
    );
  }
  await pulizieRepo.eliminaAttivita(id);
}

// ─────────────────────────────────────
// Avanzamento
// ─────────────────────────────────────

/** Il client manda l'intera checklist: si tengono solo le spunte. */
function spunta(attuale, inviata) {
  return (attuale ?? []).map((riga, indice) => ({
    ...riga,
    fatto: Boolean(inviata[indice]?.fatto ?? riga.fatto),
  }));
}

function vociMancanti(checklist) {
  return (checklist ?? []).filter((riga) => !riga.fatto).map((riga) => riga.voce);
}

function controllaTransizione(da, a, gestore) {
  const soloGestore = TRANSIZIONI_PULIZIA[da][a];
  if (soloGestore === undefined) {
    throw richiestaNonValida('TRANSIZIONE_NON_VALIDA', `Un'attività ${da} non può passare a ${a}`);
  }
  if (soloGestore && !gestore) {
    throw vietato('PERMESSO_NEGATO', 'Solo il responsabile delle pulizie può farlo');
  }
}

/**
 * Avanza l'attività e/o aggiorna la checklist.
 * dati: { stato?, checklist?: [{ fatto }], note? }
 */
async function avanza(id, dati, contesto) {
  const attivita = await attivitaOppure404(id);
  const gestore = await controllaAltrui(attivita, contesto);

  const modifiche = { note: dati.note };
  let checklist = attivita.checklist;
  if (dati.checklist) {
    checklist = spunta(attivita.checklist, dati.checklist);
    modifiche.checklist = checklist;
  }

  const cambiaStato = dati.stato && dati.stato !== attivita.stato;
  if (cambiaStato) {
    controllaTransizione(attivita.stato, dati.stato, gestore);
    modifiche.stato = dati.stato;

    if (dati.stato === 'completata') {
      const mancanti = vociMancanti(checklist);
      if (mancanti.length > 0) {
        throw nonElaborabile('CHECKLIST_INCOMPLETA', 'Completa tutte le voci della checklist', {
          voci: mancanti,
        });
      }
    }
    // Chi prende un'attività libera se la assegna.
    if (dati.stato === 'in_corso' && !attivita.assegnata_a) {
      modifiche.assegnata_a = contesto.utenteId;
    }
    // Rimessa da fare: il tempo riparte quando la si riprende.
    if (dati.stato === 'da_fare') {
      modifiche.iniziata_il = null;
    }
    // Ispezione respinta: si rifà da capo.
    if (attivita.stato === 'completata' && dati.stato === 'in_corso') {
      modifiche.checklist = checklist.map((riga) => ({ ...riga, fatto: false }));
      modifiche.completata_il = null;
    }
    if (dati.stato === 'verificata') {
      modifiche.verificata_da = contesto.utenteId;
    }
  }

  await pulizieRepo.aggiornaAttivita(id, modifiche);
  const aggiornata = await attivitaOppure404(id);

  const daIspezionare = await impostazioni.leggi('pulizie_richiedi_ispezione', true);
  if (modifiche.stato === 'completata' && daIspezionare) {
    await notifiche.aChiPuo(
      PERMESSI.PULIZIE_GESTISCI,
      {
        tipo: 'pulizia',
        codice: 'camera_da_ispezionare',
        parametri: { camera: aggiornata.camera.numero },
        titolo: `Camera ${aggiornata.camera.numero} da ispezionare`,
        link: `/staff/pulizie/${id}`,
      },
      contesto.utenteId,
    );
  }
  if (modifiche.stato === 'completata' && aggiornata.assegnata_a && (await aTurno())) {
    await assegnaProssima(
      aggiornata.assegnata_a,
      aggiornata.data_prevista,
      aggiornata.camera.piano,
    );
  }
  return aggiornata;
}

/**
 * "Non disturbare": la camera torna libera, in fondo alla coda di oggi o a
 * domani. A turno, l'addetto passa subito a un'altra camera.
 * dati: { quando: 'oggi' | 'domani' }
 */
async function rinvia(id, { quando }, contesto) {
  const attivita = await attivitaOppure404(id);
  await controllaAltrui(attivita, contesto);
  if (!['da_fare', 'in_corso'].includes(attivita.stato)) {
    throw richiestaNonValida(
      'PULIZIA_NON_RINVIABILE',
      'Si rinviano solo pulizie non ancora finite',
    );
  }

  const domani = quando === 'domani';
  await pulizieRepo.aggiornaAttivita(id, {
    stato: 'da_fare',
    assegnata_a: null,
    iniziata_il: null,
    rinviata_il: domani ? null : new Date(),
    data_prevista: domani ? aggiungiGiorni(attivita.data_prevista, 1) : undefined,
  });

  if (attivita.assegnata_a && (await aTurno())) {
    await assegnaProssima(
      attivita.assegnata_a,
      attivita.data_prevista,
      attivita.camera?.piano ?? null,
      id,
    );
  }
  return await attivitaOppure404(id);
}

// ─────────────────────────────────────
// Pianificazione automatica (job giornaliero)
// ─────────────────────────────────────

/**
 * Riassetto delle camere occupate (arrivate prima di oggi e che non partono
 * oggi: la pulizia di partenza la crea già il DB) e checklist alle attività
 * create dal DB che non l'hanno.
 */
async function generaGiornata(giorno = oggi()) {
  const inCasa = await prenotazioniRepo.trovaInCasa();
  const occupate = inCasa.filter(
    (prenotazione) => prenotazione.data_arrivo < giorno && prenotazione.data_partenza > giorno,
  );

  const checklist = await checklistPer('riassetto');
  await pulizieRepo.creaAttivitaInBlocco(
    occupate.map((prenotazione) => ({
      camera_id: prenotazione.camera_id,
      prenotazione_id: prenotazione.id,
      data_prevista: giorno,
      tipo: 'riassetto',
      checklist,
    })),
  );

  const senzaChecklist = await pulizieRepo.trovaSenzaChecklist(giorno);
  for (const attivita of senzaChecklist) {
    await pulizieRepo.aggiornaAttivita(attivita.id, {
      checklist: await checklistPer(attivita.tipo),
    });
  }
  return { riassetti: occupate.length, checklist_aggiunte: senzaChecklist.length };
}

/** Addetti attivi tra cui scegliere nell'assegnazione. */
async function addetti() {
  return await utentiRepo.trovaStaffAttivo(SQUADRE.housekeeping);
}

// ─────────────────────────────────────
// Pulizie a turno
// ─────────────────────────────────────

async function aTurno() {
  return await impostazioni.leggi('pulizie_autoassegna', false);
}

/**
 * Ordine in cui prendere le camere libere: le rinviate ("non disturbare") in
 * fondo, poi le più urgenti, poi la più vicina al piano di partenza. Senza
 * partenza (inizio turno) il piano con meno addetti, così ci si sparpaglia.
 * A parità il piano più basso e il numero di camera.
 * ponytail: vicino-più-vicino, a parità di distanza scende prima; uno "sweep"
 * per direzione se serve.
 */
function ordinaCoda(coda, partenza, affollamento = new Map()) {
  const chiave = (attivita) => {
    const piano = attivita.camera?.piano ?? 0;
    const distanza =
      partenza === null ? (affollamento.get(piano) ?? 0) : Math.abs(piano - partenza);
    return [attivita.rinviata_il ? 1 : 0, -PRIORITA.indexOf(attivita.priorita), distanza, piano];
  };
  return [...coda].sort((a, b) => {
    const [ka, kb] = [chiave(a), chiave(b)];
    const diversa = ka.findIndex((valore, indice) => valore !== kb[indice]);
    if (diversa >= 0) {
      return ka[diversa] - kb[diversa];
    }
    return String(a.camera?.numero).localeCompare(String(b.camera?.numero), undefined, {
      numeric: true,
    });
  });
}

/** Attività aperte per piano: dove c'è già gente. */
function contaPerPiano(aperte) {
  const affollamento = new Map();
  for (const attivita of aperte) {
    const piano = attivita.camera?.piano ?? 0;
    affollamento.set(piano, (affollamento.get(piano) ?? 0) + 1);
  }
  return affollamento;
}

/**
 * Dà all'addetto la prossima camera libera del giorno, se non ne ha già una
 * aperta. `esclusa`: la camera appena rinviata, da non ridargli.
 * Restituisce l'attività presa o null.
 */
async function assegnaProssima(utenteId, giorno, partenza = null, esclusa = null) {
  const aperte = await pulizieRepo.trovaAperteAssegnate(giorno);
  if (aperte.some((attivita) => attivita.assegnata_a === utenteId)) {
    return null;
  }

  const coda = (await pulizieRepo.trovaCoda(giorno)).filter((attivita) => attivita.id !== esclusa);
  for (const candidata of ordinaCoda(coda, partenza, contaPerPiano(aperte))) {
    // Un altro addetto può averla presa nel frattempo: si passa alla successiva.
    const [prese] = await pulizieRepo.prendiSeLibera(candidata.id, utenteId);
    if (prese > 0) {
      const presa = await attivitaOppure404(candidata.id);
      await avvisaAddetto(presa);
      return presa;
    }
  }
  return null;
}

/** Piano dell'ultima camera finita nel giorno dall'addetto: da lì riprende. */
async function pianoDiPartenza(utenteId, giorno) {
  const ultima = await pulizieRepo.trovaUltimaFinita(utenteId, giorno);
  return ultima?.camera?.piano ?? null;
}

/** Una camera a ogni addetto libero (job del mattino o pulsante "Assegna"). */
async function distribuisci(giorno) {
  let assegnate = 0;
  for (const addetto of await addetti()) {
    const partenza = await pianoDiPartenza(addetto.id, giorno);
    if (await assegnaProssima(addetto.id, giorno, partenza)) {
      assegnate += 1;
    }
  }
  const coda = await pulizieRepo.trovaCoda(giorno);
  return { assegnate, non_assegnate: coda.length };
}

/**
 * "Prossima camera": l'addetto (o il titolare da solo) se ne prende una.
 * Funziona anche senza pulizie a turno.
 */
async function prossima(contesto) {
  const giorno = oggi();
  const partenza = await pianoDiPartenza(contesto.utenteId, giorno);
  const presa = await assegnaProssima(contesto.utenteId, giorno, partenza);
  if (presa) {
    return presa;
  }
  const aperte = await pulizieRepo.trovaAperteAssegnate(giorno);
  if (aperte.some((attivita) => attivita.assegnata_a === contesto.utenteId)) {
    throw conflitto('PULIZIA_IN_CORSO', 'Finisci prima la camera che hai già');
  }
  throw nonTrovato('NESSUNA_PULIZIA_LIBERA', 'Non ci sono camere libere da pulire');
}

/**
 * Assegna le attività libere del giorno agli addetti attivi, ognuna a chi
 * ne ha meno (le urgenti per prime).
 */
async function bilancia(giorno) {
  const libere = await pulizieRepo.trovaNonAssegnate(giorno);
  const squadra = await addetti();
  if (libere.length === 0 || squadra.length === 0) {
    return { assegnate: 0, non_assegnate: libere.length };
  }

  const carico = new Map(squadra.map((addetto) => [addetto.id, 0]));
  for (const riga of await pulizieRepo.contaAttivitaPerAddetto(giorno)) {
    if (carico.has(riga.assegnata_a)) {
      carico.set(riga.assegnata_a, riga.count);
    }
  }

  for (const attivita of libere) {
    const [menoCarico] = [...carico.entries()].sort((a, b) => a[1] - b[1])[0];
    carico.set(menoCarico, carico.get(menoCarico) + 1);
    await pulizieRepo.aggiornaAttivita(attivita.id, { assegnata_a: menoCarico });
    await avvisaAddetto({ ...attivita.toJSON(), assegnata_a: menoCarico });
  }
  return { assegnate: libere.length, non_assegnate: 0 };
}

/** A turno una camera per addetto, altrimenti tutte le libere bilanciate. */
async function autoassegna(giorno = oggi()) {
  return (await aTurno()) ? await distribuisci(giorno) : await bilancia(giorno);
}

/** Job del mattino: attività del giorno e, se a turno, una camera a ogni addetto. */
/**
 * Le pulizie non finite dei giorni prima tornano in coda oggi, da rifare da capo.
 * Se oggi la camera ha già un'attività dello stesso tipo, quella vecchia è un doppione.
 */
async function riportaArretrate(giorno) {
  const arretrate = await pulizieRepo.trovaArretrate(giorno);
  for (const attivita of arretrate) {
    try {
      await pulizieRepo.aggiornaAttivita(attivita.id, {
        data_prevista: giorno,
        stato: 'da_fare',
        assegnata_a: null,
        iniziata_il: null,
        rinviata_il: null,
      });
    } catch (errore) {
      if (errore.name !== 'SequelizeUniqueConstraintError') throw errore;
      await pulizieRepo.eliminaAttivita(attivita.id);
    }
  }
  return arretrate.length;
}

async function preparaGiornata() {
  const riportate = await riportaArretrate(oggi());
  const giornata = { riportate, ...(await generaGiornata()) };
  if (!(await aTurno())) {
    return giornata;
  }
  return { ...giornata, ...(await distribuisci(oggi())) };
}

module.exports = {
  checklistPer,
  vociChecklist,
  aggiungiVoce,
  aggiornaVoce,
  eliminaVoce,
  elenco,
  dettaglio,
  crea,
  aggiorna,
  elimina,
  avanza,
  rinvia,
  prossima,
  ordinaCoda,
  generaGiornata,
  riportaArretrate,
  addetti,
  autoassegna,
  preparaGiornata,
};
