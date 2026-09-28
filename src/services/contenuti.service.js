// Contenuti del sito: traduzioni, media, FAQ, documenti legali, eventi speciali.
// Il testo italiano sta nella tabella originale; le altre lingue in traduzioni.

const { Op } = require('sequelize');
const { Traduzione, Media, Faq, DocumentoLegale, EventoSpeciale, sequelize } = require('../models');
const { oppure404, richiestaNonValida } = require('../utils/errori');
const file = require('../utils/file');
const impostazioni = require('./impostazioni.service');
const { crud } = require('./crud');

// --- traduzioni ---------------------------------------------------------------------

/**
 * Sostituisce nei record i campi tradotti nella lingua richiesta.
 * Se manca la traduzione resta l'italiano. Accetta istanze o oggetti.
 * @returns {Promise<object[]>} oggetti semplici
 */
async function traduci(entita, record, lingua) {
  const lista = (Array.isArray(record) ? record : [record])
    .filter(Boolean)
    .map((r) => (r.toJSON ? r.toJSON() : r));
  if (!lingua || lingua === 'it' || !lista.length) return Array.isArray(record) ? lista : lista[0];

  const traduzioni = await Traduzione.findAll({
    where: { entita, lingua, entita_id: { [Op.in]: lista.map((r) => r.id) } },
    raw: true,
  });
  for (const t of traduzioni) {
    const r = lista.find((x) => x.id === t.entita_id);
    if (r && t.campo in r) r[t.campo] = t.testo;
  }
  return Array.isArray(record) ? lista : lista[0];
}

/** Tutte le traduzioni di un record: { en: { nome, descrizione }, de: {...} }. */
async function traduzioniDi(entita, entitaId) {
  const righe = await Traduzione.findAll({ where: { entita, entita_id: entitaId }, raw: true });
  const esito = {};
  for (const r of righe) (esito[r.lingua] ??= {})[r.campo] = r.testo;
  return esito;
}

/** Salva le traduzioni di un record: { en: { nome: '...' } }. Testo vuoto = elimina. */
async function salvaTraduzioni(entita, entitaId, perLingua) {
  const attive = await impostazioni.leggi('lingue_attive', ['it']);
  const nonAttive = Object.keys(perLingua).filter((l) => l === 'it' || !attive.includes(l));
  if (nonAttive.length) {
    throw richiestaNonValida(
      'LINGUA_NON_ATTIVA',
      `Lingue non attive o non traducibili: ${nonAttive.join(', ')}`,
    );
  }
  await sequelize.transaction(async (transaction) => {
    for (const [lingua, campi] of Object.entries(perLingua)) {
      for (const [campo, testo] of Object.entries(campi)) {
        const chiave = { entita, entita_id: entitaId, campo, lingua };
        if (!testo) await Traduzione.destroy({ where: chiave, transaction });
        else await Traduzione.upsert({ ...chiave, testo }, { transaction });
      }
    }
  });
  return traduzioniDi(entita, entitaId);
}

async function eliminaTraduzioni(entita, entitaId, transaction) {
  await Traduzione.destroy({ where: { entita, entita_id: entitaId }, transaction });
}

// --- media -------------------------------------------------------------------------------

function elencoMedia(entita, entitaId = null) {
  return Media.findAll({
    where: { entita, entita_id: entitaId },
    order: [
      ['ordine', 'ASC'],
      ['id', 'ASC'],
    ],
  });
}

/** Registra un'immagine caricata da multer. */
function aggiungiMedia({ entita, entitaId = null, testoAlternativo = '', ordine = 0 }, caricato) {
  return Media.create({
    entita,
    entita_id: entitaId,
    percorso: file.percorsoRelativo(caricato.path),
    tipo_mime: caricato.mimetype,
    dimensione: caricato.size,
    testo_alternativo: testoAlternativo,
    ordine,
  });
}

