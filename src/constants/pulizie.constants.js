// Pulizie e manutenzione.

const TIPI_PULIZIA = Object.freeze(['partenza', 'riassetto', 'profonda', 'ispezione']);

const PRIORITA = Object.freeze(['bassa', 'normale', 'alta', 'urgente']);

// da_fare → in_corso → completata → verificata (dal responsabile)
const STATI_ATTIVITA_PULIZIA = Object.freeze(['da_fare', 'in_corso', 'completata', 'verificata']);

// Passaggi di stato ammessi. true = solo chi gestisce le pulizie
// (verifica e ispezione respinta), false = anche l'addetto.
const TRANSIZIONI_PULIZIA = Object.freeze({
  da_fare: Object.freeze({ in_corso: false }),
  in_corso: Object.freeze({ completata: false, da_fare: false }),
  completata: Object.freeze({ verificata: true, in_corso: true }),
  verificata: Object.freeze({}),
});

const STATI_SEGNALAZIONE = Object.freeze(['aperta', 'in_corso', 'risolta', 'annullata']);

const STATI_SEGNALAZIONE_APERTA = Object.freeze(['aperta', 'in_corso']);

module.exports = {
  TIPI_PULIZIA,
  PRIORITA,
  STATI_ATTIVITA_PULIZIA,
  TRANSIZIONI_PULIZIA,
  STATI_SEGNALAZIONE,
  STATI_SEGNALAZIONE_APERTA,
};
