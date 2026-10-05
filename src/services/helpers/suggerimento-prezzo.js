// src/services/helpers/suggerimento-prezzo.js
//
// Suggerimento di prezzo per un giorno, a regole semplici e spiegate:
// l'admin vede la percentuale e i motivi, e decide lui se applicarla.
// Ogni motivo ha un codice e un valore (soglia o titolo dell'evento) per
// tradurlo nel gestionale; motivo è la stessa frase in italiano.
// ponytail: regole fisse; se servono soglie diverse per struttura si
// spostano nelle impostazioni.

// Occupazione già venduta per quel giorno: vale solo la prima che scatta.
const REGOLE_OCCUPAZIONE = [
  { codice: 'occupazione_alta', da: 90, percentuale: 15, motivo: 'domanda forte' },
  { codice: 'occupazione_buona', da: 75, percentuale: 8, motivo: 'buona domanda' },
];
const OCCUPAZIONE_BASSA = { codice: 'occupazione_bassa', fino: 30, percentuale: -10 };
// Occupazione bassa a ridosso della data: si prova a riempire.
const ULTIMO_MINUTO = { codice: 'ultimo_minuto', giorni: 7, percentuale: -5 };
// Impatto dell'evento (1-10) → +2% per punto.
const PERCENTUALE_PER_PUNTO_EVENTO = 2;
const LIMITE = 30;

/**
 * giorno: { occupazione_percentuale, giorni_mancanti, eventi: [{ titolo, impatto }] }
 * → { percentuale, motivi: [{ codice, valore, percentuale, motivo }] },
 * percentuale tra -30 e +30.
 */
function suggerimentoPrezzo(giorno) {
  const motivi = [];
  const occupazione = Number(giorno.occupazione_percentuale);

  const alta = REGOLE_OCCUPAZIONE.find((regola) => occupazione >= regola.da);
  if (alta) {
    motivi.push({
      codice: alta.codice,
      valore: alta.da,
      percentuale: alta.percentuale,
      motivo: `Occupazione oltre il ${alta.da}%: ${alta.motivo}`,
    });
  } else if (occupazione <= OCCUPAZIONE_BASSA.fino) {
    motivi.push({
      codice: OCCUPAZIONE_BASSA.codice,
      valore: OCCUPAZIONE_BASSA.fino,
      percentuale: OCCUPAZIONE_BASSA.percentuale,
      motivo: `Occupazione sotto il ${OCCUPAZIONE_BASSA.fino}%`,
    });
    if (giorno.giorni_mancanti < ULTIMO_MINUTO.giorni) {
      motivi.push({
        codice: ULTIMO_MINUTO.codice,
        valore: ULTIMO_MINUTO.giorni,
        percentuale: ULTIMO_MINUTO.percentuale,
        motivo: `Mancano meno di ${ULTIMO_MINUTO.giorni} giorni`,
      });
    }
  }

  const eventoPiuForte = [...(giorno.eventi ?? [])].sort((a, b) => b.impatto - a.impatto)[0];
  if (eventoPiuForte) {
    motivi.push({
      codice: 'evento',
      valore: eventoPiuForte.titolo,
      percentuale: eventoPiuForte.impatto * PERCENTUALE_PER_PUNTO_EVENTO,
      motivo: `Evento: ${eventoPiuForte.titolo}`,
    });
  }

  const somma = motivi.reduce((totale, voce) => totale + voce.percentuale, 0);
  return { percentuale: Math.max(-LIMITE, Math.min(LIMITE, somma)), motivi };
}

module.exports = { suggerimentoPrezzo };
