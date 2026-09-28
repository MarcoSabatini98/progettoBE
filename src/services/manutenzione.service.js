// src/services/manutenzione.service.js
//
// Segnalazioni di guasti. Una segnalazione può mettere la camera in
// manutenzione o fuori servizio, e rimetterla attiva quando è risolta.
//
// Chi fa cosa:
//  - manutenzione.segnala: apre segnalazioni e vede le proprie
//  - manutenzione.gestisci: vede tutto, prende in carico, chiude, cambia lo stato camera

const { sequelize } = require('../models');
const manutenzioneRepo = require('../repositories/manutenzione.repository');
const camereRepo = require('../repositories/camere.repository');
const permessi = require('./permessi.service');
const notifiche = require('./notifiche.service');
const { PERMESSI } = require('../constants/ruoli.constants');
const { STATI_SEGNALAZIONE_APERTA } = require('../constants/pulizie.constants');
const { nonTrovato, vietato, richiestaNonValida } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');

async function segnalazioneOppure404(id) {
  const segnalazione = await manutenzioneRepo.trovaSegnalazionePerId(id);
  if (!segnalazione) {
    throw nonTrovato('SEGNALAZIONE_NON_TROVATA', 'Segnalazione non trovata');
  }
  return segnalazione;
}

async function puoGestire(contesto) {
  return await permessi.ha(contesto.ruolo, PERMESSI.MANUTENZIONE_GESTISCI);
}

async function cambiaStatoCamera(cameraId, stato, transaction) {
  if (cameraId && stato) {
    await camereRepo.aggiornaCamera(cameraId, { stato }, transaction);
  }
}

function link(id) {
  return `/staff/manutenzione/${id}`;
}

// ─────────────────────────────────────
// Lettura
// ─────────────────────────────────────

/** Chi non gestisce la manutenzione vede solo le segnalazioni fatte o assegnate a sé. */
async function elenco(query, contesto) {
  const p = pagina(query);
  const soloMie = query.mie === 'true' || !(await puoGestire(contesto));
  const filtri = {
    stato: query.stato,
    aperte: query.aperte === 'true',
    priorita: query.priorita,
    camera_id: query.camera_id,
    utenteId: soloMie ? contesto.utenteId : null,
  };
  const trovate = await manutenzioneRepo.trovaSegnalazioni(filtri, p);
  return risultato(trovate, p);
}

async function dettaglio(id, contesto) {
  const segnalazione = await segnalazioneOppure404(id);
  const coinvolto = [segnalazione.segnalata_da, segnalazione.assegnata_a].includes(
    contesto.utenteId,
  );
  if (!coinvolto && !(await puoGestire(contesto))) {
    throw vietato('PERMESSO_NEGATO', 'Non puoi vedere questa segnalazione');
  }
  return segnalazione;
}

// ─────────────────────────────────────
// Scrittura
// ─────────────────────────────────────

/** dati: { camera_id?, titolo, descrizione?, priorita?, stato_camera? } */
async function segnala(dati, contesto) {
  if (dati.stato_camera && !(await puoGestire(contesto))) {
    throw vietato('PERMESSO_NEGATO', 'Solo la manutenzione può cambiare lo stato di una camera');
  }

  const id = await sequelize.transaction(async (transaction) => {
    const nuova = await manutenzioneRepo.creaSegnalazione(
      {
        camera_id: dati.camera_id ?? null,
        titolo: dati.titolo,
        descrizione: dati.descrizione ?? null,
        priorita: dati.priorita ?? 'normale',
        segnalata_da: contesto.utenteId,
      },
      transaction,
    );
    await cambiaStatoCamera(dati.camera_id, dati.stato_camera, transaction);
    return nuova.id;
  });

  const segnalazione = await segnalazioneOppure404(id);
  await notifiche.aChiPuo(
    PERMESSI.MANUTENZIONE_GESTISCI,
    {
      tipo: 'manutenzione',
      priorita: ['alta', 'urgente'].includes(segnalazione.priorita) ? 'avviso' : 'info',
      titolo: segnalazione.camera
        ? `Guasto camera ${segnalazione.camera.numero}: ${segnalazione.titolo}`
        : segnalazione.titolo,
      testo: segnalazione.descrizione,
      link: link(id),
    },
    contesto.utenteId,
  );
  return segnalazione;
}

// Timestamp di chiusura e presa in carico automatica.
function modificheDiStato(segnalazione, dati, contesto) {
  const modifiche = {};
  if (dati.stato === 'risolta' && segnalazione.stato !== 'risolta') {
    modifiche.risolta_il = new Date();
  }
  if (STATI_SEGNALAZIONE_APERTA.includes(dati.stato)) {
    modifiche.risolta_il = null;
  }
  if (dati.stato === 'in_corso' && !segnalazione.assegnata_a && dati.assegnata_a === undefined) {
    modifiche.assegnata_a = contesto.utenteId;
  }
  return modifiche;
}

async function avvisaDopoAggiornamento(prima, dopo, contesto) {
  const nuovoIncaricato = dopo.assegnata_a !== prima.assegnata_a ? dopo.assegnata_a : null;
  if (nuovoIncaricato && nuovoIncaricato !== contesto.utenteId) {
    await notifiche.invia([nuovoIncaricato], {
      tipo: 'manutenzione',
      titolo: `Ti è stata assegnata: ${dopo.titolo}`,
      link: link(dopo.id),
    });
  }

  const appenaRisolta = dopo.stato === 'risolta' && prima.stato !== 'risolta';
  if (appenaRisolta && prima.segnalata_da !== contesto.utenteId) {
    await notifiche.invia([prima.segnalata_da], {
      tipo: 'manutenzione',
      priorita: 'successo',
      titolo: `Risolta: ${dopo.titolo}`,
      link: link(dopo.id),
    });
  }
}

/**
 * Presa in carico, assegnazione e chiusura.
 * dati: { stato?, assegnata_a?, priorita?, titolo?, descrizione?, note_risoluzione?, stato_camera? }
 */
async function aggiorna(id, dati, contesto) {
  const segnalazione = await segnalazioneOppure404(id);
  const chiusa = !STATI_SEGNALAZIONE_APERTA.includes(segnalazione.stato);
  if (chiusa && dati.stato === undefined) {
    throw richiestaNonValida('SEGNALAZIONE_CHIUSA', 'La segnalazione è già chiusa');
  }

  const modifiche = {
    stato: dati.stato,
    assegnata_a: dati.assegnata_a,
    priorita: dati.priorita,
    titolo: dati.titolo,
    descrizione: dati.descrizione,
    note_risoluzione: dati.note_risoluzione,
    ...modificheDiStato(segnalazione, dati, contesto),
  };

  await sequelize.transaction(async (transaction) => {
    await manutenzioneRepo.aggiornaSegnalazione(id, modifiche, transaction);
    await cambiaStatoCamera(segnalazione.camera_id, dati.stato_camera, transaction);
  });

  const aggiornata = await segnalazioneOppure404(id);
  await avvisaDopoAggiornamento(segnalazione, aggiornata, contesto);
  return aggiornata;
}

module.exports = {
  elenco,
  dettaglio,
  segnala,
  aggiorna,
};
