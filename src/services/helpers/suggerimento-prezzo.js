// src/services/helpers/suggerimento-prezzo.js
//
// Suggerimento di prezzo per un giorno, a regole semplici e spiegate:
// l'admin vede la percentuale e i motivi, e decide lui se applicarla.
// ponytail: regole fisse; se servono soglie diverse per struttura si
// spostano nelle impostazioni.

// Occupazione già venduta per quel giorno: vale solo la prima che scatta.
const REGOLE_OCCUPAZIONE = [
  { da: 90, percentuale: 15, motivo: 'Occupazione oltre il 90%: domanda forte' },
  { da: 75, percentuale: 8, motivo: 'Occupazione oltre il 75%: buona domanda' },
];
const OCCUPAZIONE_BASSA = { fino: 30, percentuale: -10, motivo: 'Occupazione sotto il 30%' };
// Occupazione bassa a ridosso della data: si prova a riempire.
const ULTIMO_MINUTO = { giorni: 7, percentuale: -5, motivo: 'Mancano meno di 7 giorni' };
// Impatto dell'evento (1-10) → +2% per punto.
const PERCENTUALE_PER_PUNTO_EVENTO = 2;
const LIMITE = 30;

/**
 * giorno: { occupazione_percentuale, giorni_mancanti, eventi: [{ titolo, impatto }] }
 * → { percentuale, motivi: [{ percentuale, motivo }] }, percentuale tra -30 e +30.
 */
function suggerimentoPrezzo(giorno) {
  const motivi = [];
  const occupazione = Number(giorno.occupazione_percentuale);

  const alta = REGOLE_OCCUPAZIONE.find((regola) => occupazione >= regola.da);
  if (alta) {
    motivi.push({ percentuale: alta.percentuale, motivo: alta.motivo });
  } else if (occupazione <= OCCUPAZIONE_BASSA.fino) {
    motivi.push({ percentuale: OCCUPAZIONE_BASSA.percentuale, motivo: OCCUPAZIONE_BASSA.motivo });
    if (giorno.giorni_mancanti < ULTIMO_MINUTO.giorni) {
      motivi.push({ percentuale: ULTIMO_MINUTO.percentuale, motivo: ULTIMO_MINUTO.motivo });
    }
  }

  const eventoPiuForte = [...(giorno.eventi ?? [])].sort((a, b) => b.impatto - a.impatto)[0];
  if (eventoPiuForte) {
    motivi.push({
      percentuale: eventoPiuForte.impatto * PERCENTUALE_PER_PUNTO_EVENTO,
      motivo: `Evento: ${eventoPiuForte.titolo}`,
    });
  }

  const somma = motivi.reduce((totale, voce) => totale + voce.percentuale, 0);
  return { percentuale: Math.max(-LIMITE, Math.min(LIMITE, somma)), motivi };
}

module.exports = { suggerimentoPrezzo };
