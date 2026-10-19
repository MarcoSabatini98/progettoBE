// src/repositories/recensioni.repository.js
//
// Recensioni dei soggiorni e medie dei voti (VIEW v_valutazioni).

const { Op } = require('sequelize');
const { Recensione, Prenotazione, Ospite, Utente, Valutazioni } = require('../models');

// ─────────────────────────────────────
// Lettura
// ─────────────────────────────────────

const trovaRecensionePerId = async (id) => {
  return await Recensione.findByPk(id, {
    include: [
      { model: Ospite, as: 'ospite', attributes: ['id', 'nome', 'cognome', 'paese'] },
      {
        model: Prenotazione,
        as: 'prenotazione',
        attributes: ['id', 'codice', 'data_arrivo', 'data_partenza'],
      },
      { model: Utente, as: 'moderatore', attributes: ['id', 'nome', 'cognome'] },
    ],
  });
};

const esisteRecensioneDiPrenotazione = async (prenotazioneId) => {
  const trovata = await Recensione.findOne({
    where: { prenotazione_id: prenotazioneId },
    attributes: ['id'],
  });
  return Boolean(trovata);
};

// Sito pubblico: solo le pubblicate.
const trovaPubblicate = async (lingua, { limit, offset }) => {
  const where = { stato: 'pubblicata' };
  if (lingua) {
    where.lingua = lingua;
  }
  return await Recensione.findAndCountAll({
    where,
    include: [{ model: Ospite, as: 'ospite', attributes: ['nome', 'cognome', 'paese'] }],
    order: [['creato_il', 'DESC']],
    limit,
    offset,
  });
};

// Moderazione: filtri per stato e voto massimo (per trovare le negative).
const trovaRecensioni = async (filtri, { limit, offset }) => {
  const where = {};
  if (filtri.stato) {
    where.stato = filtri.stato;
  }
  if (filtri.voto_max) {
    where.voto = { [Op.lte]: Number(filtri.voto_max) };
  }
  return await Recensione.findAndCountAll({
    where,
    include: [
      { model: Ospite, as: 'ospite', attributes: ['id', 'nome', 'cognome'] },
      { model: Prenotazione, as: 'prenotazione', attributes: ['id', 'codice'] },
    ],
    order: [['creato_il', 'DESC']],
    limit,
    offset,
    distinct: true,
  });
};

const trovaValutazioni = async () => {
  return await Valutazioni.findOne();
};

// ─────────────────────────────────────
// Scrittura
// ─────────────────────────────────────

const creaRecensione = async (dati) => {
  return await Recensione.create(dati);
};

const aggiornaRecensione = async (id, dati) => {
  return await Recensione.update(dati, { where: { id } });
};

module.exports = {
  trovaRecensionePerId,
  esisteRecensioneDiPrenotazione,
  trovaPubblicate,
  trovaRecensioni,
  trovaValutazioni,
  creaRecensione,
  aggiornaRecensione,
};
