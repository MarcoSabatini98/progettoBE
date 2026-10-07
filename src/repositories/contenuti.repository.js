// src/repositories/contenuti.repository.js
//
// Contenuti del sito: traduzioni, media, FAQ, pagine e sezioni, documenti legali, eventi speciali.

const { Op } = require('sequelize');
const {
  Traduzione,
  Media,
  Faq,
  Pagina,
  Sezione,
  DocumentoLegale,
  EventoSpeciale,
  Utente,
} = require('../models');

const includeAutore = { model: Utente, as: 'autore', attributes: ['id', 'nome', 'cognome'] };

// ─────────────────────────────────────
// Traduzioni (tabella polimorfica: entita + entita_id)
// ─────────────────────────────────────
const trovaTraduzioni = async (entita, entitaId) => {
  return await Traduzione.findAll({
    where: { entita, entita_id: entitaId },
    order: [
      ['lingua', 'ASC'],
      ['campo', 'ASC'],
    ],
  });
};

const salvaTraduzione = async (chiave, testo, transaction = null) => {
  return await Traduzione.upsert({ ...chiave, testo }, { transaction });
};

const eliminaTraduzione = async (chiave, transaction = null) => {
  return await Traduzione.destroy({ where: chiave, transaction });
};

const eliminaTraduzioniDi = async (entita, entitaId, transaction = null) => {
  return await Traduzione.destroy({ where: { entita, entita_id: entitaId }, transaction });
};

// ─────────────────────────────────────
// Media (immagini di camere, tipologie, servizi, pacchetti, sito)
// ─────────────────────────────────────
const ordineMedia = [
  ['ordine', 'ASC'],
  ['id', 'ASC'],
];

const trovaMedia = async (entita, entitaId = null) => {
  return await Media.findAll({
    where: { entita, entita_id: entitaId },
    order: ordineMedia,
  });
};

const trovaMediaPerId = async (id) => {
  return await Media.findByPk(id);
};

const creaMedia = async (dati) => {
  return await Media.create(dati);
};

const aggiornaMedia = async (id, dati, transaction = null) => {
  const media = await Media.findByPk(id, { transaction });
  if (!media) {
    return null;
  }
  return await media.update(dati, { transaction });
};

const eliminaMedia = async (id) => {
  return await Media.destroy({ where: { id } });
};

const eliminaMediaDi = async (entita, entitaId, transaction = null) => {
  return await Media.destroy({ where: { entita, entita_id: entitaId }, transaction });
};

// ─────────────────────────────────────
// FAQ
// ─────────────────────────────────────
const ordineFaq = [
  ['categoria', 'ASC'],
  ['ordine', 'ASC'],
  ['id', 'ASC'],
];

const trovaFaq = async (filtri = {}) => {
  const where = {};
  if (filtri.categoria) {
    where.categoria = filtri.categoria;
  }
  if (filtri.pubblicata !== undefined) {
    where.pubblicata = filtri.pubblicata;
  }
  return await Faq.findAll({ where, order: ordineFaq });
};

// Per il sito: solo le pubblicate, con la traduzione nella lingua richiesta.
const trovaFaqPubbliche = async (lingua) => {
  return await Faq.findAll({
    where: { pubblicata: true },
    include: [{ model: Traduzione, as: 'traduzioni', where: { lingua }, required: false }],
    order: ordineFaq,
  });
};

const trovaFaqPerId = async (id) => {
  return await Faq.findByPk(id, {
    include: [includeAutore, { model: Traduzione, as: 'traduzioni' }],
  });
};

const creaFaq = async (dati) => {
  return await Faq.create(dati);
};

const aggiornaFaq = async (id, dati) => {
  const faq = await Faq.findByPk(id);
  if (!faq) {
    return null;
  }
  return await faq.update(dati);
};

const eliminaFaq = async (id, transaction = null) => {
  return await Faq.destroy({ where: { id }, transaction });
};

// ─────────────────────────────────────
// Pagine del sito e loro sezioni immagine-testo
// ─────────────────────────────────────
const ordineSezioni = [
  ['ordine', 'ASC'],
  ['id', 'ASC'],
];
// Nuovo a ogni uso: Sequelize scrive nell'include lo scope del primo modello che lo usa,
// e un oggetto condiviso fra pagina e sezione cercherebbe le foto della pagina.
const includeMedia = () => ({ model: Media, as: 'media', separate: true, order: ordineMedia });
const traduzioniIn = (lingua) => ({
  model: Traduzione,
  as: 'traduzioni',
  where: { lingua },
  required: false,
});

// Per il sito: la pagina con le sole sezioni pubblicate, nella lingua richiesta.
const trovaPaginaPubblica = async (chiave, lingua) => {
  return await Pagina.findOne({
    where: { chiave },
    include: [
      includeMedia(),
      traduzioniIn(lingua),
      {
        model: Sezione,
        as: 'sezioni',
        where: { pubblicata: true },
        required: false,
        separate: true,
        order: ordineSezioni,
        include: [includeMedia(), traduzioniIn(lingua)],
      },
    ],
  });
};

