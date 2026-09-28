// Incassi e rimborsi di una prenotazione.
//  - in struttura (contanti, POS, bonifico ricevuto, OTA): li registra lo staff
//    con il riferimento al documento fiscale; il DB applica il limite contanti
//  - online (Stripe, PayPal): pagamento 'in_attesa' + checkout del provider,
//    completato dal webhook (idempotente su eventi_webhook) o dalla cattura PayPal
// Quando l'incassato copre l'acconto, la prenotazione in attesa si conferma.

const { Op } = require('sequelize');
const Stripe = require('stripe');
const { Pagamento, Prenotazione, EventoWebhook, transazione } = require('../models');
const config = require('../config/env');
const logger = require('../config/logger');
const {
  oppure404,
  conflitto,
  richiestaNonValida,
  nonElaborabile,
  servizioNonDisponibile,
} = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { centesimi, euro, formatoEuro } = require('../utils/denaro');
const { aggiungiMinuti } = require('../utils/date');
const impostazioni = require('./impostazioni.service');
const prenotazioni = require('./prenotazioni.service');

const METODI_STRUTTURA = ['contanti', 'pos', 'bonifico', 'ota'];
const METODI_ONLINE = ['stripe', 'paypal'];
const SISTEMA = { utenteId: null, ip: 'webhook' };

const stripe = config.stripe.attivo ? new Stripe(config.stripe.chiaveSegreta) : null;

function richiediStripe() {
  if (!stripe)
    throw servizioNonDisponibile('STRIPE_NON_CONFIGURATO', 'I pagamenti con carta non sono attivi');
  return stripe;
}

async function trova(id, transaction) {
  return oppure404(
    await Pagamento.findByPk(id, { transaction }),
    'PAGAMENTO_NON_TROVATO',
    'Pagamento non trovato',
  );
}

async function prenotazioneDi(id, transaction) {
  return oppure404(
    await Prenotazione.findByPk(id, {
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    }),
    'PRENOTAZIONE_NON_TROVATA',
    'Prenotazione non trovata',
  );
}

// --- lettura ---------------------------------------------------------------------------------

const diPrenotazione = (prenotazioneId) =>
  Pagamento.findAll({ where: { prenotazione_id: prenotazioneId }, order: [['creato_il', 'ASC']] });

async function elenco(query) {
  const p = pagina(query);
  const where = {};
  for (const campo of ['stato', 'metodo', 'tipo'])
    if (query[campo]) where[campo] = String(query[campo]).split(',');
  if (query.dal || query.al) {
    where.creato_il = {
      ...(query.dal && { [Op.gte]: query.dal }),
      ...(query.al && { [Op.lt]: query.al }),
    };
  }
  return risultato(
    await Pagamento.findAndCountAll({
      where,
      include: [{ model: Prenotazione, as: 'prenotazione', attributes: ['id', 'codice'] }],
      order: [['creato_il', 'DESC']],
      limit: p.limit,
      offset: p.offset,
    }),
    p,
  );
}

/** Cosa resta da pagare e come (per la pagina di pagamento del cliente). */
async function riepilogo(prenotazioneId) {
  const p = await prenotazioneDi(prenotazioneId);
  const saldo = await prenotazioni.saldo(prenotazioneId);
  const banca = await impostazioni.leggiMolte(['struttura_iban', 'struttura_intestatario_conto']);
  return {
    ...saldo,
    acconto_richiesto: p.acconto_richiesto,
    da_pagare_ora: euro(importoDovutoOra(p, saldo)),
    metodi_online: METODI_ONLINE.filter((m) => config[m].attivo),
    bonifico: banca.struttura_iban
      ? {
          iban: banca.struttura_iban,
          intestatario: banca.struttura_intestatario_conto,
          causale: `Prenotazione ${p.codice}`,
        }
      : null,
  };
}

