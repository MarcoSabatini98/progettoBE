// src/services/ospiti.service.js
//
// Anagrafiche degli ospiti (dati TULPS per Alloggiati Web) e ospiti di ogni
// prenotazione. L'anagrafica collegata a un account cliente la modifica solo il
// cliente dalla sua area personale: lo staff gestisce gli ospiti di passaggio.

const { transazione } = require('../models');
const ospitiRepo = require('../repositories/ospiti.repository');
const prenotazioniRepo = require('../repositories/prenotazioni.repository');
const tariffe = require('./tariffe.service');
const { nonTrovato, vietato, richiestaNonValida, conflitto } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { centesimi, euro } = require('../utils/denaro');
const { eta } = require('../utils/date');
const file = require('../utils/file');
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

function datiOspite(dati) {
  return {
    nome: dati.nome,
    cognome: dati.cognome,
    email: dati.email,
    telefono: dati.telefono,
    sesso: dati.sesso,
    data_nascita: dati.data_nascita,
    cittadinanza_codice: dati.cittadinanza_codice,
    stato_nascita_codice: dati.stato_nascita_codice,
    comune_nascita_codice: dati.comune_nascita_codice,
    provincia_nascita: dati.provincia_nascita,
    tipo_documento: dati.tipo_documento,
    numero_documento: dati.numero_documento,
    luogo_rilascio_codice: dati.luogo_rilascio_codice,
    scadenza_documento: dati.scadenza_documento,
    codice_fiscale: dati.codice_fiscale,
    indirizzo: dati.indirizzo,
    cap: dati.cap,
    citta: dati.citta,
    provincia: dati.provincia,
    paese: dati.paese,
    lingua: dati.lingua,
    note: dati.note,
  };
}

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
  return { ...ospite.toJSON(), campi_mancanti: campiMancanti(ospite) };
}

async function crea(dati) {
  const ospite = await ospitiRepo.creaOspite(datiOspite(dati));
  return await dettaglio(ospite.id);
}

/** Lo staff non modifica l'anagrafica di un cliente registrato. */
async function controllaModificabile(id) {
  const ospite = await ospitiRepo.trovaOspitePerId(id);
  if (!ospite) {
    throw nonTrovato('OSPITE_NON_TROVATO', 'Ospite non trovato');
  }
  const account = await ospitiRepo.trovaAccountDiOspite(id);
  if (account) {
    throw vietato(
      'DATI_CLIENTE_PROTETTI',
      'I dati personali del cliente li modifica solo il cliente',
    );
  }
  return ospite;
}

async function aggiorna(id, dati) {
  await controllaModificabile(id);
  await ospitiRepo.aggiornaOspite(id, datiOspite(dati));
  return await dettaglio(id);
}

/** Chi ha soggiorni registrati si conserva: sono dati di pubblica sicurezza. */
async function elimina(id) {
  await controllaModificabile(id);

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
 */
async function impostaDiPrenotazione(prenotazioneId, righe, contesto) {
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
    for (const riga of righe) {
      anagrafiche.push(await trovaOCrea(riga.ospite, transaction));
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
};
