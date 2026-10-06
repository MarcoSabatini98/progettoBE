// src/services/pagamenti.service.js
//
// Incassi e rimborsi di una prenotazione.
//  - In struttura (contanti, POS, bonifico ricevuto, OTA): li registra lo staff,
//    con il numero del documento fiscale. Il limite contanti lo controlla il DB.
//  - Online (Stripe, PayPal): si crea un pagamento 'in_attesa' con il link al
//    checkout; lo completa il webhook del provider o il ritorno da PayPal.
// Quando l'incassato copre l'acconto, la prenotazione in attesa si conferma.

const { transazione } = require('../models');
const config = require('../config/env');
const logger = require('../config/logger');
const pagamentiRepo = require('../repositories/pagamenti.repository');
const prenotazioniRepo = require('../repositories/prenotazioni.repository');
const impostazioni = require('./impostazioni.service');
const prenotazioni = require('./prenotazioni.service');
const notifiche = require('./notifiche.service');
const stripe = require('../utils/stripe');
const paypal = require('../utils/paypal');
const { METODI_ONLINE, METODI_STRUTTURA } = require('../constants/pagamenti.constants');
const { PERMESSI } = require('../constants/ruoli.constants');
const {
  nonTrovato,
  conflitto,
  richiestaNonValida,
  nonElaborabile,
  servizioNonDisponibile,
} = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { centesimi, euro, formatoEuro } = require('../utils/denaro');
const { aggiungiMinuti, aggiungiOre } = require('../utils/date');

// Contesto per il registro attività quando scrive un webhook o un job.
const WEBHOOK = { utenteId: null, ip: 'webhook' };
const JOB = { utenteId: null, ip: 'job' };

const STATI_CHE_ACCETTANO_PAGAMENTI = ['in_attesa', 'confermata', 'in_soggiorno', 'conclusa'];

async function pagamentoOppure404(id, transaction = null) {
  const pagamento = await pagamentiRepo.trovaPagamentoPerId(id, transaction);
  if (!pagamento) {
    throw nonTrovato('PAGAMENTO_NON_TROVATO', 'Pagamento non trovato');
  }
  return pagamento;
}

async function prenotazioneOppure404(id, transaction = null) {
  const prenotazione = transaction
    ? await prenotazioniRepo.bloccaPrenotazione(id, transaction)
    : await prenotazioniRepo.trovaPrenotazionePerId(id);
  if (!prenotazione) {
    throw nonTrovato('PRENOTAZIONE_NON_TROVATA', 'Prenotazione non trovata');
  }
  return prenotazione;
}

/**
 * Quanto si paga adesso, in centesimi: finché la prenotazione è in attesa
 * l'acconto che manca, poi tutto il saldo.
 */
function dovutoOra(prenotazione, saldo) {
  const resto = Math.max(0, centesimi(saldo.saldo));
  if (prenotazione.stato !== 'in_attesa') {
    return resto;
  }

  const giaPagato = centesimi(saldo.incassato) - centesimi(saldo.rimborsato);
  const accontoMancante = centesimi(prenotazione.acconto_richiesto) - giaPagato;
  if (accontoMancante <= 0) {
    return resto;
  }
  return Math.min(resto, accontoMancante);
}

// ─────────────────────────────────────
// Lettura
// ─────────────────────────────────────

async function diPrenotazione(prenotazioneId) {
  return await pagamentiRepo.trovaPagamentiDiPrenotazione(prenotazioneId);
}

async function elenco(query) {
  const p = pagina(query);
  const trovati = await pagamentiRepo.trovaPagamenti(query, p);
  return risultato(trovati, p);
}

/** Cosa resta da pagare e come: la pagina di pagamento del cliente. */
async function riepilogo(prenotazioneId) {
  const prenotazione = await prenotazioneOppure404(prenotazioneId);
  const saldo = await prenotazioniRepo.trovaSaldo(prenotazioneId);
  const banca = await impostazioni.leggiMolte(['struttura_iban', 'struttura_intestatario_conto']);

  let bonifico = null;
  if (banca.struttura_iban) {
    bonifico = {
      iban: banca.struttura_iban,
      intestatario: banca.struttura_intestatario_conto,
      causale: `Prenotazione ${prenotazione.codice}`,
    };
  }

  return {
    dovuto: saldo.dovuto,
    incassato: saldo.incassato,
    rimborsato: saldo.rimborsato,
    saldo: saldo.saldo,
    acconto_richiesto: prenotazione.acconto_richiesto,
    da_pagare_ora: euro(dovutoOra(prenotazione, saldo)),
    metodi_online: METODI_ONLINE.filter((metodo) => config[metodo].attivo),
    bonifico,
  };
}