/** In attesa si paga l'acconto mancante, poi il saldo. In centesimi. */
function importoDovutoOra(p, saldo) {
  const resto = Math.max(0, centesimi(saldo.saldo));
  if (p.stato !== 'in_attesa') return resto;
  const accontoMancante =
    centesimi(p.acconto_richiesto) - centesimi(saldo.incassato) + centesimi(saldo.rimborsato);
  return Math.min(resto, Math.max(0, accontoMancante) || resto);
}

// --- dopo ogni incasso ------------------------------------------------------------------------

/** Conferma la prenotazione in attesa se l'acconto è coperto. Fuori transazione. */
async function dopoIncasso(prenotazioneId, contesto) {
  const p = await Prenotazione.findByPk(prenotazioneId);
  if (p?.stato !== 'in_attesa') {
    if (p?.stato === 'cancellata') {
      logger.warn('Incasso su prenotazione cancellata: va rimborsato', { prenotazione: p.codice });
    }
    return;
  }
  const { incassato, rimborsato } = await prenotazioni.saldo(prenotazioneId);
  if (centesimi(incassato) - centesimi(rimborsato) >= centesimi(p.acconto_richiesto)) {
    await prenotazioni.conferma(prenotazioneId, contesto);
  }
}

// --- in struttura -------------------------------------------------------------------------------

/**
 * Registra un incasso fatto in struttura.
 * @param {{ tipo: 'acconto'|'saldo'|'extra'|'penale', metodo: string, importo: number,
 *   riferimento?: string, documento_fiscale?: string, note?: string }} dati
 *   documento_fiscale: numero di scontrino/documento commerciale; se manca lo
 *   completa la fattura emessa per la prenotazione (vedi fatture.service)
 */
async function registra(prenotazioneId, dati, contesto) {
  if (!METODI_STRUTTURA.includes(dati.metodo)) {
    throw richiestaNonValida(
      'METODO_NON_VALIDO',
      'Stripe e PayPal si registrano da soli: usa il pagamento online',
    );
  }
  if (dati.tipo === 'rimborso')
    throw richiestaNonValida('TIPO_NON_VALIDO', 'Per i rimborsi usa la funzione dedicata');
  const id = await transazione(contesto, async (t) => {
    const p = await prenotazioneDi(prenotazioneId, t);
    if (['acconto', 'saldo'].includes(dati.tipo)) {
      const { saldo } = await prenotazioni.saldo(p.id, t);
      if (centesimi(dati.importo) > centesimi(saldo)) {
        throw nonElaborabile(
          'IMPORTO_SUPERIORE_AL_SALDO',
          `Restano da pagare solo ${formatoEuro(Math.max(0, saldo))}`,
          {
            saldo,
          },
        );
      }
    }
    const pagamento = await Pagamento.create(
      {
        prenotazione_id: p.id,
        tipo: dati.tipo,
        metodo: dati.metodo,
        stato: 'completato',
        importo: dati.importo,
        valuta: p.valuta,
        riferimento: dati.riferimento ?? null,
        documento_fiscale: dati.documento_fiscale ?? null,
        note: dati.note ?? null,
        registrato_da: contesto?.utenteId ?? null,
      },
      { transaction: t },
    );
    return pagamento.id;
  });
  await dopoIncasso(prenotazioneId, contesto);
  return trova(id);
}

/** Storna una registrazione manuale sbagliata (resta nel registro attività). */
async function annulla(id, motivo, contesto) {
  await transazione(contesto, async (t) => {
    const pg = await trova(id, t);
    if (!METODI_STRUTTURA.includes(pg.metodo)) {
      throw conflitto('PAGAMENTO_ONLINE', 'Un pagamento online si annulla con un rimborso');
    }
    if (pg.stato !== 'completato')
      throw conflitto('STATO_NON_VALIDO', 'Il pagamento non è completato');
    await pg.update(
      { stato: 'annullato', note: [pg.note, `Annullato: ${motivo}`].filter(Boolean).join('\n') },
      { transaction: t },
    );
  });
  return trova(id);
}

// --- online -----------------------------------------------------------------------------------

