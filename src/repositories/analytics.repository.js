// src/repositories/analytics.repository.js
//
// Dati per statistiche e report. Occupazione e ricavi giornalieri li calcola
// la procedura sp_report_occupazione; incassi e tassa di soggiorno le viste.

const { Op } = require('sequelize');
const {
  sequelize,
  Prenotazione,
  Camera,
  TipologiaCamera,
  Pagamento,
  SegnalazioneManutenzione,
  Recensione,
  IncassoMensile,
  TassaSoggiornoMensile,
} = require('../models');
const { STATI_FATTURABILI } = require('../constants/prenotazioni.constants');
const { STATI_SEGNALAZIONE_APERTA } = require('../constants/pulizie.constants');

// ─────────────────────────────────────
// Procedura e viste
// ─────────────────────────────────────

/**
 * Giorno per giorno in [dal, al): { giorno, camere_disponibili, camere_occupate,
 * occupazione_percentuale, ricavo_camere, prezzo_medio }.
 */
const trovaOccupazioneGiornaliera = async (dal, al) => {
  return await sequelize.query('CALL sp_report_occupazione(?, ?)', { replacements: [dal, al] });
};

// Incassi netti per mese ('2026-07') e metodo.
const trovaIncassiMensili = async (anno) => {
  return await IncassoMensile.findAll({
    where: { mese: { [Op.startsWith]: `${anno}-` } },
    order: [
      ['mese', 'ASC'],
      ['metodo', 'ASC'],
    ],
  });
};

const trovaTassaSoggiornoMensile = async (anno) => {
  return await TassaSoggiornoMensile.findAll({
    where: { mese: { [Op.startsWith]: `${anno}-` } },
    order: [['mese', 'ASC']],
  });
};

// ─────────────────────────────────────
// Prenotazioni del periodo
// ─────────────────────────────────────

// Prenotazioni create nel periodo, di ogni stato (statistiche per canale).
const trovaPrenotazioniCreate = async (dal, al) => {
  return await Prenotazione.findAll({
    where: { creato_il: { [Op.gte]: dal, [Op.lt]: al } },
    attributes: ['canale', 'stato', 'notti', 'totale', 'data_arrivo', 'creato_il'],
  });
};

// Soggiorni venduti con arrivo nel periodo, con camera e tipologia (ricavi).
const trovaSoggiorniArrivati = async (dal, al) => {
  return await Prenotazione.findAll({
    where: {
      stato: { [Op.in]: STATI_FATTURABILI },
      data_arrivo: { [Op.gte]: dal, [Op.lt]: al },
    },
    attributes: ['id', 'notti', 'totale', 'importo_soggiorno'],
    include: [
      {
        model: Camera,
        as: 'camera',
        attributes: ['id', 'numero', 'nome'],
        paranoid: false,
        include: [
          { model: TipologiaCamera, as: 'tipologia', attributes: ['id', 'nome'], paranoid: false },
        ],
      },
    ],
  });
};

// ─────────────────────────────────────
// Cruscotto
// ─────────────────────────────────────

const contaPrenotazioni = async (where) => {
  return await Prenotazione.count({ where });
};

const contaCamereVendibili = async () => {
  return await Camera.count({ where: { stato: { [Op.ne]: 'fuori_servizio' } } });
};

const contaManutenzioniAperte = async () => {
  return await SegnalazioneManutenzione.count({
    where: { stato: { [Op.in]: STATI_SEGNALAZIONE_APERTA } },
  });
};

const contaRecensioniDaModerare = async () => {
  return await Recensione.count({ where: { stato: 'in_attesa' } });
};

// Incassato dal giorno indicato, rimborsi sottratti (in euro).
const sommaIncassatoDal = async (dal) => {
  const where = { stato: 'completato', pagato_il: { [Op.gte]: dal } };
  const entrate = await Pagamento.sum('importo', {
    where: { ...where, tipo: { [Op.ne]: 'rimborso' } },
  });
  const rimborsi = await Pagamento.sum('importo', { where: { ...where, tipo: 'rimborso' } });
  return (entrate ?? 0) - (rimborsi ?? 0);
};

// Valore delle prenotazioni vendute con arrivo dal giorno indicato (in euro).
const sommaPrenotatoDal = async (dal) => {
  const totale = await Prenotazione.sum('totale', {
    where: { stato: { [Op.in]: STATI_FATTURABILI }, data_arrivo: { [Op.gte]: dal } },
  });
  return totale ?? 0;
};

module.exports = {
  trovaOccupazioneGiornaliera,
  trovaIncassiMensili,
  trovaTassaSoggiornoMensile,
  trovaPrenotazioniCreate,
  trovaSoggiorniArrivati,
  contaPrenotazioni,
  contaCamereVendibili,
  contaManutenzioniAperte,
  contaRecensioniDaModerare,
  sommaIncassatoDal,
  sommaPrenotatoDal,
};
