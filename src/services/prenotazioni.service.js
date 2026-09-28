// Ciclo di vita della prenotazione:
//   in_attesa → confermata → in_soggiorno → conclusa
//            ↘ cancellata      ↘ no_show
// Disponibilità, capienza, codice sconto, pulizie e punti fedeltà li
// controllano i trigger del DB; qui prezzo, penali, permessi e notifiche.

const { Op } = require('sequelize');
const {
  Prenotazione,
  PrenotazioneOspite,
  PrenotazioneServizio,
  Camera,
  TipologiaCamera,
  Ospite,
  Servizio,
  Pagamento,
  PianoTariffario,
  CodiceSconto,
  Pacchetto,
  Utente,
  transazione,
} = require('../models');
const config = require('../config/env');
const logger = require('../config/logger');
const { oppure404, conflitto, vietato, richiestaNonValida } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { centesimi, euro, percentualeDi, formatoEuro } = require('../utils/denaro');
const { oggi, aggiungiOre, istanteLocale } = require('../utils/date');
const { hash, tokenCasuale } = require('../utils/sicurezza');
const { seleziona } = require('./sql');
const impostazioni = require('./impostazioni.service');
const tariffe = require('./tariffe.service');
const disponibilita = require('./disponibilita.service');
const ospitiSvc = require('./ospiti.service');
const email = require('./email.service');

const STATI_ATTIVI = ['in_attesa', 'confermata', 'in_soggiorno'];
const NASCOSTI_AL_CLIENTE = [
  'note_interne',
  'token_checkin',
  'token_checkin_scade_il',
  'creato_da',
];

const includeCamera = {
  model: Camera,
  as: 'camera',
  attributes: ['id', 'numero', 'nome', 'tipologia_id'],
  include: [{ model: TipologiaCamera, as: 'tipologia', attributes: ['id', 'nome', 'slug'] }],
};
const includeTitolare = {
  model: Ospite,
  as: 'titolare',
  attributes: ['id', 'nome', 'cognome', 'email', 'telefono', 'lingua'],
};
const includeCompleto = [
  includeCamera,
  includeTitolare,
  {
    model: Ospite,
    as: 'ospiti',
    through: { attributes: ['tipo_alloggiato', 'esente_tassa', 'motivo_esenzione'] },
  },
  {
    model: Servizio,
    as: 'servizi',
    attributes: ['id', 'nome', 'icona'],
    through: { attributes: ['quantita', 'prezzo_unitario', 'calcolo_prezzo', 'totale'] },
  },
  { model: Pagamento, as: 'pagamenti', attributes: { exclude: ['link_pagamento'] } },
  { model: PianoTariffario, as: 'piano_tariffario', attributes: ['id', 'nome'] },
  { model: CodiceSconto, as: 'codice_sconto', attributes: ['id', 'codice'] },
  { model: Pacchetto, as: 'pacchetto', attributes: ['id', 'nome'] },
];

const staffDa = (contesto) => Boolean(contesto?.ruolo && contesto.ruolo !== 'cliente');

