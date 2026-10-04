// src/services/ospiti.service.js
//
// Anagrafiche degli ospiti (dati TULPS per Alloggiati Web) e ospiti di ogni
// prenotazione. Lo staff corregge anche l'anagrafica di un cliente registrato
// (documento rinnovato, nuova residenza, campi mancanti), tenendo allineato
// l'account; l'email resta la sua, perché è quella con cui accede.

const { transazione } = require('../models');
const ospitiRepo = require('../repositories/ospiti.repository');
const utentiRepo = require('../repositories/utenti.repository');
const prenotazioniRepo = require('../repositories/prenotazioni.repository');
const tariffe = require('./tariffe.service');
const { nonTrovato, vietato, richiestaNonValida, conflitto } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { centesimi, euro } = require('../utils/denaro');
const { eta } = require('../utils/date');
const file = require('../utils/file');
const { datiOspite, campiDaScrivere } = require('./helpers/dati-ospite');
const { TIPI_CON_DOCUMENTO, CODICE_ITALIA } = require('../constants/prenotazioni.constants');

// Campi obbligatori della schedina di Alloggiati Web.
const CAMPI_ALLOGGIATI = [
  'nome',
  'cognome',
  'sesso',
  'data_nascita',
  'cittadinanza_codice',
  'stato_nascita_codice',
];
// Il documento serve solo a chi guida il gruppo o viaggia da solo.
const CAMPI_DOCUMENTO = ['tipo_documento', 'numero_documento', 'luogo_rilascio_codice'];

/** Campi che mancano per poter inviare l'ospite ad Alloggiati Web. */
function campiMancanti(ospite, tipoAlloggiato = 'ospite_singolo') {
  const richiesti = [...CAMPI_ALLOGGIATI];
  if (TIPI_CON_DOCUMENTO.includes(tipoAlloggiato)) {
    richiesti.push(...CAMPI_DOCUMENTO);
  }
  if (ospite.stato_nascita_codice === CODICE_ITALIA) {
    richiesti.push('comune_nascita_codice', 'provincia_nascita');
  }
  return richiesti.filter((campo) => !ospite[campo]);
}

// ─────────────────────────────────────
// Anagrafiche
// ─────────────────────────────────────

async function elenco(query) {
  const p = pagina(query);
  const trovati = await ospitiRepo.trovaOspiti(query, p);
  return risultato(trovati, p);
}

async function dettaglio(id) {
  const ospite = await ospitiRepo.trovaSchedaOspite(id);
  if (!ospite) {
    throw nonTrovato('OSPITE_NON_TROVATO', 'Ospite non trovato');
  }
  const account = await ospitiRepo.trovaAccountDiOspite(id);
  return {
    ...ospite.toJSON(),
    campi_mancanti: campiMancanti(ospite),
    cliente_registrato: Boolean(account),
  };
}

async function crea(dati) {
  const ospite = await ospitiRepo.creaOspite(datiOspite(dati));
  return await dettaglio(ospite.id);
}

async function ospiteOppure404(id, transaction = null) {
  const ospite = await ospitiRepo.trovaOspitePerId(id, transaction);
  if (!ospite) {
    throw nonTrovato('OSPITE_NON_TROVATO', 'Ospite non trovato');
  }
  return ospite;
}

/**
 * Per un cliente registrato nome, cognome, telefono e lingua passano anche
 * all'account, come quando li cambia lui dal profilo.
 */
async function aggiorna(id, dati, contesto) {
  await transazione(contesto, async (transaction) => {
    const ospite = await ospiteOppure404(id, transaction);
    const account = await ospitiRepo.trovaAccountDiOspite(id, transaction);
    if (account && dati.email !== undefined && dati.email !== ospite.email) {
      throw vietato('EMAIL_ACCESSO_CLIENTE', "L'email di accesso la cambia solo il cliente");
    }

    await ospitiRepo.aggiornaOspite(id, datiOspite(dati), transaction);
    if (account) {
      const { nome, cognome, telefono, lingua } = dati;
      await utentiRepo.aggiornaUtente(account.id, { nome, cognome, telefono, lingua }, transaction);
    }
  });
  return await dettaglio(id);
}

/**
 * Chi ha soggiorni registrati si conserva: sono dati di pubblica sicurezza.
 * L'anagrafica di un cliente registrato va via solo con il suo account.
 */
async function elimina(id) {
  await ospiteOppure404(id);
  if (await ospitiRepo.trovaAccountDiOspite(id)) {
    throw vietato(
      'OSPITE_CLIENTE',
      "L'anagrafica di un cliente registrato si elimina con il suo account",
    );
  }

  const soggiorni = await ospitiRepo.contaSoggiorni(id);
  if (soggiorni > 0) {
    throw conflitto(
      'OSPITE_CON_SOGGIORNI',
      "L'ospite ha soggiorni registrati: i dati vanno conservati",
    );
  }

  const documenti = await ospitiRepo.trovaDocumentiDiOspite(id);
  await ospitiRepo.eliminaOspite(id);
  await Promise.all(documenti.map((salvato) => file.elimina(salvato.percorso)));
}

