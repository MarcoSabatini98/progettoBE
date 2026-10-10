// src/services/contenuti.service.js
//
// Contenuti del sito: traduzioni, media, FAQ, pagine e sezioni, documenti legali, eventi speciali.
// Il testo italiano sta nella tabella originale, le altre lingue in traduzioni.

const { sequelize } = require('../models');
const contenutiRepo = require('../repositories/contenuti.repository');
const impostazioni = require('./impostazioni.service');
const { ErroreApp, nonTrovato, richiestaNonValida } = require('../utils/errori');
const { applicaTraduzioni } = require('../utils/traduzioni');
const file = require('../utils/file');
const { CAMPI_TRADUCIBILI, GIORNI_EVENTI_SITO } = require('../constants/sistema.constants');
const { oggi, aggiungiGiorni } = require('../utils/date');
const { ENTITA_CON_VIDEO } = require('../constants/camere.constants');

// ─────────────────────────────────────
// Traduzioni (area admin)
// ─────────────────────────────────────

/** Tutte le traduzioni di un record: { en: { nome, descrizione }, de: { ... } }. */
async function traduzioniDi(entita, entitaId) {
  const righe = await contenutiRepo.trovaTraduzioni(entita, entitaId);

  const perLingua = {};
  for (const riga of righe) {
    perLingua[riga.lingua] = perLingua[riga.lingua] ?? {};
    perLingua[riga.lingua][riga.campo] = riga.testo;
  }
  return perLingua;
}

/**
 * Salva le traduzioni di un record: { en: { nome: '...' } }.
 * Un testo vuoto elimina la traduzione di quel campo.
 */
async function salvaTraduzioni(entita, entitaId, perLingua) {
  const lingueAttive = await impostazioni.leggi('lingue_attive', ['it']);
  const nonAmmesse = Object.keys(perLingua).filter(
    (lingua) => lingua === 'it' || !lingueAttive.includes(lingua),
  );
  if (nonAmmesse.length > 0) {
    throw richiestaNonValida(
      'LINGUA_NON_ATTIVA',
      `Lingue non attive o non traducibili: ${nonAmmesse.join(', ')}`,
    );
  }

  const campiAmmessi = CAMPI_TRADUCIBILI[entita];
  const campiInviati = Object.values(perLingua).flatMap((campi) => Object.keys(campi));
  const campiNonAmmessi = [...new Set(campiInviati)].filter(
    (campo) => !campiAmmessi.includes(campo),
  );
  if (campiNonAmmessi.length > 0) {
    throw richiestaNonValida(
      'CAMPO_NON_TRADUCIBILE',
      `Campi non traducibili: ${campiNonAmmessi.join(', ')}`,
    );
  }

  await sequelize.transaction(async (transaction) => {
    for (const [lingua, campi] of Object.entries(perLingua)) {
      for (const [campo, testo] of Object.entries(campi)) {
        const chiave = { entita, entita_id: entitaId, campo, lingua };
        if (testo) {
          await contenutiRepo.salvaTraduzione(chiave, testo, transaction);
        } else {
          await contenutiRepo.eliminaTraduzione(chiave, transaction);
        }
      }
    }
  });

  return traduzioniDi(entita, entitaId);
}

// ─────────────────────────────────────
// Media
// ─────────────────────────────────────

async function elencoMedia(entita, entitaId = null) {
  return await contenutiRepo.trovaMedia(entita, entitaId);
}

/** Registra un'immagine appena salvata su disco da multer. */
async function aggiungiMedia(
  { entita, entitaId = null, testoAlternativo = '', ordine = 0 },
  caricato,
) {
  if (!caricato) {
    throw richiestaNonValida('FILE_MANCANTE', 'Allega il file');
  }
  if (caricato.mimetype.startsWith('video/') && !ENTITA_CON_VIDEO.includes(entita)) {
    throw new ErroreApp(415, 'FORMATO_FILE_NON_VALIDO', 'Qui si possono caricare solo immagini');
  }

  return await contenutiRepo.creaMedia({
    entita,
    entita_id: entitaId,
    percorso: file.percorsoRelativo(caricato.path),
    tipo_mime: caricato.mimetype,
    dimensione: caricato.size,
    testo_alternativo: testoAlternativo,
    ordine,
  });
}

