// src/repositories/utenti.repository.js
//
// Account (clienti e staff), ruoli e anagrafica collegata all'account.
// Punti e livello fedeltà sono in fedelta.repository.

const { Op } = require('sequelize');
const {
  Utente,
  Ruolo,
  Ospite,
  DocumentoOspite,
  FedeltaUtente,
  LivelloFedelta,
} = require('../models');
const { RUOLI } = require('../constants/ruoli.constants');

// ─────────────────────────────────────
// Lettura
// ─────────────────────────────────────

const trovaUtentePerId = async (id, transaction = null) => {
  return await Utente.findByPk(id, { transaction });
};

const trovaUtentePerUuid = async (uuid) => {
  return await Utente.findOne({ where: { uuid } });
};

const trovaUtentePerEmail = async (email) => {
  return await Utente.findOne({ where: { email } });
};

// Conta anche gli account eliminati: l'email resta occupata (indice unico).
const esisteEmail = async (email) => {
  const trovato = await Utente.findOne({ where: { email }, attributes: ['id'], paranoid: false });
  return Boolean(trovato);
};

// Con l'hash della password: solo per il login e il cambio password.
const trovaUtentePerAutenticazione = async (where) => {
  return await Utente.scope('autenticazione').findOne({ where });
};

// Pagina personale: anagrafica con documenti e, per i clienti, livello fedeltà.
const trovaProfilo = async (id) => {
  return await Utente.findByPk(id, {
    include: [
      {
        model: Ospite,
        as: 'anagrafica',
        include: [{ model: DocumentoOspite, as: 'documenti' }],
      },
      {
        model: FedeltaUtente,
        as: 'fedelta',
        include: [{ model: LivelloFedelta, as: 'dettagli_livello' }],
      },
    ],
  });
};

// Scheda per l'admin: anagrafica e ruolo.
const trovaDettaglioUtente = async (id) => {
  return await Utente.findByPk(id, {
    include: [
      { model: Ospite, as: 'anagrafica' },
      { model: Ruolo, as: 'dettagli_ruolo' },
    ],
  });
};

const trovaUtenti = async (filtri, { limit, offset }) => {
  const where = {};
  if (filtri.ruolo) {
    where.ruolo = filtri.ruolo;
  }
  if (filtri.attivo !== undefined) {
    where.attivo = filtri.attivo === true || filtri.attivo === 'true';
  }
  if (filtri.cerca) {
    const testo = `%${filtri.cerca}%`;
    where[Op.or] = [
      { nome: { [Op.like]: testo } },
      { cognome: { [Op.like]: testo } },
      { email: { [Op.like]: testo } },
    ];
  }
  return await Utente.findAndCountAll({
    where,
    include: [{ model: Ruolo, as: 'dettagli_ruolo', attributes: ['codice', 'nome'] }],
    order: [
      ['cognome', 'ASC'],
      ['nome', 'ASC'],
    ],
    limit,
    offset,
  });
};

// Staff attivo con uno dei ruoli indicati (assegnazioni, gruppi di squadra).
const trovaStaffAttivo = async (ruoli) => {
  return await Utente.findAll({
    where: { ruolo: { [Op.in]: ruoli }, attivo: true },
    attributes: ['id', 'nome', 'cognome', 'ruolo'],
    order: [
      ['cognome', 'ASC'],
      ['nome', 'ASC'],
    ],
  });
};

const contaAdminAttivi = async () => {
  return await Utente.count({ where: { ruolo: RUOLI.ADMIN, attivo: true } });
};

// ─────────────────────────────────────
// Scrittura
// ─────────────────────────────────────

const creaUtente = async (dati, transaction = null) => {
  return await Utente.create(dati, { transaction });
};

const aggiornaUtente = async (id, dati, transaction = null) => {
  const utente = await Utente.findByPk(id, { transaction });
  if (!utente) {
    return null;
  }
  return await utente.update(dati, { transaction });
};

const eliminaUtente = async (id, transaction = null) => {
  return await Utente.destroy({ where: { id }, transaction });
};

// ─────────────────────────────────────
// Ruoli
// ─────────────────────────────────────

const trovaRuoli = async () => {
  return await Ruolo.findAll({ order: [['codice', 'ASC']] });
};

// ─────────────────────────────────────
// Documenti del cliente
// ─────────────────────────────────────

// Documento solo se appartiene all'anagrafica indicata.
const trovaDocumentoDiOspite = async (ospiteId, documentoId) => {
  return await DocumentoOspite.findOne({ where: { id: documentoId, ospite_id: ospiteId } });
};

module.exports = {
  trovaUtentePerId,
  trovaUtentePerEmail,
  esisteEmail,
  trovaUtentePerAutenticazione,
  trovaProfilo,
  trovaUtentePerUuid,
  trovaDettaglioUtente,
  trovaUtenti,
  trovaStaffAttivo,
  contaAdminAttivi,
  creaUtente,
  aggiornaUtente,
  eliminaUtente,
  trovaRuoli,
  trovaDocumentoDiOspite,
};
