// src/services/pulizie.service.js
//
// Attività di pulizia con checklist.
// Il DB fa da solo: attività di partenza al check-out, date di avanzamento e
// stato di pulizia della camera (trigger su attivita_pulizia).
//
// Chi fa cosa:
//  - pulizie.esegui: avanza le PROPRIE attività (o prende quelle libere)
//  - pulizie.gestisci: crea, assegna, verifica, riapre qualsiasi attività

const pulizieRepo = require('../repositories/pulizie.repository');
const prenotazioniRepo = require('../repositories/prenotazioni.repository');
const utentiRepo = require('../repositories/utenti.repository');
const permessi = require('./permessi.service');
const notifiche = require('./notifiche.service');
const impostazioni = require('./impostazioni.service');
const { PERMESSI, SQUADRE } = require('../constants/ruoli.constants');
const { TRANSIZIONI_PULIZIA } = require('../constants/pulizie.constants');
const { nonTrovato, vietato, richiestaNonValida, nonElaborabile } = require('../utils/errori');
const { oggi } = require('../utils/date');

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

async function avvisaAddetto(attivita) {
  if (!attivita.assegnata_a) {
    return;
  }
  await notifiche.invia([attivita.assegnata_a], {
    tipo: 'pulizia',
    priorita: attivita.priorita === 'urgente' ? 'avviso' : 'info',
    titolo: `Pulizia assegnata: camera ${attivita.camera?.numero ?? attivita.camera_id}`,
    testo: `${attivita.tipo} del ${attivita.data_prevista}`,
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

/** Attività del giorno (default oggi). `mie=true` → solo quelle assegnate a me. */
async function elenco(query, contesto) {
  const filtri = {
    stato: query.stato,
    camera_id: query.camera_id,
    assegnata_a: query.mie === 'true' ? contesto.utenteId : query.assegnata_a,
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
  const gestore = await puoGestire(contesto);
  const altrui = attivita.assegnata_a && attivita.assegnata_a !== contesto.utenteId;
  if (altrui && !gestore) {
    throw vietato('PULIZIA_ALTRUI', "L'attività è assegnata a un altro addetto");
  }

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
    // Ispezione respinta: si rifà da capo.
    if (attivita.stato === 'completata' && dati.stato === 'in_corso') {
      modifiche.checklist = checklist.map((riga) => ({ ...riga, fatto: false }));
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
        titolo: `Camera ${aggiornata.camera.numero} da ispezionare`,
        link: `/staff/pulizie/${id}`,
      },
      contesto.utenteId,
    );
  }
  return aggiornata;
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

/**
 * Assegna le attività libere del giorno agli addetti attivi, ognuna a chi
 * ne ha meno (le urgenti per prime).
 */
async function autoassegna(giorno = oggi()) {
  const libere = await pulizieRepo.trovaNonAssegnate(giorno);
  const addetti = await utentiRepo.trovaStaffAttivo(SQUADRE.housekeeping);
  if (libere.length === 0 || addetti.length === 0) {
    return { assegnate: 0, non_assegnate: libere.length };
  }

  const carico = new Map(addetti.map((addetto) => [addetto.id, 0]));
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
  generaGiornata,
  autoassegna,
};