async function aggiornaMedia(id, dati) {
  const media = await contenutiRepo.aggiornaMedia(id, {
    testo_alternativo: dati.testo_alternativo,
    ordine: dati.ordine,
  });
  if (!media) {
    throw nonTrovato('MEDIA_NON_TROVATO', 'Immagine non trovata');
  }
  return media;
}

/** Riordina le immagini: ids nell'ordine voluto. */
async function riordinaMedia(ids) {
  await sequelize.transaction(async (transaction) => {
    for (const [ordine, id] of ids.entries()) {
      await contenutiRepo.aggiornaMedia(id, { ordine }, transaction);
    }
  });
}

async function eliminaMedia(id) {
  const media = await contenutiRepo.trovaMediaPerId(id);
  if (!media) {
    throw nonTrovato('MEDIA_NON_TROVATO', 'Immagine non trovata');
  }
  await contenutiRepo.eliminaMedia(id);
  await file.elimina(media.percorso);
}

/** Elimina immagini e traduzioni di un'entità (camera, pacchetto...) eliminata. */
async function eliminaContenutiDi(entita, entitaId) {
  const immagini = await contenutiRepo.trovaMedia(entita, entitaId);

  await sequelize.transaction(async (transaction) => {
    await contenutiRepo.eliminaMediaDi(entita, entitaId, transaction);
    await contenutiRepo.eliminaTraduzioniDi(entita, entitaId, transaction);
  });

  for (const media of immagini) {
    await file.elimina(media.percorso);
  }
}

// ─────────────────────────────────────
// FAQ
// ─────────────────────────────────────

async function elencoFaq(filtri) {
  return await contenutiRepo.trovaFaq(filtri);
}

async function faqPubbliche(lingua = 'it') {
  const righe = await contenutiRepo.trovaFaqPubbliche(lingua);
  return righe.map(applicaTraduzioni);
}

async function dettaglioFaq(id) {
  const faq = await contenutiRepo.trovaFaqPerId(id);
  if (!faq) {
    throw nonTrovato('FAQ_NON_TROVATA', 'FAQ non trovata');
  }
  return faq;
}

async function creaFaq(dati, contesto) {
  const faq = await contenutiRepo.creaFaq({
    domanda: dati.domanda,
    risposta: dati.risposta,
    categoria: dati.categoria,
    ordine: dati.ordine,
    pubblicata: dati.pubblicata,
    creato_da: contesto.utenteId,
    aggiornato_da: contesto.utenteId,
  });
  return dettaglioFaq(faq.id);
}

async function aggiornaFaq(id, dati, contesto) {
  const faq = await contenutiRepo.aggiornaFaq(id, {
    domanda: dati.domanda,
    risposta: dati.risposta,
    categoria: dati.categoria,
    ordine: dati.ordine,
    pubblicata: dati.pubblicata,
    aggiornato_da: contesto.utenteId,
  });
  if (!faq) {
    throw nonTrovato('FAQ_NON_TROVATA', 'FAQ non trovata');
  }
  return dettaglioFaq(id);
}

async function eliminaFaq(id) {
  await dettaglioFaq(id);
  await sequelize.transaction(async (transaction) => {
    await contenutiRepo.eliminaTraduzioniDi('faq', id, transaction);
    await contenutiRepo.eliminaFaq(id, transaction);
  });
}

// ─────────────────────────────────────
// Pagine del sito e sezioni immagine-testo
// ─────────────────────────────────────

/** Home, struttura o attività: descrizione, copertina e sezioni pubblicate, tradotte. */
async function paginaPubblica(chiave, lingua = 'it') {
  const pagina = await contenutiRepo.trovaPaginaPubblica(chiave, lingua);
  if (!pagina) {
    throw nonTrovato('PAGINA_NON_TROVATA', 'Pagina non trovata');
  }
  const tradotta = applicaTraduzioni(pagina);
  tradotta.sezioni = tradotta.sezioni.map(applicaTraduzioni);
  return tradotta;
}

