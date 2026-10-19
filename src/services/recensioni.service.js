// src/services/recensioni.service.js
//
// Recensioni verificate: solo chi ha concluso un soggiorno (lo impone il DB),
// una per prenotazione. Escono sul sito dopo la moderazione.

const recensioniRepo = require('../repositories/recensioni.repository');
const prenotazioni = require('./prenotazioni.service');
const notifiche = require('./notifiche.service');
const { PERMESSI } = require('../constants/ruoli.constants');
const { nonTrovato, richiestaNonValida, conflitto } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');

const STATI_MODERAZIONE = ['pubblicata', 'rifiutata'];

function datiRecensione(dati) {
  return {
    voto: dati.voto,
    voto_pulizia: dati.voto_pulizia,
    voto_personale: dati.voto_personale,
    voto_posizione: dati.voto_posizione,
    voto_comfort: dati.voto_comfort,
    voto_qualita_prezzo: dati.voto_qualita_prezzo,
    titolo: dati.titolo,
    commento: dati.commento,
    lingua: dati.lingua,
    anonima: dati.anonima,
  };
}

async function recensioneOppure404(id) {
  const recensione = await recensioniRepo.trovaRecensionePerId(id);
  if (!recensione) {
    throw nonTrovato('RECENSIONE_NON_TROVATA', 'Recensione non trovata');
  }
  return recensione;
}

// ─────────────────────────────────────
// Sito pubblico
// ─────────────────────────────────────

/** "Mario R.", oppure null se la recensione è anonima. */
function firma(recensione) {
  if (recensione.anonima || !recensione.ospite) {
    return null;
  }
  return `${recensione.ospite.nome} ${recensione.ospite.cognome.charAt(0)}.`;
}

// Sul sito non escono mai nome completo né dati della prenotazione.
function perIlSito(recensione) {
  return {
    id: recensione.id,
    voto: recensione.voto,
    voto_pulizia: recensione.voto_pulizia,
    voto_personale: recensione.voto_personale,
    voto_posizione: recensione.voto_posizione,
    voto_comfort: recensione.voto_comfort,
    voto_qualita_prezzo: recensione.voto_qualita_prezzo,
    titolo: recensione.titolo,
    commento: recensione.commento,
    lingua: recensione.lingua,
    autore: firma(recensione),
    paese: recensione.anonima ? null : (recensione.ospite?.paese ?? null),
    risposta: recensione.risposta,
    risposta_il: recensione.risposta_il,
    creato_il: recensione.creato_il,
  };
}

async function pubbliche(query = {}) {
  const p = pagina(query);
  const trovate = await recensioniRepo.trovaPubblicate(query.lingua, p);
  const esito = risultato(trovate, p);
  esito.elementi = esito.elementi.map(perIlSito);
  return esito;
}

/** Numero di recensioni pubblicate e medie dei voti. */
async function valutazioni() {
  return await recensioniRepo.trovaValutazioni();
}

// ─────────────────────────────────────
// Cliente
// ─────────────────────────────────────

function richiediSoggiornoConcluso(prenotazione) {
  if (prenotazione.stato !== 'conclusa') {
    throw richiestaNonValida(
      'RECENSIONE_NON_CONSENTITA',
      'Puoi recensire solo un soggiorno concluso',
    );
  }
}

async function scrivi(prenotazioneId, utenteId, dati) {
  if (await recensioniRepo.esisteRecensioneDiPrenotazione(prenotazioneId)) {
    throw conflitto('RECENSIONE_GIA_PRESENTE', 'Hai già recensito questo soggiorno');
  }

  // ospite_id lo imposta il trigger dalla prenotazione.
  const recensione = await recensioniRepo.creaRecensione({
    ...datiRecensione(dati),
    prenotazione_id: prenotazioneId,
    utente_id: utenteId,
  });

  await notifiche.aChiPuo(PERMESSI.RECENSIONI_MODERA, {
    tipo: 'recensione',
    priorita: recensione.voto <= 2 ? 'avviso' : 'info',
    codice: 'recensione_nuova',
    parametri: { voto: recensione.voto },
    titolo: `Nuova recensione: ${recensione.voto}/5`,
    testo: recensione.titolo,
    link: `/staff/recensioni/${recensione.id}`,
  });
  return await recensioneOppure404(recensione.id);
}

/** Cliente registrato, dalla sua area personale. */
async function crea(prenotazioneId, dati, contesto) {
  const prenotazione = await prenotazioni.mia(contesto.utenteId, prenotazioneId);
  richiediSoggiornoConcluso(prenotazione);
  return await scrivi(prenotazione.id, contesto.utenteId, dati);
}

/** Ospite senza account: codice prenotazione + email del titolare (link nell'email). */
async function creaDaCodice(codice, email, dati) {
  const prenotazione = await prenotazioni.perCodice(codice, email);
  richiediSoggiornoConcluso(prenotazione);
  return await scrivi(prenotazione.id, prenotazione.utente_id ?? null, dati);
}

// ─────────────────────────────────────
// Staff
// ─────────────────────────────────────

async function elenco(query = {}) {
  const p = pagina(query);
  const trovate = await recensioniRepo.trovaRecensioni(query, p);
  return risultato(trovate, p);
}

async function dettaglio(id) {
  return await recensioneOppure404(id);
}

async function modera(id, stato, contesto) {
  if (!STATI_MODERAZIONE.includes(stato)) {
    throw richiestaNonValida('STATO_NON_VALIDO', 'Stato ammesso: pubblicata o rifiutata');
  }
  await recensioneOppure404(id);
  await recensioniRepo.aggiornaRecensione(id, { stato, moderata_da: contesto.utenteId });
  return await recensioneOppure404(id);
}

/** Risposta pubblica della struttura (stringa vuota = la toglie). */
async function rispondi(id, risposta, contesto) {
  await recensioneOppure404(id);
  await recensioniRepo.aggiornaRecensione(id, {
    risposta: risposta || null,
    risposta_da: risposta ? contesto.utenteId : null,
  });
  return await recensioneOppure404(id);
}

module.exports = {
  pubbliche,
  valutazioni,
  crea,
  creaDaCodice,
  elenco,
  dettaglio,
  modera,
  rispondi,
};
