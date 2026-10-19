// src/repositories/impostazioni.repository.js

const { Impostazione } = require('../models');

// ─────────────────────────────────────
// Tutte le impostazioni (valori ancora come testo)
// ─────────────────────────────────────
const trovaTutte = async () => {
  return await Impostazione.findAll({ order: [['chiave', 'ASC']], raw: true });
};

// ─────────────────────────────────────
// Aggiorna il valore di una chiave esistente
// ─────────────────────────────────────
const aggiornaValore = async (chiave, valore, utenteId, transaction = null) => {
  return await Impostazione.update(
    { valore, aggiornato_da: utenteId ?? null },
    { where: { chiave }, transaction },
  );
};

module.exports = {
  trovaTutte,
  aggiornaValore,
};
