// src/repositories/pagamenti.repository.js
//
// Pagamenti e rimborsi delle prenotazioni, eventi webhook dei provider.
// Le scritture sui pagamenti vanno dentro transazione(): tabella sotto audit.

const { Op } = require('sequelize');
const { Pagamento, Prenotazione, Utente, EventoWebhook } = require('../models');
const { aggiungiOre } = require('../utils/date');
const { METODI_ONLINE } = require('../constants/pagamenti.constants');

// ─────────────────────────────────────
// Lettura
// ─────────────────────────────────────

const trovaPagamentoPerId = async (id, transaction = null) => {
  return await Pagamento.findByPk(id, { transaction });
};

// Con lock: il webhook e il ritorno dal checkout possono arrivare insieme.
const bloccaPagamentoPerUuid = async (uuid, transaction) => {
  return await Pagamento.findOne({ where: { uuid }, transaction, lock: transaction.LOCK.UPDATE });
};

const trovaPagamentoPaypal = async (idOrdine) => {
  return await Pagamento.findOne({ where: { riferimento: idOrdine, metodo: 'paypal' } });
};

const trovaPagamentiDiPrenotazione = async (prenotazioneId) => {
  return await Pagamento.findAll({
    where: { prenotazione_id: prenotazioneId },
    include: [{ model: Utente, as: 'operatore', attributes: ['id', 'nome', 'cognome'] }],
    order: [['creato_il', 'ASC']],
  });
};

const trovaPagamenti = async (filtri, { limit, offset }) => {
  const where = {};
  if (filtri.stato) {
    where.stato = String(filtri.stato).split(',');
  }
  if (filtri.metodo) {
    where.metodo = String(filtri.metodo).split(',');
  }
  if (filtri.tipo) {
    where.tipo = String(filtri.tipo).split(',');
  }
  if (filtri.dal || filtri.al) {
    where.creato_il = {};
    if (filtri.dal) {
      where.creato_il[Op.gte] = filtri.dal;
    }
    if (filtri.al) {
      where.creato_il[Op.lt] = filtri.al;
    }
  }

  return await Pagamento.findAndCountAll({
    where,
    include: [{ model: Prenotazione, as: 'prenotazione', attributes: ['id', 'codice'] }],
    order: [['creato_il', 'DESC']],
    limit,
    offset,
  });
};

// I rimborsi puntano all'incasso originale con riferimento = id dell'incasso.
const sommaRimborsiDi = async (pagamentoId) => {
  const totale = await Pagamento.sum('importo', {
    where: { tipo: 'rimborso', stato: 'completato', riferimento: String(pagamentoId) },
  });
  return totale ?? 0;
};

// ─────────────────────────────────────
// Scrittura
// ─────────────────────────────────────

const creaPagamento = async (dati, transaction) => {
  return await Pagamento.create(dati, { transaction });
};

const aggiornaPagamento = async (id, dati, transaction) => {
  return await Pagamento.update(dati, { where: { id }, transaction });
};

// Chiude un pagamento online solo se è ancora in attesa (webhook ripetuti).
const chiudiPagamentoInAttesa = async (uuid, dati, transaction) => {
  return await Pagamento.update(dati, { where: { uuid, stato: 'in_attesa' }, transaction });
};

// All'emissione della fattura: gli incassi senza scontrino prendono il suo numero.
const assegnaDocumentoFiscale = async (prenotazioneId, documento, transaction) => {
  return await Pagamento.update(
    { documento_fiscale: documento },
    {
      where: {
        prenotazione_id: prenotazioneId,
        documento_fiscale: null,
        stato: 'completato',
        tipo: { [Op.ne]: 'rimborso' },
      },
      transaction,
    },
  );
};

// Checkout online aperti da più di 24 ore: l'utente non li ha conclusi.
const annullaCheckoutAbbandonati = async (transaction) => {
  const ieri = aggiungiOre(new Date(), -24);
  const [numero] = await Pagamento.update(
    { stato: 'annullato', note: 'Checkout non completato' },
    {
      where: { stato: 'in_attesa', metodo: METODI_ONLINE, creato_il: { [Op.lt]: ieri } },
      transaction,
    },
  );
  return numero;
};

// ─────────────────────────────────────
// Eventi webhook (idempotenza)
// ─────────────────────────────────────

// Restituisce false se l'evento era già arrivato.
const registraEventoWebhook = async (provider, idEvento, tipo, payload) => {
  const [, creato] = await EventoWebhook.findOrCreate({
    where: { provider, id_evento: idEvento },
    defaults: { tipo, payload },
  });
  return creato;
};

const aggiornaEventoWebhook = async (provider, idEvento, dati) => {
  return await EventoWebhook.update(dati, { where: { provider, id_evento: idEvento } });
};

module.exports = {
  trovaPagamentoPerId,
  bloccaPagamentoPerUuid,
  trovaPagamentoPaypal,
  trovaPagamentiDiPrenotazione,
  trovaPagamenti,
  sommaRimborsiDi,
  creaPagamento,
  aggiornaPagamento,
  chiudiPagamentoInAttesa,
  assegnaDocumentoFiscale,
  annullaCheckoutAbbandonati,
  registraEventoWebhook,
  aggiornaEventoWebhook,
};
