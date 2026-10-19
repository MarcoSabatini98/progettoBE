// Pagamenti e fatture elettroniche.

const TIPI_PAGAMENTO = Object.freeze(['acconto', 'saldo', 'extra', 'penale', 'rimborso']);

const METODI_PAGAMENTO = Object.freeze(['stripe', 'paypal', 'bonifico', 'contanti', 'pos', 'ota']);

// Metodi online: il pagamento parte in_attesa e lo completa il webhook.
const METODI_ONLINE = Object.freeze(['stripe', 'paypal']);

// Metodi registrati a mano dallo staff (incasso in struttura o bonifico ricevuto).
const METODI_STRUTTURA = Object.freeze(['bonifico', 'contanti', 'pos', 'ota']);

const STATI_PAGAMENTO = Object.freeze(['in_attesa', 'completato', 'fallito', 'annullato']);

const PROVIDER_WEBHOOK = Object.freeze(['stripe', 'paypal']);

// TD01 fattura, TD04 nota di credito
const TIPI_DOCUMENTO_FATTURA = Object.freeze(['TD01', 'TD04']);

const STATI_SDI = Object.freeze([
  'bozza',
  'da_inviare',
  'inviata',
  'consegnata',
  'mancata_consegna',
  'scartata',
  'accettata',
  'rifiutata',
]);

module.exports = {
  TIPI_PAGAMENTO,
  METODI_PAGAMENTO,
  METODI_ONLINE,
  METODI_STRUTTURA,
  STATI_PAGAMENTO,
  PROVIDER_WEBHOOK,
  TIPI_DOCUMENTO_FATTURA,
  STATI_SDI,
};
