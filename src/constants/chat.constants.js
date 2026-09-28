// Chat di assistenza e chat interna dello staff.

// assistenza: cliente o visitatore ↔ struttura; staff: chat interna
const TIPI_CONVERSAZIONE = Object.freeze(['assistenza', 'staff']);

const STATI_CONVERSAZIONE = Object.freeze(['aperta', 'chiusa']);

// Stato di presenza mostrato agli altri membri dello staff.
const STATI_PRESENZA = Object.freeze(['online', 'occupato', 'assente', 'offline']);

// Nomi dei gruppi di squadra creati in automatico (vedi SQUADRE in ruoli.constants).
const GRUPPI_SQUADRA = Object.freeze({
  receptionist: '#receptionist',
  housekeeping: '#housekeeping',
});

const TESTO_MAX = 4000;
const ALLEGATI_MAX = 5;

module.exports = {
  TIPI_CONVERSAZIONE,
  STATI_CONVERSAZIONE,
  STATI_PRESENZA,
  GRUPPI_SQUADRA,
  TESTO_MAX,
  ALLEGATI_MAX,
};
