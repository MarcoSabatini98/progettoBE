// Tariffe, sconti e programma fedeltà.

// Variazione del piano tariffario rispetto al prezzo del giorno.
const TIPI_VARIAZIONE_PIANO = Object.freeze(['percentuale', 'importo']);

// Variazione di un periodo (stagione): prezzo_fisso sostituisce il prezzo base.
const TIPI_VARIAZIONE_PERIODO = Object.freeze(['percentuale', 'importo', 'prezzo_fisso']);

const TIPI_SCONTO = Object.freeze(['percentuale', 'importo']);

const MOTIVI_PUNTI = Object.freeze(['soggiorno', 'bonus', 'rettifica', 'annullamento']);

// Giorni prima della fine della tassa di soggiorno in cui si avvisa, se non ne segue un'altra.
const GIORNI_AVVISO_TASSA = Object.freeze([30, 7, 1]);

module.exports = {
  TIPI_VARIAZIONE_PIANO,
  TIPI_VARIAZIONE_PERIODO,
  TIPI_SCONTO,
  MOTIVI_PUNTI,
  GIORNI_AVVISO_TASSA,
};
