// Fatture elettroniche (SDI), pagamenti e idempotenza dei webhook.

const { T, EURO, PERCENTUALE, id, rif, obbligatorio, uuid, json, generata } = require('./campi');

module.exports = (sequelize) => {
  const ContatoreFattura = sequelize.define(
    'contatori_fatture',
    {
      anno: { type: T.SMALLINT.UNSIGNED, primaryKey: true },
      sezionale: { type: T.STRING(10), primaryKey: true, defaultValue: '' },
      ultimo_numero: obbligatorio(T.INTEGER.UNSIGNED, 0),
    },
    { timestamps: false },
  );

  // Nasce in 'bozza' senza numero; anno e numero li assegna il trigger
  // all'emissione. Dopo l'emissione il DB rifiuta modifiche ed eliminazioni.
  const Fattura = sequelize.define('fatture', {
    id: id(),
    prenotazione_id: rif(),
    fattura_origine_id: rif(),
    tipo_documento: obbligatorio(T.ENUM('TD01', 'TD04'), 'TD01'),
    anno: T.SMALLINT.UNSIGNED,
    sezionale: obbligatorio(T.STRING(10), ''),
    numero: T.INTEGER.UNSIGNED,
    data_emissione: obbligatorio(T.DATEONLY),
    cliente_denominazione: T.STRING(255),
    cliente_nome: T.STRING(100),
    cliente_cognome: T.STRING(100),
    cliente_codice_fiscale: T.STRING(16),
    cliente_partita_iva: T.STRING(20),
    cliente_indirizzo: obbligatorio(T.STRING(255)),
    cliente_cap: obbligatorio(T.STRING(10)),
    cliente_comune: obbligatorio(T.STRING(100)),
    cliente_provincia: T.CHAR(2),
    cliente_nazione: obbligatorio(T.CHAR(2), 'IT'),
    codice_destinatario: obbligatorio(T.CHAR(7), '0000000'),
    pec: T.STRING(255),
    imponibile: obbligatorio(EURO, 0),
    imposta: obbligatorio(EURO, 0),
    importo_esente: obbligatorio(EURO, 0),
    totale: obbligatorio(EURO, 0),
    stato_sdi: obbligatorio(
      T.ENUM(
        'bozza',
        'da_inviare',
        'inviata',
        'consegnata',
        'mancata_consegna',
        'scartata',
        'accettata',
        'rifiutata',
      ),
      'bozza',
    ),
    id_sdi: T.STRING(50),
    nome_file_xml: T.STRING(100),
    percorso_xml: T.STRING(255),
    percorso_pdf: T.STRING(255),
    esito_sdi: T.TEXT,
    note: T.TEXT,
    creato_da: rif(),
  });

  const FatturaRiga = sequelize.define(
    'fatture_righe',
    {
      id: id(),
      fattura_id: rif(true),
      descrizione: obbligatorio(T.STRING(255)),
      quantita: obbligatorio(EURO, 1),
      prezzo_unitario: obbligatorio(EURO),
      aliquota_iva: obbligatorio(PERCENTUALE),
      natura: T.STRING(5),
      totale: generata(EURO, 'totale'),
      ordine: obbligatorio(T.SMALLINT, 0),
    },
    { timestamps: false },
  );

  // I rimborsi sono righe di tipo 'rimborso' con importo positivo.
  const Pagamento = sequelize.define('pagamenti', {
    id: id(),
    uuid: uuid(),
    prenotazione_id: rif(true),
    tipo: obbligatorio(T.ENUM('acconto', 'saldo', 'extra', 'penale', 'rimborso')),
    metodo: obbligatorio(T.ENUM('stripe', 'paypal', 'bonifico', 'contanti', 'pos', 'ota')),
    stato: obbligatorio(T.ENUM('in_attesa', 'completato', 'fallito', 'annullato'), 'in_attesa'),
    importo: obbligatorio(EURO),
    valuta: obbligatorio(T.CHAR(3), 'EUR'),
    id_transazione: T.STRING(255),
    riferimento: T.STRING(100),
    documento_fiscale: T.STRING(50),
    link_pagamento: T.STRING(1000),
    pagato_il: T.DATE,
    registrato_da: rif(),
    note: T.TEXT,
  });

  const EventoWebhook = sequelize.define(
    'eventi_webhook',
    {
      provider: { type: T.ENUM('stripe', 'paypal'), primaryKey: true },
      id_evento: { type: T.STRING(255), primaryKey: true },
      tipo: obbligatorio(T.STRING(100)),
      payload: json('payload'),
      elaborato_il: T.DATE,
      errore: T.TEXT,
    },
    { createdAt: 'ricevuto_il', updatedAt: false },
  );

  return { ContatoreFattura, Fattura, FatturaRiga, Pagamento, EventoWebhook };
};
