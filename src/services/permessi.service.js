// src/services/permessi.service.js
//
// Permessi per ruolo, configurabili dall'admin. L'admin li ha sempre tutti:
// così non può togliersene nessuno per sbaglio e restare chiuso fuori.
// I permessi si leggono a ogni richiesta, quindi restano in memoria
// finché l'admin non li cambia.

const { sequelize } = require('../models');
const permessiRepo = require('../repositories/permessi.repository');
const { RUOLI } = require('../constants/ruoli.constants');
const { nonTrovato, richiestaNonValida } = require('../utils/errori');

// Map ruolo → Set dei codici permesso.
let cache = null;

function svuotaCache() {
  cache = null;
}

async function caricaPermessi() {
  if (cache) {
    return cache;
  }

  const assegnazioni = await permessiRepo.trovaAssegnazioni();
  const catalogo = await permessiRepo.trovaPermessi();

  const mappa = new Map();
  for (const assegnazione of assegnazioni) {
    if (!mappa.has(assegnazione.ruolo)) {
      mappa.set(assegnazione.ruolo, new Set());
    }
    mappa.get(assegnazione.ruolo).add(assegnazione.permesso);
  }
  mappa.set(RUOLI.ADMIN, new Set(catalogo.map((permesso) => permesso.codice)));

  cache = mappa;
  return cache;
}

async function ha(ruolo, permesso) {
  const mappa = await caricaPermessi();
  return mappa.get(ruolo)?.has(permesso) ?? false;
}

async function permessiDi(ruolo) {
  const mappa = await caricaPermessi();
  return [...(mappa.get(ruolo) ?? [])].sort();
}

/** Ruoli che hanno il permesso, admin compreso. */
async function ruoliCon(permesso) {
  const mappa = await caricaPermessi();
  return [...mappa].filter(([, codici]) => codici.has(permesso)).map(([ruolo]) => ruolo);
}

/** Ruoli, catalogo dei permessi e assegnazioni: la matrice per l'admin. */
async function matrice() {
  const permessi = await permessiRepo.trovaPermessi();
  const ruoli = await permessiRepo.trovaRuoliConPermessi();
  const tutti = permessi.map((permesso) => permesso.codice);

  return {
    permessi,
    ruoli: ruoli.map((ruolo) => ({
      codice: ruolo.codice,
      nome: ruolo.nome,
      descrizione: ruolo.descrizione,
      staff: ruolo.staff,
      permessi:
        ruolo.codice === RUOLI.ADMIN
          ? tutti
          : ruolo.permessi.map((permesso) => permesso.codice).sort(),
    })),
  };
}

/** Sostituisce i permessi di un ruolo (tranne l'admin). */
async function impostaPermessi(ruolo, codici) {
  if (ruolo === RUOLI.ADMIN) {
    throw richiestaNonValida(
      'RUOLO_NON_MODIFICABILE',
      "L'amministratore ha sempre tutti i permessi",
    );
  }
  if (!(await permessiRepo.trovaRuoloPerCodice(ruolo))) {
    throw nonTrovato('RUOLO_NON_TROVATO', 'Ruolo non trovato');
  }

  const catalogo = await permessiRepo.trovaPermessi();
  const esistenti = new Set(catalogo.map((permesso) => permesso.codice));
  const sconosciuti = codici.filter((codice) => !esistenti.has(codice));
  if (sconosciuti.length > 0) {
    throw richiestaNonValida(
      'PERMESSO_SCONOSCIUTO',
      `Permessi inesistenti: ${sconosciuti.join(', ')}`,
    );
  }

  const senzaDoppioni = [...new Set(codici)];
  await sequelize.transaction(async (transaction) => {
    await permessiRepo.sostituisciPermessiRuolo(ruolo, senzaDoppioni, transaction);
  });
  svuotaCache();
  return await permessiDi(ruolo);
}

// ─────────────────────────────────────
// Regole della chat interna
// ─────────────────────────────────────

// Una regola vale nei due sensi: la coppia si salva sempre in ordine alfabetico.
function ordinaCoppia(ruoloA, ruoloB) {
  return ruoloA <= ruoloB ? [ruoloA, ruoloB] : [ruoloB, ruoloA];
}

async function regoleChat() {
  return await permessiRepo.trovaRegoleChat();
}

async function puoChattare(ruoloA, ruoloB) {
  const [primo, secondo] = ordinaCoppia(ruoloA, ruoloB);
  const regola = await permessiRepo.trovaRegolaChat(primo, secondo);
  return Boolean(regola);
}

/** Sostituisce tutte le regole. coppie = [[ruolo, ruolo], ...] */
async function impostaRegoleChat(coppie) {
  const staff = await permessiRepo.trovaRuoliStaff();
  const ruoliStaff = new Set(staff.map((ruolo) => ruolo.codice));

  const nonStaff = [...new Set(coppie.flat())].filter((ruolo) => !ruoliStaff.has(ruolo));
  if (nonStaff.length > 0) {
    throw richiestaNonValida(
      'RUOLO_NON_STAFF',
      `La chat interna è solo per lo staff: ${nonStaff.join(', ')}`,
    );
  }

  const uniche = new Map();
  for (const [ruoloA, ruoloB] of coppie) {
    const coppia = ordinaCoppia(ruoloA, ruoloB);
    uniche.set(coppia.join('|'), coppia);
  }

  await sequelize.transaction(async (transaction) => {
    await permessiRepo.sostituisciRegoleChat([...uniche.values()], transaction);
  });
  return await regoleChat();
}

module.exports = {
  ha,
  permessiDi,
  ruoliCon,
  matrice,
  impostaPermessi,
  regoleChat,
  puoChattare,
  impostaRegoleChat,
  svuotaCache,
};
