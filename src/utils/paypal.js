// src/utils/paypal.js
//
// Chiamate alle API REST v2 di PayPal (senza SDK: bastano fetch e un token
// OAuth tenuto in memoria fino alla scadenza).
// Gli importi arrivano in centesimi.

const config = require('../config/env');
const { servizioNonDisponibile } = require('./errori');

// Una risposta che non arriva non deve tenere occupata la richiesta del cliente.
const ATTESA_MASSIMA_MS = 15000;

let token = null;

function indirizzoApi() {
  if (config.paypal.ambiente === 'live') {
    return 'https://api-m.paypal.com';
  }
  return 'https://api-m.sandbox.paypal.com';
}

function importoPaypal(valuta, centesimi) {
  return { currency_code: valuta, value: (centesimi / 100).toFixed(2) };
}

async function tokenValido() {
  if (token && token.scade > Date.now()) {
    return token.valore;
  }

  const credenziali = Buffer.from(
    `${config.paypal.clientId}:${config.paypal.clientSecret}`,
  ).toString('base64');
  const risposta = await fetch(`${indirizzoApi()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credenziali}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(ATTESA_MASSIMA_MS),
  });
  if (!risposta.ok) {
    throw new Error(`PayPal OAuth ${risposta.status}`);
  }

  const dati = await risposta.json();
  token = { valore: dati.access_token, scade: Date.now() + (dati.expires_in - 60) * 1000 };
  return token.valore;
}

/** intestazioni: aggiuntive, per esempio PayPal-Request-Id per l'idempotenza. */
async function chiama(percorso, corpo, intestazioni = {}) {
  if (!config.paypal.attivo) {
    throw servizioNonDisponibile('PAYPAL_NON_CONFIGURATO', 'I pagamenti PayPal non sono attivi');
  }

  const risposta = await fetch(`${indirizzoApi()}${percorso}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await tokenValido()}`,
      'Content-Type': 'application/json',
      ...intestazioni,
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(ATTESA_MASSIMA_MS),
  });
  const dati = await risposta.json().catch(() => ({}));
  if (!risposta.ok) {
    throw new Error(`PayPal ${percorso} ${risposta.status}: ${dati.message ?? dati.name ?? ''}`);
  }
  return dati;
}

/**
 * Crea l'ordine e restituisce id e link di approvazione.
 * idInterno torna nel webhook come custom_id.
 */
async function creaOrdine({
  idInterno,
  riferimento,
  descrizione,
  valuta,
  centesimi,
  urlOk,
  urlAnnullato,
}) {
  const ordine = await chiama('/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: riferimento,
        custom_id: idInterno,
        description: descrizione,
        amount: importoPaypal(valuta, centesimi),
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          user_action: 'PAY_NOW',
          return_url: urlOk,
          cancel_url: urlAnnullato,
        },
      },
    },
  });
  const link = ordine.links.find((l) => l.rel === 'payer-action' || l.rel === 'approve');
  return { id: ordine.id, url: link?.href };
}

/**
 * Cattura l'ordine approvato. Restituisce l'id della cattura o null se non completata.
 * Il ritorno del cliente e il webhook possono catturare insieme: con lo stesso
 * PayPal-Request-Id PayPal esegue la cattura una volta sola e ripete la risposta.
 */
async function catturaOrdine(idOrdine) {
  const esito = await chiama(
    `/v2/checkout/orders/${encodeURIComponent(idOrdine)}/capture`,
    undefined,
    { 'PayPal-Request-Id': `cattura-${idOrdine}` },
  );
  const cattura = esito.purchase_units?.[0]?.payments?.captures?.[0];
  if (esito.status !== 'COMPLETED' || !cattura) {
    return null;
  }
  return cattura.id;
}

async function rimborsaCattura(idCattura, valuta, centesimi) {
  const rimborso = await chiama(`/v2/payments/captures/${encodeURIComponent(idCattura)}/refund`, {
    amount: importoPaypal(valuta, centesimi),
  });
  return rimborso.id;
}

/** Verifica la firma di un webhook chiedendola a PayPal. */
async function webhookAutentico(intestazioni, evento) {
  try {
    const verifica = await chiama('/v1/notifications/verify-webhook-signature', {
      auth_algo: intestazioni['paypal-auth-algo'],
      cert_url: intestazioni['paypal-cert-url'],
      transmission_id: intestazioni['paypal-transmission-id'],
      transmission_sig: intestazioni['paypal-transmission-sig'],
      transmission_time: intestazioni['paypal-transmission-time'],
      webhook_id: config.paypal.webhookId,
      webhook_event: evento,
    });
    return verifica.verification_status === 'SUCCESS';
  } catch {
    return false;
  }
}

module.exports = { creaOrdine, catturaOrdine, rimborsaCattura, webhookAutentico };
