// src/utils/stripe.js
//
// Client Stripe. Senza STRIPE_SECRET_KEY i pagamenti con carta sono spenti
// e chi prova a usarli riceve un 503 chiaro.

const Stripe = require('stripe');
const config = require('../config/env');
const { servizioNonDisponibile } = require('./errori');

const client = config.stripe.attivo ? new Stripe(config.stripe.chiaveSegreta) : null;

function stripe() {
  if (!client) {
    throw servizioNonDisponibile('STRIPE_NON_CONFIGURATO', 'I pagamenti con carta non sono attivi');
  }
  return client;
}

module.exports = stripe;
