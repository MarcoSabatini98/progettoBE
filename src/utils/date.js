// Date di soggiorno come stringhe 'YYYY-MM-DD' (DATEONLY): niente fusi orari
// nei calcoli delle notti. Le operazioni passano da UTC per non subire l'ora legale.

const GIORNO_MS = 86_400_000;

const aData = (iso) => new Date(`${iso}T00:00:00Z`);
const aIso = (data) => data.toISOString().slice(0, 10);

/** Data di oggi (UTC) in formato 'YYYY-MM-DD'. */
const oggi = () => aIso(new Date());

const aggiungiGiorni = (iso, giorni) => aIso(new Date(aData(iso).getTime() + giorni * GIORNO_MS));

/** Notti tra arrivo e partenza (la partenza non è una notte). */
const contaNotti = (arrivo, partenza) => Math.round((aData(partenza) - aData(arrivo)) / GIORNO_MS);

/** Elenco delle notti del soggiorno: ['2026-08-01', '2026-08-02', ...]. */
function notti(arrivo, partenza) {
  const n = contaNotti(arrivo, partenza);
  return Array.from({ length: Math.max(n, 0) }, (_, i) => aggiungiGiorni(arrivo, i));
}

/** Bit del giorno della settimana come in periodi_tariffari: 1=lun … 64=dom. */
const bitGiorno = (iso) => 1 << ((aData(iso).getUTCDay() + 6) % 7);

/** true se [a1, a2) e [b1, b2) si sovrappongono. */
const sovrapposti = (a1, a2, b1, b2) => a1 < b2 && a2 > b1;

/** Età compiuta a una certa data. */
function eta(nascita, alGiorno) {
  const [an, mn, gn] = nascita.split('-').map(Number);
  const [a, m, g] = alGiorno.split('-').map(Number);
  return a - an - (m < mn || (m === mn && g < gn) ? 1 : 0);
}

/** '2026-07-14' → '14/07/2026' (stringa vuota se manca). */
const dataItaliana = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

const aggiungiOre = (data, ore) => new Date(data.getTime() + ore * 3_600_000);
const aggiungiMinuti = (data, minuti) => new Date(data.getTime() + minuti * 60_000);

/**
 * Istante UTC di un orario locale della struttura: ('2026-08-01', '15:00',
 * 'Europe/Rome') → Date. Serve per le scadenze di cancellazione.
 * ponytail: nell'ora del cambio d'ora legale può sbagliare di 60 minuti.
 */
function istanteLocale(data, ora, fuso) {
  const comeUtc = new Date(`${data}T${ora.slice(0, 5)}:00Z`);
  const inFuso = new Date(comeUtc.toLocaleString('en-US', { timeZone: fuso }));
  const inUtc = new Date(comeUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(comeUtc.getTime() - (inFuso - inUtc));
}

module.exports = {
  oggi,
  aggiungiGiorni,
  contaNotti,
  notti,
  bitGiorno,
  sovrapposti,
  eta,
  aggiungiOre,
  aggiungiMinuti,
  istanteLocale,
  dataItaliana,
};