// ─────────────────────────────────────
// Dopo ogni incasso
// ─────────────────────────────────────

/** Avvisa il cliente e conferma la prenotazione in attesa se l'acconto è coperto. */
async function dopoIncasso(pagamento, contesto) {
  const prenotazioneId = pagamento.prenotazione_id;
  const prenotazione = await prenotazioniRepo.trovaPrenotazionePerId(prenotazioneId);
  await notifiche.alCliente(prenotazione, 'pagamento_ricevuto', {
    importo: formatoEuro(pagamento.importo),
  });
  if (prenotazione.stato === 'cancellata') {
    logger.warn('Incasso su prenotazione cancellata: va rimborsato', {
      prenotazione: prenotazione.codice,
    });
    return;
  }
  if (prenotazione.stato !== 'in_attesa') {
    return;
  }

  const saldo = await prenotazioniRepo.trovaSaldo(prenotazioneId);
  const giaPagato = centesimi(saldo.incassato) - centesimi(saldo.rimborsato);
  if (giaPagato >= centesimi(prenotazione.acconto_richiesto)) {
    await prenotazioni.conferma(prenotazioneId, contesto);
  }
}

// ─────────────────────────────────────
// Incassi in struttura
// ─────────────────────────────────────

/**
 * Registra un incasso fatto in struttura.
 * dati: { tipo: acconto|saldo|extra|penale, metodo, importo, riferimento?,
 *         documento_fiscale?, note? }
 * documento_fiscale è il numero di scontrino; se manca vale la fattura emessa.
 */
async function registra(prenotazioneId, dati, contesto) {
  if (!METODI_STRUTTURA.includes(dati.metodo)) {
    throw richiestaNonValida(
      'METODO_NON_VALIDO',
      'Stripe e PayPal si registrano da soli: usa il pagamento online',
    );
  }
  if (dati.tipo === 'rimborso') {
    throw richiestaNonValida('TIPO_NON_VALIDO', 'Per i rimborsi usa la funzione dedicata');
  }

  const pagamento = await transazione(contesto, async (transaction) => {
    const prenotazione = await prenotazioneOppure404(prenotazioneId, transaction);

    if (dati.tipo === 'acconto' || dati.tipo === 'saldo') {
      const { saldo } = await prenotazioniRepo.trovaSaldo(prenotazione.id, transaction);
      if (centesimi(dati.importo) > centesimi(saldo)) {
        throw nonElaborabile(
          'IMPORTO_SUPERIORE_AL_SALDO',
          `Restano da pagare solo ${formatoEuro(Math.max(0, saldo))}`,
          { saldo },
        );
      }
    }

    return await pagamentiRepo.creaPagamento(
      {
        prenotazione_id: prenotazione.id,
        tipo: dati.tipo,
        metodo: dati.metodo,
        stato: 'completato',
        importo: dati.importo,
        valuta: prenotazione.valuta,
        riferimento: dati.riferimento ?? null,
        documento_fiscale: dati.documento_fiscale ?? null,
        note: dati.note ?? null,
        pagato_il: new Date(),
        registrato_da: contesto?.utenteId ?? null,
      },
      transaction,
    );
  });

  await dopoIncasso(pagamento, contesto);
  return await pagamentoOppure404(pagamento.id);
}