async function elencoPagine() {
  return await contenutiRepo.trovaPagine();
}

async function aggiornaPagina(id, dati) {
  const pagina = await contenutiRepo.aggiornaPagina(id, {
    descrizione: dati.descrizione || null,
    testo: dati.testo || null,
  });
  if (!pagina) {
    throw nonTrovato('PAGINA_NON_TROVATA', 'Pagina non trovata');
  }
  return pagina;
}

async function dettaglioSezione(id) {
  const sezione = await contenutiRepo.trovaSezionePerId(id);
  if (!sezione) {
    throw nonTrovato('SEZIONE_NON_TROVATA', 'Sezione non trovata');
  }
  return sezione;
}

async function creaSezione(dati) {
  if (!(await contenutiRepo.trovaPaginaPerId(dati.pagina_id))) {
    throw nonTrovato('PAGINA_NON_TROVATA', 'Pagina non trovata');
  }
  const sezione = await contenutiRepo.creaSezione({
    pagina_id: dati.pagina_id,
    titolo: dati.titolo,
    testo: dati.testo,
    ordine: dati.ordine,
    pubblicata: dati.pubblicata,
  });
  return dettaglioSezione(sezione.id);
}

async function aggiornaSezione(id, dati) {
  const sezione = await contenutiRepo.aggiornaSezione(id, {
    titolo: dati.titolo,
    testo: dati.testo,
    ordine: dati.ordine,
    pubblicata: dati.pubblicata,
  });
  if (!sezione) {
    throw nonTrovato('SEZIONE_NON_TROVATA', 'Sezione non trovata');
  }
  return dettaglioSezione(id);
}

/** La sezione eliminata si porta via immagine e traduzioni. */
async function eliminaSezione(id) {
  await dettaglioSezione(id);
  await contenutiRepo.eliminaSezione(id);
  await eliminaContenutiDi('sezione', id);
}

// ─────────────────────────────────────
// Documenti legali (privacy, termini, cookie)
// Una versione pubblicata non si tocca più: se ne crea una nuova.
// ─────────────────────────────────────

async function elencoDocumentiLegali(filtri) {
  return await contenutiRepo.trovaDocumentiLegali(filtri);
}

async function dettaglioDocumentoLegale(id) {
  const documento = await contenutiRepo.trovaDocumentoLegalePerId(id);
  if (!documento) {
    throw nonTrovato('DOCUMENTO_LEGALE_NON_TROVATO', 'Documento legale non trovato');
  }
  return documento;
}

/** Versione in vigore nella lingua richiesta; se manca, quella italiana. */
async function documentoLegaleVigente(tipo, lingua = 'it') {
  let documento = await contenutiRepo.trovaDocumentoLegaleVigente(tipo, lingua);
  if (!documento && lingua !== 'it') {
    documento = await contenutiRepo.trovaDocumentoLegaleVigente(tipo, 'it');
  }
  if (!documento) {
    throw nonTrovato('DOCUMENTO_LEGALE_NON_TROVATO', 'Documento non ancora pubblicato');
  }
  return documento;
}

async function creaDocumentoLegale(dati, contesto) {
  return await contenutiRepo.creaDocumentoLegale({
    tipo: dati.tipo,
    versione: dati.versione,
    lingua: dati.lingua,
    contenuto: dati.contenuto,
    creato_da: contesto.utenteId,
  });
}

async function bozzaDocumentoLegale(id) {
  const documento = await dettaglioDocumentoLegale(id);
  if (documento.pubblicato_il) {
    throw richiestaNonValida(
      'GIA_PUBBLICATO',
      'Documento già pubblicato: creane una nuova versione',
    );
  }
  return documento;
}

