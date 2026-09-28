// Statistiche per l'admin (permesso analytics.leggi). I conti li fa il DB:
// procedura sp_report_occupazione e viste; qui solo i riepiloghi.
//   ADR    = ricavo camere / notti vendute
//   RevPAR = ricavo camere / notti disponibili

const { richiestaNonValida } = require('../utils/errori');
const { centesimi, euro } = require('../utils/denaro');
const { oggi, aggiungiGiorni, contaNotti } = require('../utils/date');
const { seleziona, chiama } = require('./sql');

const MAX_GIORNI = 731;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Intervallo [dal, al) con default ultimi 30 giorni. */
function periodo({ dal, al } = {}) {
  const fine = al ?? aggiungiGiorni(oggi(), 1);
  const inizio = dal ?? aggiungiGiorni(fine, -30);
  if (!ISO.test(inizio) || !ISO.test(fine) || fine <= inizio)
    throw richiestaNonValida('INTERVALLO_DATE_NON_VALIDO', 'Intervallo di date non valido');
  if (contaNotti(inizio, fine) > MAX_GIORNI)
    throw richiestaNonValida('INTERVALLO_TROPPO_LUNGO', 'Al massimo due anni per volta');
  return { dal: inizio, al: fine };
}

/** Giorno per giorno + riepilogo del periodo. */
async function occupazione(query) {
  const { dal, al } = periodo(query);
  const giorni = await chiama('CALL sp_report_occupazione(?, ?)', [dal, al]);
  const somma = (campo) => giorni.reduce((s, g) => s + Number(g[campo]), 0);
  const disponibili = somma('camere_disponibili');
  const vendute = somma('camere_occupate');
  const ricavo = giorni.reduce((s, g) => s + centesimi(g.ricavo_camere), 0);
  return {
    dal,
    al,
    riepilogo: {
      notti_disponibili: disponibili,
      notti_vendute: vendute,
      occupazione_percentuale: disponibili ? Math.round((vendute * 10000) / disponibili) / 100 : 0,
      ricavo_camere: euro(ricavo),
      adr: vendute ? euro(Math.round(ricavo / vendute)) : 0,
      revpar: disponibili ? euro(Math.round(ricavo / disponibili)) : 0,
    },
    giorni,
  };
}

/** Prenotazioni per canale create nel periodo: volume, valore, cancellazioni, anticipo. */
function canali(query) {
  const { dal, al } = periodo(query);
  return seleziona(
    `SELECT canale,
            COUNT(*)                                          AS prenotazioni,
            SUM(stato = 'cancellata')                         AS cancellate,
            SUM(stato = 'no_show')                            AS no_show,
            SUM(IF(stato IN ('cancellata','no_show'), 0, notti))  AS notti,
            SUM(IF(stato IN ('cancellata','no_show'), 0, totale)) AS valore,
            ROUND(AVG(notti), 1)                              AS durata_media,
            ROUND(AVG(DATEDIFF(data_arrivo, DATE(creato_il))), 1) AS anticipo_medio_giorni
       FROM prenotazioni
      WHERE creato_il >= ? AND creato_il < ?
      GROUP BY canale
      ORDER BY valore DESC`,
    [dal, al],
  );
}

/** Incassi netti per mese e metodo (cassa, rimborsi sottratti). */
function incassi({ anno } = {}) {
  const a = Number(anno) || Number(oggi().slice(0, 4));
  return seleziona('SELECT * FROM v_incassi_mensili WHERE mese LIKE ? ORDER BY mese, metodo', [
    `${a}-%`,
  ]);
}

/** Riepilogo per la dichiarazione dell'imposta di soggiorno. */
function tassaSoggiorno({ anno } = {}) {
  const a = Number(anno) || Number(oggi().slice(0, 4));
  return seleziona('SELECT * FROM v_tassa_soggiorno_mensile WHERE mese LIKE ? ORDER BY mese', [
    `${a}-%`,
  ]);
}

/** Tipologie più vendute nel periodo di soggiorno. */
function tipologie(query) {
  const { dal, al } = periodo(query);
  return seleziona(
    `SELECT t.id, t.nome, COUNT(p.id) AS prenotazioni, COALESCE(SUM(p.notti), 0) AS notti,
            COALESCE(SUM(p.totale), 0) AS valore
       FROM tipologie_camera t
       LEFT JOIN camere c ON c.tipologia_id = t.id
       LEFT JOIN prenotazioni p ON p.camera_id = c.id
            AND p.stato IN ('confermata','in_soggiorno','conclusa')
            AND p.data_arrivo < ? AND p.data_partenza > ?
      GROUP BY t.id, t.nome
      ORDER BY valore DESC`,
    [al, dal],
  );
}

/** Numeri di oggi per la home dell'admin. */
async function cruscotto() {
  const giorno = oggi();
  const mese = `${giorno.slice(0, 7)}-01`;
  const [riga] = await seleziona(
    `SELECT
       (SELECT COUNT(*) FROM prenotazioni WHERE stato = 'confermata' AND data_arrivo = ?)      AS arrivi_oggi,
       (SELECT COUNT(*) FROM prenotazioni WHERE stato = 'in_soggiorno' AND data_partenza = ?)  AS partenze_oggi,
       (SELECT COUNT(*) FROM prenotazioni WHERE stato = 'in_soggiorno')                        AS in_casa,
       (SELECT COUNT(*) FROM camere WHERE eliminato_il IS NULL AND stato <> 'fuori_servizio')  AS camere,
       (SELECT COUNT(*) FROM prenotazioni WHERE stato = 'in_attesa')                           AS da_confermare,
       (SELECT COUNT(*) FROM segnalazioni_manutenzione WHERE stato IN ('aperta','in_corso'))  AS manutenzioni_aperte,
       (SELECT COUNT(*) FROM recensioni WHERE stato = 'in_attesa')                             AS recensioni_da_moderare,
       (SELECT COALESCE(SUM(IF(tipo = 'rimborso', -importo, importo)), 0) FROM pagamenti
         WHERE stato = 'completato' AND pagato_il >= ?)                                        AS incassato_mese,
       (SELECT COALESCE(SUM(totale), 0) FROM prenotazioni
         WHERE stato IN ('confermata','in_soggiorno','conclusa') AND data_arrivo >= ?)         AS prenotato_da_inizio_mese`,
    [giorno, giorno, mese, mese],
  );
  const camere = Number(riga.camere);
  return {
    ...riga,
    occupazione_oggi: camere ? Math.round((Number(riga.in_casa) * 10000) / camere) / 100 : 0,
  };
}

module.exports = { occupazione, canali, incassi, tassaSoggiorno, tipologie, cruscotto };