/**
 * Anagrafica per una prenotazione: se lo stesso documento è già registrato si
 * riusa (aggiornandola), altrimenti si crea. Quella di un cliente registrato
 * non si sovrascrive.
 */
async function trovaOCrea(dati, transaction = null) {
  if (dati.id) {
    const ospite = await ospitiRepo.trovaOspitePerId(dati.id, transaction);
    if (!ospite) {
      throw nonTrovato('OSPITE_NON_TROVATO', 'Ospite non trovato');
    }
    return ospite;
  }

  const esistente =
    dati.tipo_documento && dati.numero_documento
      ? await ospitiRepo.trovaOspitePerDocumento(
          dati.tipo_documento,
          dati.numero_documento,
          transaction,
        )
      : null;
  if (!esistente) {
    return await ospitiRepo.creaOspite(datiOspite(dati), transaction);
  }

  const account = await ospitiRepo.trovaAccountDiOspite(esistente.id, transaction);
  if (account) {
    return esistente;
  }
  return await ospitiRepo.aggiornaOspite(esistente.id, datiOspite(dati), transaction);
}

// ─────────────────────────────────────
// Documenti caricati (staff)
// ─────────────────────────────────────

/**
 * caricato = file ricevuto da multer. Se la richiesta viene rifiutata il file
 * lo elimina il gestore degli errori.
 */
async function aggiungiDocumento(ospiteId, caricato) {
  if (!caricato) {
    throw richiestaNonValida('FILE_MANCANTE', 'Allega il file');
  }

  const ospite = await ospitiRepo.trovaOspitePerId(ospiteId);
  if (!ospite) {
    throw nonTrovato('OSPITE_NON_TROVATO', 'Ospite non trovato');
  }

  return await ospitiRepo.creaDocumento({
    ospite_id: ospiteId,
    nome_originale: caricato.originalname.slice(0, 255),
    percorso: file.percorsoRelativo(caricato.path),
    tipo_mime: caricato.mimetype,
    dimensione: caricato.size,
  });
}

async function documento(id) {
  const trovato = await ospitiRepo.trovaDocumentoPerId(id);
  if (!trovato) {
    throw nonTrovato('DOCUMENTO_NON_TROVATO', 'Documento non trovato');
  }
  return trovato;
}

async function eliminaDocumento(id) {
  const trovato = await documento(id);
  await ospitiRepo.eliminaDocumento(id);
  await file.elimina(trovato.percorso);
}

// ─────────────────────────────────────
// Ospiti di una prenotazione
// ─────────────────────────────────────

async function diPrenotazione(prenotazioneId) {
  const prenotazione = await prenotazioniRepo.trovaPrenotazionePerId(prenotazioneId);
  if (!prenotazione) {
    throw nonTrovato('PRENOTAZIONE_NON_TROVATA', 'Prenotazione non trovata');
  }

  const righe = await ospitiRepo.trovaOspitiDiPrenotazione(prenotazioneId);
  return righe.map((riga) => ({
    ...riga.ospite.toJSON(),
    tipo_alloggiato: riga.tipo_alloggiato,
    esente_tassa: riga.esente_tassa,
    motivo_esenzione: riga.motivo_esenzione,
    campi_mancanti: campiMancanti(riga.ospite, riga.tipo_alloggiato),
  }));
}

// Il primo ospite guida il gruppo; chi viaggia da solo è "ospite singolo".
function tipoAlloggiatoPredefinito(indice, totale) {
  if (totale === 1) {
    return 'ospite_singolo';
  }
  return indice === 0 ? 'capofamiglia' : 'familiare';
}

/**
 * Tassa di soggiorno ricalcolata con gli ospiti reali: sono esenti quelli
 * sotto l'età prevista e quelli con un motivo di esenzione.
 * @returns {Promise<number>} importo in euro
 */
async function tassaEffettiva(prenotazione, righe, anagrafiche) {
  const tassa = await tariffe.tassaInVigore(prenotazione.data_arrivo);
  if (!tassa) {
    return 0;
  }

  const tassabili = righe.filter((riga, indice) => {
    if (riga.esente_tassa) {
      return false;
    }
    const nascita = anagrafiche[indice].data_nascita;
    if (tassa.eta_esenzione && nascita) {
      return eta(nascita, prenotazione.data_arrivo) >= tassa.eta_esenzione;
    }
    return true;
  }).length;

  const notti = tassa.notti_max
    ? Math.min(prenotazione.notti, tassa.notti_max)
    : prenotazione.notti;
  return euro(centesimi(tassa.importo_notte) * notti * tassabili);
}

