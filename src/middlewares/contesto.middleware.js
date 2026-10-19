// src/middlewares/contesto.middleware.js
//
// req.contesto accompagna la richiesta fino ai service: chi sta operando
// (utente o visitatore della chat) e da dove. Qui si crea vuoto per tutte
// le richieste; lo completano i middleware di autenticazione.
//
// I service lo usano per i controlli di proprietà, per i trigger di audit
// (utenteId, ip) e per i dati del client salvati con sessioni e consensi.

function preparaContesto(req, res, next) {
  req.contesto = {
    utenteId: null,
    ruolo: null,
    visitatoreId: null,
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
  return next();
}

module.exports = { preparaContesto };