/** Storna una registrazione manuale sbagliata (resta nel registro attività). */
async function annulla(id, motivo, contesto) {
  await transazione(contesto, async (transaction) => {
    const pagamento = await pagamentoOppure404(id, transaction);
    if (!METODI_STRUTTURA.includes(pagamento.metodo)) {
      throw conflitto('PAGAMENTO_ONLINE', 'Un pagamento online si annulla con un rimborso');
    }
    if (pagamento.stato !== 'completato') {
      throw conflitto('STATO_NON_VALIDO', 'Il pagamento non è completato');
    }

    const note = [pagamento.note, `Annullato: ${motivo}`].filter(Boolean).join('\n');
    await pagamentiRepo.aggiornaPagamento(id, { stato: 'annullato', note }, transaction);
  });
  return await pagamentoOppure404(id);
}

// ─────────────────────────────────────
// Pagamenti online
// ─────────────────────────────────────

function urlEsito(codice, esito) {
  return `${config.urlFrontend}/prenotazioni/${codice}/pagamento?esito=${esito}`;
}

/**
 * Stripe accetta una scadenza tra 30 minuti e 24 ore. Se la prenotazione
 * scade prima, il checkout dura comunque 30 minuti (un incasso tardivo si rimborsa).
 */
function scadenzaCheckoutStripe(prenotazione) {
  let limite = aggiungiOre(new Date(), 23);
  if (prenotazione.scade_il && prenotazione.scade_il < limite) {
    limite = prenotazione.scade_il;
  }
  const minimo = aggiungiMinuti(new Date(), 31);
  const scadenza = limite > minimo ? limite : minimo;
  return Math.floor(scadenza.getTime() / 1000);
}

async function checkoutStripe(prenotazione, pagamento, importoCentesimi) {
  const nomeStruttura = await impostazioni.leggi('struttura_nome', 'Soggiorno');
  const sessione = await stripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: prenotazione.titolare?.email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: prenotazione.valuta.toLowerCase(),
          unit_amount: importoCentesimi,
          product_data: { name: `${nomeStruttura} · prenotazione ${prenotazione.codice}` },
        },
      },
    ],
    metadata: { pagamento_uuid: pagamento.uuid, prenotazione_id: String(prenotazione.id) },
    payment_intent_data: { metadata: { pagamento_uuid: pagamento.uuid } },
    success_url: urlEsito(prenotazione.codice, 'ok'),
    cancel_url: urlEsito(prenotazione.codice, 'annullato'),
    expires_at: scadenzaCheckoutStripe(prenotazione),
  });
  return { id: sessione.id, url: sessione.url };
}

async function checkoutPaypal(prenotazione, pagamento, importoCentesimi) {
  return await paypal.creaOrdine({
    idInterno: pagamento.uuid,
    riferimento: prenotazione.codice,
    descrizione: `Prenotazione ${prenotazione.codice}`,
    valuta: prenotazione.valuta,
    centesimi: importoCentesimi,
    urlOk: urlEsito(prenotazione.codice, 'ok'),
    urlAnnullato: urlEsito(prenotazione.codice, 'annullato'),
  });
}

/**
 * Avvia un pagamento online e restituisce il link al checkout.
 * Senza importo si paga quanto dovuto ora (acconto o saldo).
 * invia_email: lo staff manda il link all'ospite (pagamento a distanza).
 */