// Per il gestionale: tutte le pagine con tutte le sezioni, anche quelle nascoste.
const trovaPagine = async () => {
  return await Pagina.findAll({
    include: [
      includeMedia(),
      {
        model: Sezione,
        as: 'sezioni',
        separate: true,
        order: ordineSezioni,
        include: [includeMedia()],
      },
    ],
    order: [['id', 'ASC']],
  });
};

const trovaPaginaPerId = async (id) => {
  return await Pagina.findByPk(id);
};

const aggiornaPagina = async (id, dati) => {
  const pagina = await Pagina.findByPk(id);
  if (!pagina) {
    return null;
  }
  return await pagina.update(dati);
};

const trovaSezionePerId = async (id) => {
  return await Sezione.findByPk(id, { include: [includeMedia()] });
};

const creaSezione = async (dati) => {
  return await Sezione.create(dati);
};

const aggiornaSezione = async (id, dati) => {
  const sezione = await Sezione.findByPk(id);
  if (!sezione) {
    return null;
  }
  return await sezione.update(dati);
};

const eliminaSezione = async (id) => {
  return await Sezione.destroy({ where: { id } });
};

// ─────────────────────────────────────
// Documenti legali (privacy, termini, cookie) con versioni
// ─────────────────────────────────────
const trovaDocumentiLegali = async (filtri = {}) => {
  const where = {};
  if (filtri.tipo) {
    where.tipo = filtri.tipo;
  }
  if (filtri.lingua) {
    where.lingua = filtri.lingua;
  }
  return await DocumentoLegale.findAll({
    where,
    include: [includeAutore],
    order: [
      ['tipo', 'ASC'],
      ['lingua', 'ASC'],
      ['creato_il', 'DESC'],
    ],
  });
};

const trovaDocumentoLegalePerId = async (id) => {
  return await DocumentoLegale.findByPk(id, { include: [includeAutore] });
};

// Ultima versione già pubblicata di un documento in una lingua.
const trovaDocumentoLegaleVigente = async (tipo, lingua) => {
  return await DocumentoLegale.findOne({
    where: { tipo, lingua, pubblicato_il: { [Op.ne]: null, [Op.lte]: new Date() } },
    order: [['pubblicato_il', 'DESC']],
  });
};

const creaDocumentoLegale = async (dati) => {
  return await DocumentoLegale.create(dati);
};

const aggiornaDocumentoLegale = async (id, dati) => {
  const documento = await DocumentoLegale.findByPk(id);
  if (!documento) {
    return null;
  }
  return await documento.update(dati);
};

const eliminaDocumentoLegale = async (id) => {
  return await DocumentoLegale.destroy({ where: { id } });
};

// ─────────────────────────────────────
// Eventi speciali (festività, fiere...) per prezzi e statistiche
// ─────────────────────────────────────
const trovaEventi = async (filtri = {}) => {
  const where = {};
  if (filtri.tipo) {
    where.tipo = filtri.tipo;
  }
  // eventi che toccano il periodo [dal, al]
  if (filtri.dal) {
    where.data_fine = { [Op.gte]: filtri.dal };
  }
  if (filtri.al) {
    where.data_inizio = { [Op.lte]: filtri.al };
  }
  return await EventoSpeciale.findAll({ where, order: [['data_inizio', 'ASC']] });
};

const trovaEventoPerId = async (id) => {
  return await EventoSpeciale.findByPk(id);
};

const creaEvento = async (dati) => {
  return await EventoSpeciale.create(dati);
};

const aggiornaEvento = async (id, dati) => {
  const evento = await EventoSpeciale.findByPk(id);
  if (!evento) {
    return null;
  }
  return await evento.update(dati);
};

const eliminaEvento = async (id) => {
  return await EventoSpeciale.destroy({ where: { id } });
};

module.exports = {
  trovaTraduzioni,
  salvaTraduzione,
  eliminaTraduzione,
  eliminaTraduzioniDi,
  trovaMedia,
  trovaMediaPerId,
  creaMedia,
  aggiornaMedia,
  eliminaMedia,
  eliminaMediaDi,
  trovaFaq,
  trovaFaqPubbliche,
  trovaFaqPerId,
  creaFaq,
  aggiornaFaq,
  eliminaFaq,
  trovaPaginaPubblica,
  trovaPagine,
  trovaPaginaPerId,
  aggiornaPagina,
  trovaSezionePerId,
  creaSezione,
  aggiornaSezione,
  eliminaSezione,
  trovaDocumentiLegali,
  trovaDocumentoLegalePerId,
  trovaDocumentoLegaleVigente,
  creaDocumentoLegale,
  aggiornaDocumentoLegale,
  eliminaDocumentoLegale,
  trovaEventi,
  trovaEventoPerId,
  creaEvento,
  aggiornaEvento,
  eliminaEvento,
};
