// src/validators/comune.validator.js
//
// Regole usate da più validators: id, date, orari, lingua, importi,
// paginazione ed elenchi separati da virgola nei filtri.

const Joi = require('joi');

// Colonne INT UNSIGNED.
const ID_MAX = 4_294_967_295;

const id = Joi.number().integer().positive().max(ID_MAX);

/** Solo :id nel percorso. Le rotte con altri parametri hanno uno schema proprio. */
const schemaIdParam = Joi.object({ id: id.required() });

/**
 * Data AAAA-MM-GG. Resta testo: i service confrontano le date come stringhe
 * e Joi.date() le trasformerebbe in Date con l'ora e il fuso.
 */
const data = Joi.string().custom((valore, helpers) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valore)) {
    return helpers.error('date.format');
  }
  // 2026-02-31 per JavaScript è il 3 marzo: la data deve restare uguale
  const giorno = new Date(`${valore}T00:00:00Z`);
  if (Number.isNaN(giorno.getTime()) || !giorno.toISOString().startsWith(valore)) {
    return helpers.error('date.base');
  }
  return valore;
});

/** Orario HH:MM o HH:MM:SS (colonne TIME). */
const ora = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/);

/** Token casuale dei link (base64url): reset password, check-in online, feed iCal. */
const token = Joi.string()
  .pattern(/^[\w-]+$/)
  .max(200);

/** Codice lingua ISO di due lettere (it, en, de...). */
const lingua = Joi.string().trim().lowercase().length(2);

/** Importo in euro, due decimali (DECIMAL(10,2)). */
const importo = Joi.number().precision(2).min(0).max(99_999_999.99);

/** Percentuale 0..100 con due decimali. */
const percentuale = Joi.number().precision(2).min(0).max(100);

const paginazione = {
  pagina: Joi.number().integer().min(1),
  perPagina: Joi.number().integer().min(1).max(100),
};

/**
 * Filtro con più valori separati da virgola (es. ?stato=confermata,in_soggiorno):
 * ogni valore deve essere tra quelli ammessi. Resta testo, lo divide il repository.
 */
function elencoDi(valori) {
  return Joi.string().custom((valore, helpers) => {
    const scelti = valore.split(',');
    if (!scelti.every((scelto) => valori.includes(scelto))) {
      return helpers.error('any.only', { valids: valori });
    }
    return valore;
  });
}

module.exports = {
  id,
  schemaIdParam,
  data,
  ora,
  token,
  lingua,
  importo,
  percentuale,
  paginazione,
  elencoDi,
};
