// Tariffe, sconti e programma fedeltà.

// Variazione del piano tariffario rispetto al prezzo del giorno.
const TIPI_VARIAZIONE_PIANO = Object.freeze(['percentuale', 'importo']);

// Variazione di un periodo (stagione): prezzo_fisso sostituisce il prezzo base.
const TIPI_VARIAZIONE_PERIODO = Object.freeze(['percentuale', 'importo', 'prezzo_fisso']);

const TIPI_SCONTO = Object.freeze(['percentuale', 'importo']);

const MOTIVI_PUNTI = Object.freeze(['soggiorno', 'bonus', 'rettifica', 'annullamento']);

// Livelli fedeltà in ordine crescente (tabella livelli_fedelta).
const LIVELLI_FEDELTA = Object.freeze(['bronze', 'silver', 'gold', 'platinum', 'diamond']);

module.exports = {
  TIPI_VARIAZIONE_PIANO,
  TIPI_VARIAZIONE_PERIODO,
  TIPI_SCONTO,
  MOTIVI_PUNTI,
  LIVELLI_FEDELTA,
};
