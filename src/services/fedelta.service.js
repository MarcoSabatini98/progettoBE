// src/services/fedelta.service.js
//
// Programma fedeltà. Il cliente accumula punti a ogni soggiorno (li assegna il
// trigger al check-out) e sale di livello: bronze → silver → gold → platinum →
// diamond. Ogni livello dà uno sconto percentuale sulle prenotazioni.
// L'admin può dare bonus, correggere il saldo o portare un cliente a un livello.

const fedeltaRepo = require('../repositories/fedelta.repository');
const utentiRepo = require('../repositories/utenti.repository');
const { nonTrovato, richiestaNonValida, conflitto } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { RUOLI } = require('../constants/ruoli.constants');

const MOTIVI_MANUALI = ['bonus', 'rettifica'];

function datiLivello(dati) {
  return {
    codice: dati.codice,
    nome: dati.nome,
    punti_minimi: dati.punti_minimi,
    sconto_percentuale: dati.sconto_percentuale,
    colore: dati.colore,
  };
}

async function clienteDaId(utenteId) {
  const utente = await utentiRepo.trovaUtentePerId(utenteId);
  if (!utente) {
    throw nonTrovato('UTENTE_NON_TROVATO', 'Utente non trovato');
  }
  if (utente.ruolo !== RUOLI.CLIENTE) {
    throw richiestaNonValida('NON_CLIENTE', 'Il programma fedeltà è riservato ai clienti');
  }
  return utente;
}

// ─────────────────────────────────────
// Livelli
// ─────────────────────────────────────

async function elencoLivelli() {
  return await fedeltaRepo.trovaLivelli();
}

async function dettaglioLivello(id) {
  const livello = await fedeltaRepo.trovaLivelloPerId(id);
  if (!livello) {
    throw nonTrovato('LIVELLO_NON_TROVATO', 'Livello fedeltà non trovato');
  }
  return livello;
}

async function creaLivello(dati) {
  return await fedeltaRepo.creaLivello(datiLivello(dati));
}

async function aggiornaLivello(id, dati) {
  const livello = await fedeltaRepo.aggiornaLivello(id, datiLivello(dati));
  if (!livello) {
    throw nonTrovato('LIVELLO_NON_TROVATO', 'Livello fedeltà non trovato');
  }
  return livello;
}

async function eliminaLivello(id) {
  const livello = await dettaglioLivello(id);
  if (livello.punti_minimi === 0) {
    throw conflitto('LIVELLO_BASE', 'Il livello di partenza non si può eliminare');
  }
  await fedeltaRepo.eliminaLivello(id);
}

// ─────────────────────────────────────
// Situazione del cliente
// ─────────────────────────────────────

/** Livello attuale, sconto e punti che mancano al livello successivo. */
async function situazione(utenteId) {
  const fedelta = await fedeltaRepo.trovaFedeltaUtente(utenteId);
  if (!fedelta) {
    return null;
  }
  const dati = fedelta.toJSON();
  const mancanti =
    dati.punti_prossimo_livello != null ? dati.punti_prossimo_livello - dati.punti_fedelta : null;
  return { ...dati, punti_mancanti: mancanti };
}

/** Sconto fedeltà da applicare al preventivo (0 per ospiti non registrati). */
async function percentualeSconto(utenteId) {
  if (!utenteId) {
    return 0;
  }
  const fedelta = await fedeltaRepo.trovaFedeltaUtente(utenteId);
  return Number(fedelta?.sconto_percentuale ?? 0);
}

async function movimenti(utenteId, query) {
  const p = pagina(query);
  const trovati = await fedeltaRepo.trovaMovimenti(utenteId, p);
  return risultato(trovati, p);
}

/** Punti guadagnati e spesi nell'anno solare indicato. */
async function statisticheAnno(utenteId, anno = new Date().getFullYear()) {
  const { guadagnati, tolti } = await fedeltaRepo.sommaPuntiNelPeriodo(
    utenteId,
    `${anno}-01-01`,
    `${anno + 1}-01-01`,
  );
  return { anno, punti_guadagnati: guadagnati, punti_tolti: tolti };
}

// ─────────────────────────────────────
// Gestione (admin)
// ─────────────────────────────────────

/** Clienti con livello e punti, dai più fedeli. */
async function classifica(query) {
  const p = pagina(query);
  const trovati = await fedeltaRepo.trovaClassifica({ livello: query.livello, ...p });
  return risultato(trovati, p);
}

async function clientiPerLivello() {
  return await fedeltaRepo.contaClientiPerLivello();
}

/**
 * Bonus o rettifica manuale. Punti negativi = sottrazione.
 * Il saldo lo aggiorna il trigger su movimenti_punti.
 */
async function assegnaPunti(utenteId, { punti, motivo = 'bonus', note }, contesto) {
  if (!MOTIVI_MANUALI.includes(motivo)) {
    throw richiestaNonValida('MOTIVO_NON_VALIDO', 'Motivo ammesso: bonus o rettifica');
  }
  if (!Number.isInteger(punti) || punti === 0) {
    throw richiestaNonValida('PUNTI_NON_VALIDI', 'Indica un numero intero di punti diverso da 0');
  }

  const cliente = await clienteDaId(utenteId);
  if (cliente.punti_fedelta + punti < 0) {
    throw richiestaNonValida(
      'PUNTI_INSUFFICIENTI',
      `Il cliente ha solo ${cliente.punti_fedelta} punti`,
    );
  }

  await fedeltaRepo.creaMovimento({
    utente_id: utenteId,
    punti,
    motivo,
    note: note ?? null,
    creato_da: contesto.utenteId,
  });
  return await situazione(utenteId);
}

/**
 * Porta il cliente esattamente alla soglia di un livello (promozione o
 * retrocessione decisa dall'admin). Si registra come rettifica, così lo
 * storico dei punti resta coerente con il saldo.
 */
async function impostaLivello(utenteId, codiceLivello, contesto) {
  const livello = await fedeltaRepo.trovaLivelloPerCodice(codiceLivello);
  if (!livello) {
    throw nonTrovato('LIVELLO_NON_TROVATO', 'Livello fedeltà non trovato');
  }

  const cliente = await clienteDaId(utenteId);
  const differenza = livello.punti_minimi - cliente.punti_fedelta;
  if (differenza === 0) {
    return await situazione(utenteId);
  }

  await fedeltaRepo.creaMovimento({
    utente_id: utenteId,
    punti: differenza,
    motivo: 'rettifica',
    note: `Livello impostato a ${livello.nome}`,
    creato_da: contesto.utenteId,
  });
  return await situazione(utenteId);
}

module.exports = {
  elencoLivelli,
  dettaglioLivello,
  creaLivello,
  aggiornaLivello,
  eliminaLivello,
  situazione,
  percentualeSconto,
  movimenti,
  statisticheAnno,
  classifica,
  clientiPerLivello,
  assegnaPunti,
  impostaLivello,
};