async function aggiornaMedia(id, { testo_alternativo, ordine }) {
  const media = oppure404(await Media.findByPk(id), 'MEDIA_NON_TROVATO', 'Immagine non trovata');
  return media.update({ testo_alternativo, ordine });
}

/** Riordina: ids nell'ordine voluto. */
async function riordinaMedia(ids) {
  await sequelize.transaction(async (transaction) => {
    for (const [ordine, id] of ids.entries())
      await Media.update({ ordine }, { where: { id }, transaction });
  });
}

async function eliminaMedia(id) {
  const media = oppure404(await Media.findByPk(id), 'MEDIA_NON_TROVATO', 'Immagine non trovata');
  await media.destroy();
  await file.elimina(media.percorso);
}

/** Elimina tutti i media di un'entità (quando si elimina la camera, il pacchetto...). */
async function eliminaMediaDi(entita, entitaId) {
  const lista = await Media.findAll({ where: { entita, entita_id: entitaId } });
  await Media.destroy({ where: { entita, entita_id: entitaId } });
  await Promise.all(lista.map((m) => file.elimina(m.percorso)));
}

// --- FAQ -----------------------------------------------------------------------------------

const faq = crud(Faq, {
  codice: 'FAQ_NON_TROVATA',
  messaggio: 'FAQ non trovata',
  ordine: [
    ['categoria', 'ASC'],
    ['ordine', 'ASC'],
    ['id', 'ASC'],
  ],
});

async function faqPubbliche(lingua) {
  const righe = await Faq.findAll({
    where: { pubblicata: true },
    order: [
      ['categoria', 'ASC'],
      ['ordine', 'ASC'],
    ],
  });
  return traduci('faq', righe, lingua);
}

// --- documenti legali ----------------------------------------------------------------------

const documentiLegali = crud(DocumentoLegale, {
  codice: 'DOCUMENTO_LEGALE_NON_TROVATO',
  messaggio: 'Documento legale non trovato',
  ordine: [
    ['tipo', 'ASC'],
    ['lingua', 'ASC'],
    ['creato_il', 'DESC'],
  ],
});

/** Versione pubblicata più recente, nella lingua richiesta o in italiano. */
async function documentoLegaleVigente(tipo, lingua = 'it') {
  const cerca = (l) =>
    DocumentoLegale.findOne({
      where: { tipo, lingua: l, pubblicato_il: { [Op.ne]: null, [Op.lte]: new Date() } },
      order: [['pubblicato_il', 'DESC']],
    });
  return oppure404(
    (await cerca(lingua)) ?? (await cerca('it')),
    'DOCUMENTO_LEGALE_NON_TROVATO',
    'Documento non ancora pubblicato',
  );
}

async function pubblicaDocumentoLegale(id) {
  const doc = await documentiLegali.dettaglio(id);
  if (doc.pubblicato_il)
    throw richiestaNonValida(
      'GIA_PUBBLICATO',
      'Documento già pubblicato: creane una nuova versione',
    );
  return doc.update({ pubblicato_il: new Date() });
}

// --- eventi speciali --------------------------------------------------------------------------

const eventiSpeciali = crud(EventoSpeciale, {
  codice: 'EVENTO_NON_TROVATO',
  messaggio: 'Evento non trovato',
  ordine: [['data_inizio', 'ASC']],
});

function eventiNelPeriodo(dal, al) {
  return EventoSpeciale.findAll({
    where: { data_inizio: { [Op.lte]: al }, data_fine: { [Op.gte]: dal } },
    order: [['data_inizio', 'ASC']],
  });
}

module.exports = {
  traduci,
  traduzioniDi,
  salvaTraduzioni,
  eliminaTraduzioni,
  elencoMedia,
  aggiungiMedia,
  aggiornaMedia,
  riordinaMedia,
  eliminaMedia,
  eliminaMediaDi,
  faq,
  faqPubbliche,
  documentiLegali,
  documentoLegaleVigente,
  pubblicaDocumentoLegale,
  eventiSpeciali,
  eventiNelPeriodo,
};