async function trova(id, transaction, blocca = false) {
  return oppure404(
    await Prenotazione.findByPk(id, {
      transaction,
      ...(blocca && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    }),
    'PRENOTAZIONE_NON_TROVATA',
    'Prenotazione non trovata',
  );
}

function richiediStato(p, ammessi, azione) {
  if (!ammessi.includes(p.stato)) {
    throw conflitto(
      'STATO_NON_VALIDO',
      `Non puoi ${azione} una prenotazione in stato "${p.stato.replace('_', ' ')}"`,
    );
  }
}

/** Dovuto, incassato, rimborsato e saldo (vista v_saldo_prenotazioni). */
async function saldo(id, transaction) {
  const [riga] = await seleziona(
    'SELECT * FROM v_saldo_prenotazioni WHERE prenotazione_id = ?',
    [id],
    transaction,
  );
  return riga;
}

// --- lettura ------------------------------------------------------------------------------

async function dettaglio(id) {
  const p = oppure404(
    await Prenotazione.findByPk(id, { include: includeCompleto }),
    'PRENOTAZIONE_NON_TROVATA',
    'Prenotazione non trovata',
  );
  return { ...p.toJSON(), saldo: await saldo(id) };
}

/** Versione per il cliente: senza note interne e token. */
async function perCliente(where) {
  const p = oppure404(
    await Prenotazione.findOne({
      where,
      include: includeCompleto,
      attributes: { exclude: NASCOSTI_AL_CLIENTE },
    }),
    'PRENOTAZIONE_NON_TROVATA',
    'Prenotazione non trovata',
  );
  return { ...p.toJSON(), saldo: await saldo(p.id) };
}

const mia = (utenteId, id) => perCliente({ id, utente_id: utenteId });

/** Chi ha prenotato senza account ritrova la prenotazione con codice + email. */
async function perCodice(codice, emailTitolare) {
  const p = await Prenotazione.findOne({
    where: { codice: String(codice).trim().toUpperCase() },
    include: [includeTitolare],
    attributes: ['id'],
  });
  if (!p || p.titolare?.email?.toLowerCase() !== String(emailTitolare).trim().toLowerCase()) {
    throw richiestaNonValida(
      'PRENOTAZIONE_NON_TROVATA',
      'Nessuna prenotazione con questo codice e questa email',
    );
  }
  return perCliente({ id: p.id });
}

async function elenco(query) {
  const p = pagina(query);
  const where = {};
  if (query.stato) where.stato = String(query.stato).split(',');
  if (query.canale) where.canale = query.canale;
  if (query.camera_id) where.camera_id = query.camera_id;
  // soggiorni che toccano l'intervallo [dal, al]
  if (query.dal) where.data_partenza = { [Op.gt]: query.dal };
  if (query.al) where.data_arrivo = { [Op.lte]: query.al };
  if (query.cerca) {
    const testo = `%${query.cerca}%`;
    where[Op.or] = [
      { codice: { [Op.like]: testo } },
      { '$titolare.cognome$': { [Op.like]: testo } },
      { '$titolare.email$': { [Op.like]: testo } },
    ];
  }
  const righe = await Prenotazione.findAndCountAll({
    where,
    include: [includeCamera, includeTitolare],
    order: [
      ['data_arrivo', query.ordine === 'desc' ? 'DESC' : 'ASC'],
      ['id', 'ASC'],
    ],
    limit: p.limit,
    offset: p.offset,
    distinct: true,
  });
  return risultato(righe, p);
}

/** Cruscotto reception: arrivi, partenze e ospiti in casa di un giorno. */
async function giornata(giorno = oggi()) {
  const opzioni = { include: [includeCamera, includeTitolare], order: [['camera_id', 'ASC']] };
  const [arrivi, partenze, inCasa] = await Promise.all([
    Prenotazione.findAll({
      ...opzioni,
      where: { data_arrivo: giorno, stato: ['in_attesa', 'confermata'] },
    }),
    Prenotazione.findAll({ ...opzioni, where: { data_partenza: giorno, stato: 'in_soggiorno' } }),
    Prenotazione.findAll({ ...opzioni, where: { stato: 'in_soggiorno' } }),
  ]);
  return { giorno, arrivi, partenze, in_casa: inCasa };
}

// --- notifiche ------------------------------------------------------------------------------

const dataIt = (iso) => iso.split('-').reverse().join('/');

/** Email al titolare. Non blocca mai l'operazione. */
async function notifica(id, modello, extra = {}) {
  try {
    const p = await Prenotazione.findByPk(id, { include: [includeTitolare] });
    if (!p?.titolare?.email) return;
    const orari = await impostazioni.leggiMolte(['orario_checkin', 'orario_checkout']);
    await email.invia({
      a: p.titolare.email,
      modello,
      lingua: p.titolare.lingua,
      dati: {
        nome: p.titolare.nome,
        codice: p.codice,
        arrivo: dataIt(p.data_arrivo),
        partenza: dataIt(p.data_partenza),
        totale: formatoEuro(p.totale),
        acconto: formatoEuro(p.acconto_richiesto),
        penale: p.penale_applicata ? formatoEuro(p.penale_applicata) : null,
        checkin: orari.orario_checkin,
        checkout: orari.orario_checkout,
        ...extra,
      },
    });
  } catch (err) {
    logger.warn('Notifica prenotazione non inviata', {
      prenotazione: id,
      modello,
      errore: err.message,
    });
  }
}

// --- creazione ----------------------------------------------------------------------------

/** Anagrafica del titolare: quella dell'account se c'è, altrimenti i dati inviati. */
async function titolare(utenteId, datiOspite, t) {
  if (utenteId) {
    const u = oppure404(
      await Utente.findByPk(utenteId, { transaction: t }),
      'UTENTE_NON_TROVATO',
      'Utente non trovato',
    );
    if (u.ospite_id) return u.ospite_id;
    const nuova = await Ospite.create(
      {
        nome: u.nome,
        cognome: u.cognome,
        email: u.email,
        telefono: u.telefono,
        lingua: u.lingua,
        utente_id: u.id,
      },
      { transaction: t },
    );
    await u.update({ ospite_id: nuova.id }, { transaction: t });
    return nuova.id;
  }
  if (!datiOspite?.nome || !datiOspite?.cognome) {
    throw richiestaNonValida('TITOLARE_MANCANTE', 'Indica nome e cognome di chi prenota');
  }
  return (await ospitiSvc.trovaOCrea(datiOspite, t)).id;
}

async function righeServizi(prenotazioneId, servizi, t) {
  if (!servizi.length) return;
  await PrenotazioneServizio.bulkCreate(
    servizi.map((s) => ({
      prenotazione_id: prenotazioneId,
      servizio_id: s.servizio_id,
      quantita: s.quantita,
      prezzo_unitario: s.prezzo_unitario,
      calcolo_prezzo: s.calcolo_prezzo,
      totale: s.totale,
    })),
    { transaction: t },
  );
}

const importiDa = (prev) => ({
  importo_soggiorno: prev.importo_soggiorno,
  sconto_promozione: prev.sconto_promozione,
  sconto_codice: prev.sconto_codice,
  percentuale_fedelta: prev.percentuale_fedelta,
  sconto_fedelta: prev.sconto_fedelta,
  importo_pacchetto: prev.importo_pacchetto,
  tassa_soggiorno: prev.tassa_soggiorno,
  acconto_richiesto: prev.acconto_richiesto,
  promozione_id: prev.promozione?.id ?? null,
  dettaglio_prezzo: {
    notti: prev.notti,
    promozione: prev.promozione,
    codice_sconto: prev.codice_sconto,
    pacchetto: prev.pacchetto,
  },
});

/**
 * Nuova prenotazione.
 *  - online (cliente o visitatore): la camera è quella bloccata con `sessione`;
 *    resta in_attesa fino al pagamento dell'acconto (o confermata subito se
 *    il piano non chiede acconto)
 *  - staff (telefono, email, walk-in): `camera_id` esplicita, può nascere confermata
 * @param {object} dati  { sessione | camera_id, arrivo, partenza, adulti, bambini, eta_bambini,
 *   piano_id, codice_sconto, pacchetto_id, servizi, titolare, richieste_speciali, ora_arrivo_prevista,
 *   (staff) utente_id, canale, id_esterno, stato, note_interne }
 * @param {{ utenteId?: number, ruolo?: string, ip?: string }} contesto
 */
async function crea(dati, contesto) {
  const staff = staffDa(contesto);
  const clienteId = staff ? (dati.utente_id ?? null) : (contesto?.utenteId ?? null);
  const scadenzaOre = await impostazioni.leggi('prenotazioni_scadenza_ore', 24);

  const id = await transazione(contesto, async (t) => {
    let cameraId = dati.camera_id;
    if (!staff || !cameraId) {
      const blocco = await disponibilita.bloccoDi(dati.sessione, t);
      if (blocco.data_arrivo !== dati.arrivo || blocco.data_partenza !== dati.partenza) {
        throw richiestaNonValida(
          'BLOCCO_DIVERSO',
          'Le date non corrispondono alla camera riservata: ripeti la ricerca',
        );
      }
      cameraId = blocco.camera_id;
    }
    const camera = oppure404(
      await Camera.findByPk(cameraId, { transaction: t, lock: t.LOCK.UPDATE }),
      'CAMERA_NON_TROVATA',
      'Camera non trovata',
    );

    const prev = await tariffe.preventivo({
      tipologiaId: camera.tipologia_id,
      arrivo: dati.arrivo,
      partenza: dati.partenza,
      adulti: dati.adulti,
      bambini: dati.bambini ?? 0,
      etaBambini: dati.eta_bambini,
      pianoId: dati.piano_id,
      codiceSconto: dati.codice_sconto,
      pacchettoId: dati.pacchetto_id,
      servizi: dati.servizi,
      utenteId: clienteId,
    });

    const senzaAcconto = prev.acconto_richiesto === 0;
    const stato =
      (staff && dati.stato === 'confermata') || (!staff && senzaAcconto)
        ? 'confermata'
        : 'in_attesa';

    const p = await Prenotazione.create(
      {
        ospite_id: await titolare(clienteId, dati.titolare, t),
        utente_id: clienteId,
        camera_id: camera.id,
        piano_tariffario_id: prev.piano?.id ?? null,
        codice_sconto_id: prev.codice_sconto?.id ?? null,
        pacchetto_id: prev.pacchetto?.id ?? null,
        data_arrivo: dati.arrivo,
        data_partenza: dati.partenza,
        adulti: dati.adulti,
        bambini: dati.bambini ?? 0,
        stato,
        canale: staff ? (dati.canale ?? 'telefono') : 'diretto',
        id_esterno: staff ? (dati.id_esterno ?? null) : null,
        valuta: await impostazioni.leggi('valuta', 'EUR'),
        ...importiDa(prev),
        rimborsabile: prev.piano?.rimborsabile ?? true,
        ore_cancellazione_gratuita: prev.piano?.ore_cancellazione_gratuita ?? 48,
        penale_percentuale: prev.piano?.penale_percentuale ?? 0,
        richieste_speciali: dati.richieste_speciali ?? null,
        note_interne: staff ? (dati.note_interne ?? null) : null,
        ora_arrivo_prevista: dati.ora_arrivo_prevista ?? null,
        scade_il: stato === 'in_attesa' && !staff ? aggiungiOre(new Date(), scadenzaOre) : null,
        creato_da: contesto?.utenteId ?? null,
      },
      { transaction: t },
    );
    await righeServizi(p.id, prev.servizi, t);
    await PrenotazioneOspite.create(
      {
        prenotazione_id: p.id,
        ospite_id: p.ospite_id,
        tipo_alloggiato:
          dati.adulti + (dati.bambini ?? 0) === 1 ? 'ospite_singolo' : 'capofamiglia',
      },
      { transaction: t },
    );
    if (dati.sessione) await disponibilita.rilascia(dati.sessione, t);
    return p.id;
  });

  const p = await dettaglio(id);
  if (p.stato === 'confermata') await notificaConferma(id);
  else {
    await notifica(id, 'prenotazione_ricevuta', {
      scadenza: p.scade_il
        ? p.scade_il.toLocaleString('it-IT', {
            timeZone: await impostazioni.leggi('fuso_orario', 'Europe/Rome'),
          })
        : null,
      link: `${config.urlFrontend}/prenotazioni/${p.codice}`,
    });
  }
  return p;
}

// --- check-in online ------------------------------------------------------------------------

/** Nuovo link di check-in online, valido fino alla partenza. */
async function generaTokenCheckin(id, transaction) {
  const token = tokenCasuale(32);
  const p = await trova(id, transaction);
  await p.update(
    {
      token_checkin: hash(token),
      token_checkin_scade_il: new Date(`${p.data_partenza}T23:59:59Z`),
    },
    { transaction },
  );
  return token;
}

async function notificaConferma(id) {
  const token = await generaTokenCheckin(id);
  await notifica(id, 'prenotazione_confermata', {
    link: `${config.urlFrontend}/checkin-online?token=${token}`,
  });
}

async function daToken(token) {
  const p = await Prenotazione.findOne({ where: { token_checkin: hash(token ?? '') } });
  if (
    !p ||
    p.token_checkin_scade_il < new Date() ||
    !['confermata', 'in_soggiorno'].includes(p.stato)
  ) {
    throw richiestaNonValida(
      'LINK_CHECKIN_NON_VALIDO',
      'Il link per il check-in online non è valido o è scaduto',
    );
  }
  return p;
}

/** Riepilogo per la pagina di check-in online. */
async function datiCheckinOnline(token) {
  const p = await daToken(token);
  const { codice, data_arrivo, data_partenza, adulti, bambini, checkin_online_il } = p;
  return {
    codice,
    data_arrivo,
    data_partenza,
    adulti,
    bambini,
    checkin_online_il,
    ospiti: await ospitiSvc.diPrenotazione(p.id),
  };
}

async function checkinOnline(token, elencoOspiti, ip) {
  const p = await daToken(token);
  await ospitiSvc.impostaDiPrenotazione(p.id, elencoOspiti, { utenteId: p.utente_id, ip });
  await p.update({ checkin_online_il: new Date() });
  return datiCheckinOnline(token);
}

// --- cambi di stato ---------------------------------------------------------------------------

async function conferma(id, contesto) {
  await transazione(contesto, async (t) => {
    const p = await trova(id, t, true);
    richiediStato(p, ['in_attesa'], 'confermare');
    await p.update({ stato: 'confermata', scade_il: null }, { transaction: t });
  });
  await notificaConferma(id);
  return dettaglio(id);
}

/**
 * Penale se si cancella ora. La tassa di soggiorno non è mai dovuta.
 * @returns {Promise<{ penale: number, gratuita_fino_al: Date|null }>}
 */
async function calcolaPenale(p, adesso = new Date()) {
  const base = centesimi(p.totale) - centesimi(p.tassa_soggiorno);
  if (p.stato === 'in_attesa') return { penale: 0, gratuita_fino_al: null };
  if (!p.rimborsabile) return { penale: euro(base), gratuita_fino_al: null };
  const { orario_checkin: ora, fuso_orario: fuso } = await impostazioni.leggiMolte([
    'orario_checkin',
    'fuso_orario',
  ]);
  const limite = aggiungiOre(
    istanteLocale(p.data_arrivo, ora ?? '15:00', fuso ?? 'Europe/Rome'),
    -p.ore_cancellazione_gratuita,
  );
  return {
    penale: adesso < limite ? 0 : euro(percentualeDi(base, p.penale_percentuale)),
    gratuita_fino_al: limite,
  };
}

function controllaProprietario(p, contesto) {
  if (!staffDa(contesto) && p.utente_id !== contesto?.utenteId) {
    throw vietato('PRENOTAZIONE_ALTRUI', 'Questa prenotazione non è tua');
  }
}

/** Cosa succede se si cancella adesso (per la conferma nel frontend). */
async function anteprimaCancellazione(id, contesto) {
  const p = await trova(id);
  controllaProprietario(p, contesto);
  richiediStato(p, ['in_attesa', 'confermata'], 'cancellare');
  return { ...(await calcolaPenale(p)), incassato: (await saldo(id)).incassato };
}

/**
 * Cancellazione. Lo staff può indicare una penale diversa da quella del piano.
 * L'eventuale rimborso (incassato − penale) si registra poi dai pagamenti.
 */
async function cancella(id, { motivo, penale } = {}, contesto) {
  await transazione(contesto, async (t) => {
    const p = await trova(id, t, true);
    controllaProprietario(p, contesto);
    richiediStato(p, ['in_attesa', 'confermata'], 'cancellare');
    const dovuta = staffDa(contesto) && penale != null ? penale : (await calcolaPenale(p)).penale;
    await p.update(
      {
        stato: 'cancellata',
        motivo_cancellazione: motivo ?? null,
        penale_applicata: dovuta,
        token_checkin: null,
      },
      { transaction: t },
    );
  });
  await notifica(id, 'prenotazione_cancellata');
  return dettaglio(id);
}

async function checkIn(id, contesto) {
  await transazione(contesto, async (t) => {
    const p = await trova(id, t, true);
    richiediStato(p, ['confermata'], 'registrare l’arrivo di');
    if (p.data_arrivo > oggi())
      throw conflitto('ARRIVO_FUTURO', `L’arrivo è previsto il ${dataIt(p.data_arrivo)}`);
    await p.update({ stato: 'in_soggiorno' }, { transaction: t });
  });
  return dettaglio(id);
}

/** Partenza. Con saldo aperto serve `forza` (es. pagamento concordato dopo). */
async function checkOut(id, { forza = false } = {}, contesto) {
  await transazione(contesto, async (t) => {
    const p = await trova(id, t, true);
    richiediStato(p, ['in_soggiorno'], 'registrare la partenza di');
    const { saldo: resto } = await saldo(id, t);
    if (resto > 0 && !forza) {
      throw conflitto('SALDO_APERTO', `Restano da incassare ${formatoEuro(resto)}`, {
        saldo: resto,
      });
    }
    await p.update({ stato: 'conclusa', token_checkin: null }, { transaction: t });
  });
  return dettaglio(id);
}

async function noShow(id, contesto) {
  await transazione(contesto, async (t) => {
    const p = await trova(id, t, true);
    richiediStato(p, ['confermata'], 'segnare come mancato arrivo');
    if (p.data_arrivo > oggi())
      throw conflitto('ARRIVO_FUTURO', 'Il giorno di arrivo non è ancora arrivato');
    await p.update({ stato: 'no_show', token_checkin: null }, { transaction: t });
  });
  return dettaglio(id);
}

// --- modifiche (staff) ---------------------------------------------------------------------

const CAMPI_MODIFICABILI = [
  'camera_id',
  'data_arrivo',
  'data_partenza',
  'adulti',
  'bambini',
  'note_interne',
  'richieste_speciali',
  'ora_arrivo_prevista',
];

/**
 * Cambio camera, date o ospiti. Se cambiano notti, ospiti o tipologia il
 * prezzo si ricalcola con piano, codice, pacchetto e fedeltà già applicati.
 */
async function modifica(id, dati, contesto) {
  await transazione(contesto, async (t) => {
    const p = await trova(id, t, true);
    richiediStato(p, STATI_ATTIVI, 'modificare');
    const nuovi = Object.fromEntries(
      CAMPI_MODIFICABILI.filter((c) => dati[c] !== undefined).map((c) => [c, dati[c]]),
    );
    if (p.stato === 'in_soggiorno' && nuovi.data_arrivo && nuovi.data_arrivo !== p.data_arrivo) {
      throw conflitto(
        'SOGGIORNO_INIZIATO',
        'L’ospite è già arrivato: puoi cambiare solo la partenza',
      );
    }
    const prima = {
      tipologia: (await Camera.findByPk(p.camera_id, { transaction: t })).tipologia_id,
    };
    const camera = oppure404(
      await Camera.findByPk(nuovi.camera_id ?? p.camera_id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      }),
      'CAMERA_NON_TROVATA',
      'Camera non trovata',
    );
    const v = { ...p.get({ plain: true }), ...nuovi };
    const riprezza =
      camera.tipologia_id !== prima.tipologia ||
      v.data_arrivo !== p.data_arrivo ||
      v.data_partenza !== p.data_partenza ||
      v.adulti !== p.adulti ||
      v.bambini !== p.bambini;

    if (riprezza) {
      const prev = await tariffe.preventivo({
        tipologiaId: camera.tipologia_id,
        arrivo: v.data_arrivo,
        partenza: v.data_partenza,
        adulti: v.adulti,
        bambini: v.bambini,
        pianoId: p.piano_tariffario_id,
        pacchettoId: p.pacchetto_id,
        esistente: {
          codiceScontoId: p.codice_sconto_id,
          percentualeFedelta: p.percentuale_fedelta,
        },
      });
      Object.assign(nuovi, importiDa(prev));
    }
    await p.update(nuovi, { transaction: t });

    if (riprezza) {
      const notti = (await trova(id, t)).notti;
      for (const s of await PrenotazioneServizio.findAll({
        where: { prenotazione_id: id },
        transaction: t,
      })) {
        const totale = tariffe.totaleServizio(
          { prezzo: s.prezzo_unitario, quantita: s.quantita, calcolo_prezzo: s.calcolo_prezzo },
          notti,
          v.adulti + v.bambini,
        );
        await s.update({ totale: euro(totale) }, { transaction: t });
      }
    }
  });
  return dettaglio(id);
}

