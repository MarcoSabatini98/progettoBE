// Paginazione uniforme per tutti gli elenchi: ?pagina=1&perPagina=20.

const PER_PAGINA_MAX = 100;

function pagina(query = {}) {
  const numero = Math.max(1, Number.parseInt(query.pagina, 10) || 1);
  const perPagina = Math.min(
    PER_PAGINA_MAX,
    Math.max(1, Number.parseInt(query.perPagina, 10) || 20),
  );
  return { limit: perPagina, offset: (numero - 1) * perPagina, numero, perPagina };
}

/** Da findAndCountAll a { elementi, totale, pagina, perPagina, pagine }. */
const risultato = ({ count, rows }, p) => ({
  elementi: rows,
  totale: count,
  pagina: p.numero,
  perPagina: p.perPagina,
  pagine: Math.ceil(count / p.perPagina),
});

module.exports = { pagina, risultato };