const urlEsito = (codice, esito) =>
  `${config.urlFrontend}/prenotazioni/${codice}/pagamento?esito=${esito}`;

async function sessioneStripe(p, pagamento, importoCent, titolare) {
  // Stripe accetta scadenze tra 30 minuti e 24 ore; se la prenotazione scade
  // prima, la sessione dura comunque 30 minuti (l'incasso tardivo si rimborsa).
  const limite = p.scade_il
    ? Math.min(p.scade_il.getTime(), Date.now() + 23 * 3600e3)
    : Date.now() + 23 * 3600e3;
  const scadenza = Math.max(limite, aggiungiMinuti(new Date(), 31).getTime());
  return richiediStripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: titolare?.email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: p.valuta.toLowerCase(),
          unit_amount: importoCent,
          product_data: {
            name: `${await impostazioni.leggi('struttura_nome', 'Soggiorno')} · prenotazione ${p.codice}`,
          },
        },
      },
    ],
    metadata: { pagamento_uuid: pagamento.uuid, prenotazione_id: String(p.id) },
    payment_intent_data: { metadata: { pagamento_uuid: pagamento.uuid } },
    success_url: urlEsito(p.codice, 'ok'),
    cancel_url: urlEsito(p.codice, 'annullato'),
    expires_at: Math.floor(scadenza / 1000),
  });
}

/**
 * Avvia un pagamento online e restituisce il link al checkout.
 * Senza importo si paga quanto dovuto ora (acconto o saldo).
 * @param {{ metodo: 'stripe'|'paypal', importo?: number, invia_email?: boolean }} dati
 *   invia_email: lo staff manda il link all'ospite (pagamento a distanza)
 */
async function avviaOnline(
  prenotazioneId,
  { metodo, importo, invia_email: inviaEmail = false },
  contesto,
) {
  if (!METODI_ONLINE.includes(metodo))
    throw richiestaNonValida('METODO_NON_VALIDO', 'Metodo di pagamento non valido');
  if (!config[metodo].attivo) {
    throw servizioNonDisponibile(
      'METODO_NON_ATTIVO',
      `Il pagamento con ${metodo === 'stripe' ? 'carta' : 'PayPal'} non è attivo`,
    );
  }
  const p = await Prenotazione.findByPk(prenotazioneId, { include: ['titolare'] });
  oppure404(p, 'PRENOTAZIONE_NON_TROVATA', 'Prenotazione non trovata');
  if (!['in_attesa', 'confermata', 'in_soggiorno', 'conclusa'].includes(p.stato)) {
    throw conflitto('STATO_NON_VALIDO', 'Questa prenotazione non accetta pagamenti');
  }
  const saldo = await prenotazioni.saldo(p.id);
  const dovuto = importoDovutoOra(p, saldo);
  const cent = importo == null ? dovuto : centesimi(importo);
  if (cent <= 0) throw conflitto('NULLA_DA_PAGARE', 'Non c’è nulla da pagare');
  if (cent > Math.max(0, centesimi(saldo.saldo))) {
    throw nonElaborabile(
      'IMPORTO_SUPERIORE_AL_SALDO',
      `Restano da pagare solo ${formatoEuro(saldo.saldo)}`,
    );
  }

  const pagamento = await transazione(contesto, (t) =>
    Pagamento.create(
      {
        prenotazione_id: p.id,
        tipo: p.stato === 'in_attesa' ? 'acconto' : 'saldo',
        metodo,
        stato: 'in_attesa',
        importo: euro(cent),
        valuta: p.valuta,
        registrato_da: contesto?.utenteId ?? null,
      },
      { transaction: t },
    ),
  );

  try {
    const { id: idEsterno, url } =
      metodo === 'stripe'
        ? await sessioneStripe(p, pagamento, cent, p.titolare)
        : await ordinePaypal(p, pagamento, cent);
    await pagamento.update({ riferimento: idEsterno, link_pagamento: url });
  } catch (err) {
    await pagamento.update({ stato: 'fallito', note: err.message.slice(0, 500) });
    if (err.codice) throw err;
    logger.error('Creazione checkout non riuscita', { metodo, errore: err.message });
    throw servizioNonDisponibile(
      'PAGAMENTO_NON_AVVIATO',
      'Il servizio di pagamento non risponde: riprova tra poco',
    );
  }

  if (inviaEmail) {
    await prenotazioni.notifica(p.id, 'link_pagamento', {
      importo: formatoEuro(euro(cent)),
      link: pagamento.link_pagamento,
    });
  }
  return {
    pagamento_id: pagamento.id,
    uuid: pagamento.uuid,
    importo: euro(cent),
    url: pagamento.link_pagamento,
  };
}