async function avviaOnline(prenotazioneId, dati, contesto) {
  const { metodo, importo, invia_email: inviaEmail = false } = dati;

  if (!METODI_ONLINE.includes(metodo)) {
    throw richiestaNonValida('METODO_NON_VALIDO', 'Metodo di pagamento non valido');
  }
  if (!config[metodo].attivo) {
    const nome = metodo === 'stripe' ? 'carta' : 'PayPal';
    throw servizioNonDisponibile('METODO_NON_ATTIVO', `Il pagamento con ${nome} non è attivo`);
  }

  const prenotazione = await prenotazioniRepo.trovaDettaglio(prenotazioneId);
  if (!prenotazione) {
    throw nonTrovato('PRENOTAZIONE_NON_TROVATA', 'Prenotazione non trovata');
  }
  if (!STATI_CHE_ACCETTANO_PAGAMENTI.includes(prenotazione.stato)) {
    throw conflitto('STATO_NON_VALIDO', 'Questa prenotazione non accetta pagamenti');
  }

  const saldo = prenotazione.saldo;
  const importoCentesimi = importo == null ? dovutoOra(prenotazione, saldo) : centesimi(importo);
  if (importoCentesimi <= 0) {
    throw conflitto('NULLA_DA_PAGARE', "Non c'è nulla da pagare");
  }
  if (importoCentesimi > Math.max(0, centesimi(saldo.saldo))) {
    throw nonElaborabile(
      'IMPORTO_SUPERIORE_AL_SALDO',
      `Restano da pagare solo ${formatoEuro(saldo.saldo)}`,
    );
  }

  const pagamento = await transazione(contesto, async (transaction) => {
    return await pagamentiRepo.creaPagamento(
      {
        prenotazione_id: prenotazione.id,
        tipo: prenotazione.stato === 'in_attesa' ? 'acconto' : 'saldo',
        metodo,
        stato: 'in_attesa',
        importo: euro(importoCentesimi),
        valuta: prenotazione.valuta,
        registrato_da: contesto?.utenteId ?? null,
      },
      transaction,
    );
  });

  let checkout;
  try {
    checkout =
      metodo === 'stripe'
        ? await checkoutStripe(prenotazione, pagamento, importoCentesimi)
        : await checkoutPaypal(prenotazione, pagamento, importoCentesimi);
  } catch (errore) {
    await transazione(contesto, async (transaction) => {
      await pagamentiRepo.aggiornaPagamento(
        pagamento.id,
        { stato: 'fallito', note: errore.message.slice(0, 500) },
        transaction,
      );
    });
    if (errore.codice) {
      throw errore;
    }
    logger.error('Creazione checkout non riuscita', { metodo, errore: errore.message });
    throw servizioNonDisponibile(
      'PAGAMENTO_NON_AVVIATO',
      'Il servizio di pagamento non risponde: riprova tra poco',
    );
  }

  await transazione(contesto, async (transaction) => {
    await pagamentiRepo.aggiornaPagamento(
      pagamento.id,
      { riferimento: checkout.id, link_pagamento: checkout.url },
      transaction,
    );
  });

  if (inviaEmail) {
    await prenotazioni.notifica(prenotazione.id, 'link_pagamento', {
      importo: formatoEuro(euro(importoCentesimi)),
      link: checkout.url,
    });
  }

  return {
    pagamento_id: pagamento.id,
    uuid: pagamento.uuid,
    importo: euro(importoCentesimi),
    url: checkout.url,
  };
}

/** Segna completato un pagamento online. Chiamarla due volte non fa danni. */
async function completaOnline(uuid, idTransazione, contesto = WEBHOOK) {
  const completato = await transazione(contesto, async (transaction) => {
    const pagamento = await pagamentiRepo.bloccaPagamentoPerUuid(uuid, transaction);
    if (!pagamento) {
      logger.warn('Pagamento online sconosciuto', { uuid });
      return null;
    }
    if (pagamento.stato === 'completato') {
      return null;
    }

    await pagamentiRepo.aggiornaPagamento(
      pagamento.id,
      { stato: 'completato', id_transazione: idTransazione, pagato_il: new Date() },
      transaction,
    );
    return pagamento;
  });

  if (completato) {
    await dopoIncasso(completato, contesto);
  }
}

async function chiudiOnline(uuid, stato, motivo) {
  await transazione(WEBHOOK, async (transaction) => {
    await pagamentiRepo.chiudiPagamentoInAttesa(uuid, { stato, note: motivo }, transaction);
  });
}

/**
 * Esegue un evento webhook una volta sola: il provider può rimandarlo.
 * L'esito (o l'errore) resta salvato sull'evento.
 */
async function elaboraEventoUnaVolta(provider, evento, gestisci) {
  const nuovo = await pagamentiRepo.registraEventoWebhook(
    provider,
    evento.id,
    evento.tipo,
    evento.payload,
  );
  if (!nuovo) {
    return;
  }

  try {
    await gestisci();
    await pagamentiRepo.aggiornaEventoWebhook(provider, evento.id, { elaborato_il: new Date() });
  } catch (errore) {
    await pagamentiRepo.aggiornaEventoWebhook(provider, evento.id, { errore: errore.message });
    throw errore;
  }
}