// --- servizi extra ------------------------------------------------------------------------------

/** Aggiunge (o cambia la quantità di) un extra. Il cliente solo sulle proprie, prima dell'arrivo. */
async function aggiungiServizio(id, { servizio_id: servizioId, quantita = 1 }, contesto) {
  await transazione(contesto, async (t) => {
    const p = await trova(id, t, true);
    controllaProprietario(p, contesto);
    richiediStato(
      p,
      staffDa(contesto) ? STATI_ATTIVI : ['in_attesa', 'confermata'],
      'aggiungere servizi a',
    );
    const s = oppure404(
      await Servizio.findOne({
        where: { id: servizioId, tipo: 'extra', attivo: true },
        transaction: t,
      }),
      'SERVIZIO_NON_TROVATO',
      'Servizio non disponibile',
    );
    const totale = tariffe.totaleServizio(
      { ...s.get({ plain: true }), quantita },
      p.notti,
      p.adulti + p.bambini,
    );
    await PrenotazioneServizio.upsert(
      {
        prenotazione_id: p.id,
        servizio_id: s.id,
        quantita,
        prezzo_unitario: s.prezzo,
        calcolo_prezzo: s.calcolo_prezzo,
        totale: euro(totale),
      },
      { transaction: t },
    );
  });
  return dettaglio(id);
}

