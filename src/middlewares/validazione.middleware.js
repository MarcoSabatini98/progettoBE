// src/middlewares/validazione.middleware.js
//
// Valida params, query e body con gli schemi Joi dei validators e sostituisce
// i valori con quelli convertiti (numeri, date, booleani, default) e ripuliti
// dai campi non previsti. Gli errori di tutte le parti arrivano insieme:
//
//   { codice: 'DATI_NON_VALIDI', dettagli: [{ campo: 'email', messaggio: '...' }] }
//
// Uso: router.post('/', valida({ body: schemaCrea }), controller.crea)
// Con i file (multipart) va dopo multer, che è quello che riempie req.body.

const messaggi = require('../config/messaggi-joi');
const { richiestaNonValida } = require('../utils/errori');

const PARTI = ['params', 'query', 'body'];

const OPZIONI = {
  abortEarly: false,
  stripUnknown: true,
  messages: messaggi,
  errors: { wrap: { label: false } },
};

function valida(schemi) {
  return (req, res, next) => {
    const dettagli = [];

    for (const parte of PARTI) {
      const schema = schemi[parte];
      if (!schema) {
        continue;
      }

      const { value, error } = schema.validate(req[parte] ?? {}, OPZIONI);
      if (error) {
        for (const dettaglio of error.details) {
          dettagli.push({ campo: dettaglio.path.join('.'), messaggio: dettaglio.message });
        }
        continue;
      }

      // Express 5: req.query è un getter, non si può riassegnare direttamente.
      if (parte === 'query') {
        Object.defineProperty(req, 'query', { value, writable: true, configurable: true });
      } else {
        req[parte] = value;
      }
    }

    if (dettagli.length > 0) {
      throw richiestaNonValida('DATI_NON_VALIDI', 'Alcuni dati non sono validi', dettagli);
    }
    return next();
  };
}

module.exports = { valida };
