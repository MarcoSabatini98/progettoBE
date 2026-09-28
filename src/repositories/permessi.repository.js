// src/repositories/permessi.repository.js
//
// Ruoli, catalogo dei permessi, permessi assegnati a ogni ruolo e regole
// della chat interna (quali ruoli possono scriversi).

const { Ruolo, Permesso, RuoloPermesso, RegolaChat } = require('../models');

// ─────────────────────────────────────
// Ruoli e permessi
// ─────────────────────────────────────

const trovaRuoloPerCodice = async (codice) => {
  return await Ruolo.findByPk(codice);
};

// Ruoli con i permessi assegnati: la matrice per l'admin.
const trovaRuoliConPermessi = async () => {
  return await Ruolo.findAll({
    include: [
      {
        model: Permesso,
        as: 'permessi',
        attributes: ['codice'],
        through: { attributes: [] },
      },
    ],
    order: [
      ['staff', 'DESC'],
      ['codice', 'ASC'],
    ],
  });
};

const trovaRuoliStaff = async () => {
  return await Ruolo.findAll({ where: { staff: true }, attributes: ['codice'] });
};

const trovaPermessi = async () => {
  return await Permesso.findAll({
    order: [
      ['modulo', 'ASC'],
      ['codice', 'ASC'],
    ],
  });
};

const trovaAssegnazioni = async () => {
  return await RuoloPermesso.findAll();
};

// Sostituisce tutti i permessi di un ruolo.
const sostituisciPermessiRuolo = async (ruolo, codici, transaction) => {
  await RuoloPermesso.destroy({ where: { ruolo }, transaction });
  const righe = codici.map((permesso) => ({ ruolo, permesso }));
  return await RuoloPermesso.bulkCreate(righe, { transaction });
};

// ─────────────────────────────────────
// Regole della chat interna
// ─────────────────────────────────────

const trovaRegoleChat = async () => {
  return await RegolaChat.findAll({
    order: [
      ['ruolo_a', 'ASC'],
      ['ruolo_b', 'ASC'],
    ],
  });
};

// La coppia arriva già ordinata (ruolo_a <= ruolo_b).
const trovaRegolaChat = async (ruoloA, ruoloB) => {
  return await RegolaChat.findOne({ where: { ruolo_a: ruoloA, ruolo_b: ruoloB } });
};

const sostituisciRegoleChat = async (coppie, transaction) => {
  await RegolaChat.destroy({ where: {}, transaction });
  const righe = coppie.map(([ruoloA, ruoloB]) => ({ ruolo_a: ruoloA, ruolo_b: ruoloB }));
  return await RegolaChat.bulkCreate(righe, { transaction });
};

module.exports = {
  trovaRuoloPerCodice,
  trovaRuoliConPermessi,
  trovaRuoliStaff,
  trovaPermessi,
  trovaAssegnazioni,
  sostituisciPermessiRuolo,
  trovaRegoleChat,
  trovaRegolaChat,
  sostituisciRegoleChat,
};