async function rimuoviServizio(id, servizioId, contesto) {
  await transazione(contesto, async (t) => {
    const p = await trova(id, t, true);
    controllaProprietario(p, contesto);
    richiediStato(
      p,
      staffDa(contesto) ? STATI_ATTIVI : ['in_attesa', 'confermata'],
      'togliere servizi da',
    );
    await PrenotazioneServizio.destroy({
      where: { prenotazione_id: id, servizio_id: servizioId },
      transaction: t,
    });
  });
  return dettaglio(id);
}

// --- job ------------------------------------------------------------------------------------------

/** Cancella le prenotazioni online non pagate entro la scadenza. */
async function scadiInAttesa() {
  const [scadute] = await transazione({ utenteId: null, ip: 'job' }, (t) =>
    Prenotazione.update(
      { stato: 'cancellata', motivo_cancellazione: 'Scaduta senza pagamento' },
      { where: { stato: 'in_attesa', scade_il: { [Op.lt]: new Date() } }, transaction: t },
    ),
  );
  if (scadute) logger.info('Prenotazioni scadute cancellate', { numero: scadute });
  return scadute;
}

module.exports = {
  STATI_ATTIVI,
  dettaglio,
  mia,
  perCodice,
  elenco,
  giornata,
  saldo,
  crea,
  conferma,
  anteprimaCancellazione,
  calcolaPenale,
  cancella,
  checkIn,
  checkOut,
  noShow,
  modifica,
  aggiungiServizio,
  rimuoviServizio,
  generaTokenCheckin,
  datiCheckinOnline,
  checkinOnline,
  notifica,
  scadiInAttesa,
};