/**
 * Sostituisce gli ospiti del soggiorno. Quando sono registrati tutti, la tassa
 * di soggiorno si ricalcola con le età vere.
 *
 * @param {{ ospite: object, tipo_alloggiato?: string, esente_tassa?: boolean,
 *   motivo_esenzione?: string }[]} righe  ospite = { id } oppure i dati completi
 * @param {Function} anagrafica  (dati, transaction, indice) → ospite salvato
 */
async function impostaDiPrenotazione(prenotazioneId, righe, contesto, anagrafica = trovaOCrea) {
  await transazione(contesto, async (transaction) => {
    const prenotazione = await prenotazioniRepo.bloccaPrenotazione(prenotazioneId, transaction);
    if (!prenotazione) {
      throw nonTrovato('PRENOTAZIONE_NON_TROVATA', 'Prenotazione non trovata');
    }
    if (['cancellata', 'no_show'].includes(prenotazione.stato)) {
      throw conflitto('PRENOTAZIONE_CHIUSA', 'La prenotazione è cancellata');
    }

    const ospitiPrevisti = prenotazione.adulti + prenotazione.bambini;
    if (righe.length > ospitiPrevisti) {
      throw richiestaNonValida('TROPPI_OSPITI', `La prenotazione è per ${ospitiPrevisti} ospiti`);
    }

    const anagrafiche = [];
    for (const [indice, riga] of righe.entries()) {
      anagrafiche.push(await anagrafica(riga.ospite, transaction, indice));
    }
    const ids = anagrafiche.map((ospite) => ospite.id);
    if (new Set(ids).size !== ids.length) {
      throw richiestaNonValida('OSPITE_DUPLICATO', 'Lo stesso ospite è indicato due volte');
    }

    await ospitiRepo.sostituisciOspitiDiPrenotazione(
      prenotazioneId,
      righe.map((riga, indice) => ({
        prenotazione_id: prenotazioneId,
        ospite_id: ids[indice],
        tipo_alloggiato: riga.tipo_alloggiato ?? tipoAlloggiatoPredefinito(indice, righe.length),
        esente_tassa: Boolean(riga.esente_tassa),
        motivo_esenzione: riga.motivo_esenzione ?? null,
      })),
      transaction,
    );

    if (righe.length === ospitiPrevisti) {
      const tassa = await tassaEffettiva(prenotazione, righe, anagrafiche);
      await prenotazioniRepo.aggiornaPrenotazione(
        prenotazioneId,
        { tassa_soggiorno: tassa },
        transaction,
      );
    }
  });

  return await diPrenotazione(prenotazioneId);
}

// ─────────────────────────────────────
// Check-in online
// ─────────────────────────────────────

// Di quella di un cliente registrato si completano solo i campi vuoti: il
// resto lo cambia lui dal profilo.
async function aggiornaDaCheckin(presente, dati, transaction) {
  if (!presente) {
    return await ospitiRepo.creaOspite(campiDaScrivere(dati), transaction);
  }
  const account = await ospitiRepo.trovaAccountDiOspite(presente.id, transaction);
  const campi = campiDaScrivere(dati, presente, Boolean(account));
  return await ospitiRepo.aggiornaOspite(presente.id, campi, transaction);
}

/**
 * Chi ha il link non sceglie anagrafiche già registrate (nemmeno indicando lo
 * stesso documento): ogni riga aggiorna l'ospite nella stessa posizione, con i
 * soli campi compilati, oppure ne crea uno nuovo.
 */
async function impostaDaCheckin(prenotazioneId, righe, contesto) {
  const presenti = await ospitiRepo.trovaOspitiDiPrenotazione(prenotazioneId);
  return await impostaDiPrenotazione(prenotazioneId, righe, contesto, (dati, transaction, indice) =>
    aggiornaDaCheckin(presenti[indice]?.ospite, dati, transaction),
  );
}

/** Per chi ha il link: di ogni ospite il nome e i campi che mancano. */
async function mancantiDiPrenotazione(prenotazioneId) {
  const righe = await ospitiRepo.trovaOspitiDiPrenotazione(prenotazioneId);
  return righe.map(({ ospite, tipo_alloggiato: tipoAlloggiato }) => ({
    nome: ospite.nome,
    cognome: ospite.cognome,
    tipo_alloggiato: tipoAlloggiato,
    campi_mancanti: campiMancanti(ospite, tipoAlloggiato),
  }));
}

module.exports = {
  campiMancanti,
  elenco,
  dettaglio,
  crea,
  aggiorna,
  elimina,
  trovaOCrea,
  aggiungiDocumento,
  documento,
  eliminaDocumento,
  diPrenotazione,
  impostaDiPrenotazione,
  impostaDaCheckin,
  mancantiDiPrenotazione,
};