/** Webhook Stripe. Serve il corpo grezzo della richiesta per verificare la firma. */
async function webhookStripe(corpoGrezzo, firma) {
  let evento;
  try {
    evento = stripe().webhooks.constructEvent(corpoGrezzo, firma, config.stripe.segretoWebhook);
  } catch (errore) {
    if (errore.codice) {
      throw errore;
    }
    throw richiestaNonValida('FIRMA_WEBHOOK_NON_VALIDA', 'Firma Stripe non valida');
  }

  const sessione = evento.data.object;
  const uuid = sessione.metadata?.pagamento_uuid;
  const registrato = { id: evento.id, tipo: evento.type, payload: sessione };

  await elaboraEventoUnaVolta('stripe', registrato, async () => {
    if (!uuid) {
      return;
    }
    if (
      evento.type === 'checkout.session.completed' ||
      evento.type === 'checkout.session.async_payment_succeeded'
    ) {
      if (sessione.payment_status === 'paid') {
        await completaOnline(uuid, sessione.payment_intent);
      }
    }
    if (evento.type === 'checkout.session.async_payment_failed') {
      await chiudiOnline(uuid, 'fallito', 'Pagamento rifiutato');
    }
    if (evento.type === 'checkout.session.expired') {
      await chiudiOnline(uuid, 'annullato', 'Checkout scaduto');
    }
  });
  return { ricevuto: true };
}

/**
 * Cattura dopo il ritorno da PayPal (?token=<id ordine>), oppure dal webhook
 * CHECKOUT.ORDER.APPROVED se il cliente chiude la pagina prima di tornare.
 * Chi arriva primo vince: la cattura su PayPal è idempotente.
 */
async function catturaPaypal(idOrdine) {
  const pagamento = await pagamentiRepo.trovaPagamentoPaypal(idOrdine);
  if (!pagamento) {
    throw nonTrovato('PAGAMENTO_NON_TROVATO', 'Pagamento PayPal non trovato');
  }
  if (pagamento.stato === 'completato') {
    return pagamento;
  }

  let idCattura;
  try {
    idCattura = await paypal.catturaOrdine(idOrdine);
  } catch (errore) {
    logger.warn('Cattura PayPal non riuscita', { ordine: idOrdine, errore: errore.message });
    throw nonElaborabile('PAGAMENTO_NON_RIUSCITO', 'PayPal non ha autorizzato il pagamento');
  }
  if (!idCattura) {
    throw nonElaborabile('PAGAMENTO_NON_RIUSCITO', 'PayPal non ha completato il pagamento');
  }

  await completaOnline(pagamento.uuid, idCattura, { utenteId: null, ip: 'paypal' });
  return await pagamentoOppure404(pagamento.id);
}

/** Webhook PayPal: la firma la verifica PayPal stesso. */
async function webhookPaypal(intestazioni, evento) {
  if (!(await paypal.webhookAutentico(intestazioni, evento))) {
    throw richiestaNonValida('FIRMA_WEBHOOK_NON_VALIDA', 'Firma PayPal non valida');
  }

  const risorsa = evento.resource ?? {};
  const registrato = { id: evento.id, tipo: evento.event_type, payload: risorsa };

  await elaboraEventoUnaVolta('paypal', registrato, async () => {
    if (evento.event_type === 'CHECKOUT.ORDER.APPROVED') {
      await catturaPaypal(risorsa.id);
      return;
    }
    if (!risorsa.custom_id) {
      return;
    }
    if (evento.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      await completaOnline(risorsa.custom_id, risorsa.id);
    }
    if (evento.event_type === 'PAYMENT.CAPTURE.DENIED') {
      await chiudiOnline(risorsa.custom_id, 'fallito', 'Pagamento rifiutato');
    }
  });
  return { ricevuto: true };
}

// ─────────────────────────────────────
// Rimborsi
// ─────────────────────────────────────

/**
 * Rimborso di (parte di) un incasso. Stripe e PayPal si rimborsano sul
 * provider; contanti, POS e bonifico si registrano soltanto.
 * Si rimborsa al massimo quanto incassato in più del dovuto, salvo `forza`
 * (es. gesto commerciale su un soggiorno concluso).
 */