/** Segna completato un pagamento online (idempotente). */
async function completaOnline(uuid, idTransazione, contesto = SISTEMA) {
  const pagamento = await transazione(contesto, async (t) => {
    const pg = await Pagamento.findOne({ where: { uuid }, transaction: t, lock: t.LOCK.UPDATE });
    if (!pg) {
      logger.warn('Pagamento online sconosciuto', { uuid });
      return null;
    }
    if (pg.stato === 'completato') return null;
    await pg.update({ stato: 'completato', id_transazione: idTransazione }, { transaction: t });
    return pg;
  });
  if (pagamento) await dopoIncasso(pagamento.prenotazione_id, contesto);
  return pagamento;
}

async function chiudiOnline(uuid, stato, motivo) {
  await transazione(SISTEMA, (t) =>
    Pagamento.update(
      { stato, note: motivo },
      { where: { uuid, stato: 'in_attesa' }, transaction: t },
    ),
  );
}

/** Registra l'evento una volta sola: false se era già arrivato. */
async function nuovoEvento(provider, idEvento, tipo, payload) {
  const [, creato] = await EventoWebhook.findOrCreate({
    where: { provider, id_evento: idEvento },
    defaults: { tipo, payload },
  });
  return creato;
}

async function eseguiEvento(provider, idEvento, fn) {
  try {
    await fn();
    await EventoWebhook.update(
      { elaborato_il: new Date() },
      { where: { provider, id_evento: idEvento } },
    );
  } catch (err) {
    await EventoWebhook.update(
      { errore: err.message },
      { where: { provider, id_evento: idEvento } },
    );
    throw err;
  }
}

/**
 * Webhook Stripe. Serve il corpo grezzo (express.raw) per la firma.
 * @returns {Promise<{ ricevuto: true }>}
 */
async function webhookStripe(corpoGrezzo, firma) {
  let evento;
  try {
    evento = richiediStripe().webhooks.constructEvent(
      corpoGrezzo,
      firma,
      config.stripe.segretoWebhook,
    );
  } catch (err) {
    throw richiestaNonValida('FIRMA_WEBHOOK_NON_VALIDA', `Firma Stripe non valida: ${err.message}`);
  }
  if (!(await nuovoEvento('stripe', evento.id, evento.type, evento.data.object)))
    return { ricevuto: true };

  const sessione = evento.data.object;
  const uuid = sessione.metadata?.pagamento_uuid;
  await eseguiEvento('stripe', evento.id, async () => {
    if (!uuid) return;
    switch (evento.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (sessione.payment_status === 'paid') await completaOnline(uuid, sessione.payment_intent);
        break;
      case 'checkout.session.async_payment_failed':
        await chiudiOnline(uuid, 'fallito', 'Pagamento rifiutato');
        break;
      case 'checkout.session.expired':
        await chiudiOnline(uuid, 'annullato', 'Checkout scaduto');
        break;
      default:
    }
  });
  return { ricevuto: true };
}

// --- PayPal (REST v2 via fetch) ---------------------------------------------------------------

const basePaypal = () =>
  config.paypal.ambiente === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

let tokenPaypal = null;