async function aggiornaDocumentoLegale(id, dati) {
  await bozzaDocumentoLegale(id);
  return await contenutiRepo.aggiornaDocumentoLegale(id, {
    versione: dati.versione,
    contenuto: dati.contenuto,
  });
}

async function pubblicaDocumentoLegale(id) {
  await bozzaDocumentoLegale(id);
  return await contenutiRepo.aggiornaDocumentoLegale(id, { pubblicato_il: new Date() });
}

/** Si eliminano solo le bozze: i consensi degli utenti puntano alle versioni pubblicate. */
async function eliminaDocumentoLegale(id) {
  await bozzaDocumentoLegale(id);
  await contenutiRepo.eliminaDocumentoLegale(id);
}

// ─────────────────────────────────────
// Eventi speciali (festività, fiere, eventi locali)
// ─────────────────────────────────────

async function elencoEventi(filtri) {
  return await contenutiRepo.trovaEventi(filtri);
}

/** Eventi in zona per il sito: in corso o nei prossimi giorni, tradotti. */
async function eventiPubblici(lingua = 'it') {
  const dal = oggi();
  const righe = await contenutiRepo.trovaEventiPubblici(
    dal,
    aggiungiGiorni(dal, GIORNI_EVENTI_SITO),
    lingua,
  );
  return righe.map(applicaTraduzioni);
}

async function eventiNelPeriodo(dal, al) {
  return await contenutiRepo.trovaEventi({ dal, al });
}

async function dettaglioEvento(id) {
  const evento = await contenutiRepo.trovaEventoPerId(id);
  if (!evento) {
    throw nonTrovato('EVENTO_NON_TROVATO', 'Evento non trovato');
  }
  return evento;
}

function controllaDateEvento(dataInizio, dataFine) {
  if (dataInizio && dataFine && dataFine < dataInizio) {
    throw richiestaNonValida('DATE_NON_VALIDE', "La fine dell'evento è prima dell'inizio");
  }
}

async function creaEvento(dati) {
  controllaDateEvento(dati.data_inizio, dati.data_fine);
  return await contenutiRepo.creaEvento({
    titolo: dati.titolo,
    tipo: dati.tipo,
    data_inizio: dati.data_inizio,
    data_fine: dati.data_fine,
    impatto: dati.impatto,
    note: dati.note,
  });
}

async function aggiornaEvento(id, dati) {
  const evento = await dettaglioEvento(id);
  controllaDateEvento(dati.data_inizio ?? evento.data_inizio, dati.data_fine ?? evento.data_fine);
  return await contenutiRepo.aggiornaEvento(id, {
    titolo: dati.titolo,
    tipo: dati.tipo,
    data_inizio: dati.data_inizio,
    data_fine: dati.data_fine,
    impatto: dati.impatto,
    note: dati.note,
  });
}

async function eliminaEvento(id) {
  await dettaglioEvento(id);
  await sequelize.transaction(async (transaction) => {
    await contenutiRepo.eliminaTraduzioniDi('evento', id, transaction);
    await contenutiRepo.eliminaEvento(id, transaction);
  });
}

module.exports = {
  traduzioniDi,
  salvaTraduzioni,
  elencoMedia,
  aggiungiMedia,
  aggiornaMedia,
  riordinaMedia,
  eliminaMedia,
  eliminaContenutiDi,
  elencoFaq,
  faqPubbliche,
  dettaglioFaq,
  creaFaq,
  aggiornaFaq,
  eliminaFaq,
  paginaPubblica,
  elencoPagine,
  aggiornaPagina,
  dettaglioSezione,
  creaSezione,
  aggiornaSezione,
  eliminaSezione,
  elencoDocumentiLegali,
  dettaglioDocumentoLegale,
  documentoLegaleVigente,
  creaDocumentoLegale,
  aggiornaDocumentoLegale,
  pubblicaDocumentoLegale,
  eliminaDocumentoLegale,
  elencoEventi,
  eventiPubblici,
  eventiNelPeriodo,
  dettaglioEvento,
  creaEvento,
  aggiornaEvento,
  eliminaEvento,
};