async function rimborsa(pagamentoId, { importo, motivo, forza = false }, contesto) {
  const pagamento = await pagamentoOppure404(pagamentoId);
  if (pagamento.stato !== 'completato' || pagamento.tipo === 'rimborso') {
    throw conflitto('NON_RIMBORSABILE', 'Si rimborsa solo un incasso completato');
  }

  const importoCentesimi = importo == null ? centesimi(pagamento.importo) : centesimi(importo);
  const giaRimborsato = centesimi(await pagamentiRepo.sommaRimborsiDi(pagamento.id));
  const rimborsabile = centesimi(pagamento.importo) - giaRimborsato;
  if (importoCentesimi <= 0 || importoCentesimi > rimborsabile) {
    throw nonElaborabile(
      'IMPORTO_RIMBORSO_NON_VALIDO',
      `Puoi rimborsare al massimo ${formatoEuro(euro(rimborsabile))}`,
    );
  }

  const { saldo } = await prenotazioniRepo.trovaSaldo(pagamento.prenotazione_id);
  const pagatoInPiu = Math.max(0, -centesimi(saldo));
  if (!forza && importoCentesimi > pagatoInPiu) {
    const messaggio =
      saldo >= 0
        ? "Non c'è nulla da rimborsare: il dovuto non è ancora coperto"
        : `Il rimborso dovuto è ${formatoEuro(-saldo)}`;
    throw nonElaborabile('RIMBORSO_OLTRE_IL_DOVUTO', messaggio);
  }

  let idTransazione = null;
  if (pagamento.metodo === 'stripe') {
    const rimborso = await stripe().refunds.create({
      payment_intent: pagamento.id_transazione,
      amount: importoCentesimi,
    });
    idTransazione = rimborso.id;
  }
  if (pagamento.metodo === 'paypal') {
    idTransazione = await paypal.rimborsaCattura(
      pagamento.id_transazione,
      pagamento.valuta,
      importoCentesimi,
    );
  }

  const rimborso = await transazione(contesto, async (transaction) => {
    return await pagamentiRepo.creaPagamento(
      {
        prenotazione_id: pagamento.prenotazione_id,
        tipo: 'rimborso',
        metodo: pagamento.metodo,
        stato: 'completato',
        importo: euro(importoCentesimi),
        valuta: pagamento.valuta,
        id_transazione: idTransazione,
        riferimento: String(pagamento.id),
        note: motivo ?? null,
        pagato_il: new Date(),
        registrato_da: contesto?.utenteId ?? null,
      },
      transaction,
    );
  });

  const prenotazione = await prenotazioniRepo.trovaPrenotazionePerId(pagamento.prenotazione_id);
  await notifiche.alCliente(prenotazione, 'rimborso_eseguito', {
    importo: formatoEuro(rimborso.importo),
  });
  return rimborso;
}

// ─────────────────────────────────────
// Job
// ─────────────────────────────────────

/** Checkout mai conclusi (utente sparito): dopo 24 ore si annullano. */
async function annullaOnlineAbbandonati() {
  return await transazione(JOB, async (transaction) => {
    return await pagamentiRepo.annullaCheckoutAbbandonati(transaction);
  });
}

/**
 * Prenotazioni incassate oltre il dovuto (cancellata dal cliente, pagamento
 * arrivato tardi): lo staff deve fare il rimborso dai pagamenti.
 * ponytail: l'avviso si ripete ogni giorno finché il saldo non torna a zero.
 */
async function avvisaRimborsiDovuti() {
  const daRimborsare = await prenotazioniRepo.trovaDaRimborsare();
  if (daRimborsare.length === 0) return { avvisati: 0 };

  const destinatari = await notifiche.aChiPuo(PERMESSI.PAGAMENTI_REGISTRA, {
    tipo: 'pagamento',
    priorita: 'avviso',
    codice: 'rimborsi_da_fare',
    parametri: { totale: daRimborsare.length },
    titolo: `Rimborsi da fare: ${daRimborsare.length}`,
    testo: daRimborsare.map((saldo) => saldo.codice).join(', '),
    link:
      daRimborsare.length === 1
        ? `/staff/prenotazioni/${daRimborsare[0].prenotazione_id}`
        : '/staff/prenotazioni',
  });
  return { avvisati: destinatari.length };
}

module.exports = {
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
  avvisaRimborsiDovuti,
};