async function chiamaPaypal(percorso, { metodo = 'POST', corpo } = {}) {
  if (!tokenPaypal || tokenPaypal.scade < Date.now()) {
    const risposta = await fetch(`${basePaypal()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!risposta.ok) throw new Error(`PayPal OAuth ${risposta.status}`);
    const dati = await risposta.json();
    tokenPaypal = { valore: dati.access_token, scade: Date.now() + (dati.expires_in - 60) * 1000 };
  }
  const risposta = await fetch(`${basePaypal()}${percorso}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${tokenPaypal.valore}`, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dati = await risposta.json().catch(() => ({}));
  if (!risposta.ok)
    throw new Error(`PayPal ${percorso} ${risposta.status}: ${dati.message ?? dati.name ?? ''}`);
  return dati;
}

async function ordinePaypal(p, pagamento, cent) {
  const ordine = await chiamaPaypal('/v2/checkout/orders', {
    corpo: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: p.codice,
          custom_id: pagamento.uuid,
          description: `Prenotazione ${p.codice}`,
          amount: { currency_code: p.valuta, value: (cent / 100).toFixed(2) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            user_action: 'PAY_NOW',
            return_url: urlEsito(p.codice, 'ok'),
            cancel_url: urlEsito(p.codice, 'annullato'),
          },
        },
      },
    },
  });
  const link = ordine.links.find((l) => l.rel === 'payer-action' || l.rel === 'approve');
  return { id: ordine.id, url: link?.href };
}

/**
 * Cattura dopo il ritorno da PayPal (?token=<id ordine>). Il webhook
 * PAYMENT.CAPTURE.COMPLETED fa lo stesso: chi arriva primo vince.
 */
async function catturaPaypal(idOrdine) {
  const pg = oppure404(
    await Pagamento.findOne({ where: { riferimento: idOrdine, metodo: 'paypal' } }),
    'PAGAMENTO_NON_TROVATO',
    'Pagamento PayPal non trovato',
  );
  if (pg.stato === 'completato') return pg;
  let esito;
  try {
    esito = await chiamaPaypal(`/v2/checkout/orders/${encodeURIComponent(idOrdine)}/capture`);
  } catch (err) {
    logger.warn('Cattura PayPal non riuscita', { ordine: idOrdine, errore: err.message });
    throw nonElaborabile('PAGAMENTO_NON_RIUSCITO', 'PayPal non ha autorizzato il pagamento');
  }
  const cattura = esito.purchase_units?.[0]?.payments?.captures?.[0];
  if (esito.status !== 'COMPLETED' || !cattura) {
    throw nonElaborabile('PAGAMENTO_NON_RIUSCITO', 'PayPal non ha completato il pagamento');
  }
  await completaOnline(pg.uuid, cattura.id, { utenteId: null, ip: 'paypal' });
  return trova(pg.id);
}

/** Webhook PayPal: firma verificata dall'API di PayPal. */
async function webhookPaypal(intestazioni, evento) {
  const verifica = await chiamaPaypal('/v1/notifications/verify-webhook-signature', {
    corpo: {
      auth_algo: intestazioni['paypal-auth-algo'],
      cert_url: intestazioni['paypal-cert-url'],
      transmission_id: intestazioni['paypal-transmission-id'],
      transmission_sig: intestazioni['paypal-transmission-sig'],
      transmission_time: intestazioni['paypal-transmission-time'],
      webhook_id: config.paypal.webhookId,
      webhook_event: evento,
    },
  }).catch(() => null);
  if (verifica?.verification_status !== 'SUCCESS') {
    throw richiestaNonValida('FIRMA_WEBHOOK_NON_VALIDA', 'Firma PayPal non valida');
  }
  if (!(await nuovoEvento('paypal', evento.id, evento.event_type, evento.resource)))
    return { ricevuto: true };

  const risorsa = evento.resource ?? {};
  await eseguiEvento('paypal', evento.id, async () => {
    if (!risorsa.custom_id) return;
    if (evento.event_type === 'PAYMENT.CAPTURE.COMPLETED')
      await completaOnline(risorsa.custom_id, risorsa.id);
    if (evento.event_type === 'PAYMENT.CAPTURE.DENIED')
      await chiudiOnline(risorsa.custom_id, 'fallito', 'Pagamento rifiutato');
  });
  return { ricevuto: true };
}

// --- rimborsi -------------------------------------------------------------------------------------

/**
 * Rimborso di (parte di) un pagamento. Stripe e PayPal vengono rimborsati sul
 * provider; contanti, POS e bonifico si registrano soltanto.
 * Non si rimborsa più di quanto incassato in eccesso rispetto al dovuto,
 * salvo `forza` (es. gesto commerciale su soggiorno concluso).
 */
async function rimborsa(pagamentoId, { importo, motivo, forza = false }, contesto) {
  const pg = await trova(pagamentoId);
  if (pg.stato !== 'completato' || pg.tipo === 'rimborso') {
    throw conflitto('NON_RIMBORSABILE', 'Si rimborsa solo un incasso completato');
  }
  const cent = importo == null ? centesimi(pg.importo) : centesimi(importo);
  const giaRimborsato = await Pagamento.sum('importo', {
    where: {
      prenotazione_id: pg.prenotazione_id,
      tipo: 'rimborso',
      stato: 'completato',
      riferimento: String(pg.id),
    },
  });
  if (cent <= 0 || cent + centesimi(giaRimborsato ?? 0) > centesimi(pg.importo)) {
    throw nonElaborabile(
      'IMPORTO_RIMBORSO_NON_VALIDO',
      `Puoi rimborsare al massimo ${formatoEuro(pg.importo - (giaRimborsato ?? 0))}`,
    );
  }
  const { saldo } = await prenotazioni.saldo(pg.prenotazione_id);
  if (!forza && cent > Math.max(0, -centesimi(saldo))) {
    throw nonElaborabile(
      'RIMBORSO_OLTRE_IL_DOVUTO',
      saldo >= 0
        ? 'Non c’è nulla da rimborsare: il dovuto non è ancora coperto'
        : `Il rimborso dovuto è ${formatoEuro(-saldo)}`,
    );
  }

  let idTransazione = null;
  if (pg.metodo === 'stripe') {
    const r = await richiediStripe().refunds.create({
      payment_intent: pg.id_transazione,
      amount: cent,
    });
    idTransazione = r.id;
  } else if (pg.metodo === 'paypal') {
    const r = await chiamaPaypal(
      `/v2/payments/captures/${encodeURIComponent(pg.id_transazione)}/refund`,
      {
        corpo: { amount: { currency_code: pg.valuta, value: (cent / 100).toFixed(2) } },
      },
    );
    idTransazione = r.id;
  }

  const rimborso = await transazione(contesto, (t) =>
    Pagamento.create(
      {
        prenotazione_id: pg.prenotazione_id,
        tipo: 'rimborso',
        metodo: pg.metodo,
        stato: 'completato',
        importo: euro(cent),
        valuta: pg.valuta,
        id_transazione: idTransazione,
        riferimento: String(pg.id),
        note: motivo ?? null,
        registrato_da: contesto?.utenteId ?? null,
      },
      { transaction: t },
    ),
  );
  return rimborso;
}

// --- job -------------------------------------------------------------------------------------------

/** Checkout mai conclusi (utente sparito): dopo 24 ore si annullano. */
async function annullaOnlineAbbandonati() {
  const [n] = await transazione({ utenteId: null, ip: 'job' }, (t) =>
    Pagamento.update(
      { stato: 'annullato', note: 'Checkout non completato' },
      {
        where: {
          stato: 'in_attesa',
          metodo: METODI_ONLINE,
          creato_il: { [Op.lt]: new Date(Date.now() - 24 * 3600e3) },
        },
        transaction: t,
      },
    ),
  );
  return n;
}

module.exports = {
  METODI_STRUTTURA,
  diPrenotazione,
  elenco,
  riepilogo,
  registra,
  annulla,
  avviaOnline,
  webhookStripe,
  catturaPaypal,
  webhookPaypal,
  rimborsa,
  annullaOnlineAbbandonati,
};
