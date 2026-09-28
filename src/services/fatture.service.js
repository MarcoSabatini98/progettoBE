// Fatture elettroniche della struttura.
//   bozza (dalla prenotazione, modificabile) → emissione (numero dal DB,
//   XML FatturaPA + PDF di cortesia, email al cliente) → esito SDI.
// Dopo l'emissione il DB blocca ogni modifica: si corregge con una nota di credito (TD04).
// ponytail: la trasmissione allo SDI la fa il connettore/intermediario; qui si registra l'esito.

const { Op } = require('sequelize');
const pdfmake = require('pdfmake');
const {
  Fattura,
  FatturaRiga,
  Prenotazione,
  PrenotazioneServizio,
  Servizio,
  Ospite,
  Pagamento,
  Camera,
  TipologiaCamera,
  Pacchetto,
  transazione,
} = require('../models');
const logger = require('../config/logger');
const {
  oppure404,
  conflitto,
  nonElaborabile,
  vietato,
  richiestaNonValida,
} = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { formatoEuro } = require('../utils/denaro');
const { oggi } = require('../utils/date');
const file = require('../utils/file');
const impostazioni = require('./impostazioni.service');
const email = require('./email.service');
const fpa = require('./fattura-pa');

pdfmake.setFonts(require('pdfmake/standard-fonts/Helvetica'));
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(() => false);

const CAMPI_CLIENTE = [
  'denominazione',
  'nome',
  'cognome',
  'codice_fiscale',
  'partita_iva',
  'indirizzo',
  'cap',
  'comune',
  'provincia',
  'nazione',
  'codice_destinatario',
  'pec',
];
const STATI_SDI = [
  'da_inviare',
  'inviata',
  'consegnata',
  'mancata_consegna',
  'scartata',
  'accettata',
  'rifiutata',
];
const includeRighe = [{ model: FatturaRiga, as: 'righe' }];
const ordineRighe = [[{ model: FatturaRiga, as: 'righe' }, 'ordine', 'ASC']];

async function trova(id, transaction) {
  return oppure404(
    await Fattura.findByPk(id, { include: includeRighe, order: ordineRighe, transaction }),
    'FATTURA_NON_TROVATA',
    'Fattura non trovata',
  );
}

const dataIt = (iso) => iso.split('-').reverse().join('/');

// --- lettura ---------------------------------------------------------------------------------

async function elenco(query) {
  const p = pagina(query);
  const where = {};
  if (query.stato_sdi) where.stato_sdi = String(query.stato_sdi).split(',');
  if (query.anno) where.anno = query.anno;
  if (query.prenotazione_id) where.prenotazione_id = query.prenotazione_id;
  if (query.cerca) {
    const testo = `%${query.cerca}%`;
    where[Op.or] = [
      'cliente_denominazione',
      'cliente_cognome',
      'cliente_codice_fiscale',
      'cliente_partita_iva',
    ].map((c) => ({ [c]: { [Op.like]: testo } }));
  }
  return risultato(
    await Fattura.findAndCountAll({
      where,
      order: [
        ['anno', 'DESC'],
        ['numero', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: p.limit,
      offset: p.offset,
    }),
    p,
  );
}

const dettaglio = (id) => trova(id);

/** File della fattura per il cliente: solo le sue, solo emesse. */
async function filePerCliente(id, utenteId, tipo = 'pdf') {
  const f = await Fattura.findByPk(id, {
    include: [{ model: Prenotazione, as: 'prenotazione', attributes: ['utente_id'] }],
  });
  if (!f || f.stato_sdi === 'bozza' || f.prenotazione?.utente_id !== utenteId) {
    throw vietato('FATTURA_ALTRUI', 'Questa fattura non è tua');
  }
  return percorsoFile(f, tipo);
}

async function percorsoFile(fattura, tipo = 'pdf') {
  const f = fattura instanceof Fattura ? fattura : await trova(fattura);
  const percorso = tipo === 'xml' ? f.percorso_xml : f.percorso_pdf;
  if (!percorso)
    throw conflitto('FILE_NON_DISPONIBILE', 'Il file si genera all’emissione della fattura');
  return {
    percorso: file.percorsoAssoluto(percorso),
    nome: tipo === 'xml' ? f.nome_file_xml : `fattura-${f.anno}-${f.numero}.pdf`,
  };
}

// --- intestatario ---------------------------------------------------------------------------

/**
 * Dati del cliente in fattura: quelli passati (es. azienda con P.IVA) sopra
 * quelli dell'anagrafica del titolare.
 */
function clienteDa(ospite, dati = {}) {
  const base = {
    nome: ospite?.nome,
    cognome: ospite?.cognome,
    codice_fiscale: ospite?.codice_fiscale,
    indirizzo: ospite?.indirizzo,
    cap: ospite?.cap,
    comune: ospite?.citta,
    provincia: ospite?.provincia,
    nazione: ospite?.paese || 'IT',
  };
  const c = {
    ...base,
    ...Object.fromEntries(CAMPI_CLIENTE.filter((k) => dati[k] != null).map((k) => [k, dati[k]])),
  };
  c.nazione = String(c.nazione).toUpperCase();
  if (c.denominazione) {
    c.nome = null;
    c.cognome = null;
  }

  const mancanti = ['indirizzo', 'cap', 'comune'].filter((k) => !c[k]);
  if (!c.denominazione && (!c.nome || !c.cognome)) mancanti.push('nome e cognome o denominazione');
  if (c.nazione === 'IT' && !c.codice_fiscale && !c.partita_iva)
    mancanti.push('codice_fiscale o partita_iva');
  if (c.denominazione && !c.partita_iva) mancanti.push('partita_iva');
  if (mancanti.length) {
    throw nonElaborabile(
      'DATI_FATTURAZIONE_MANCANTI',
      `Mancano dati per la fattura: ${mancanti.join(', ')}`,
      {
        campi: mancanti,
      },
    );
  }
  return Object.fromEntries(
    CAMPI_CLIENTE.map((k) => [
      `cliente_${k}`,
      k === 'codice_destinatario' ? (c[k] || '0000000').toUpperCase() : (c[k] ?? null),
    ]),
  );
}

// --- bozza -------------------------------------------------------------------------------------

/** Voci IVA inclusa della prenotazione (soggiorno, pacchetto, extra, tassa, penale). */
async function vociDi(p) {
  const {
    iva_soggiorno: ivaSoggiorno,
    iva_servizi: ivaServizi,
    struttura_regime_fiscale: regime,
  } = await impostazioni.leggiMolte(['iva_soggiorno', 'iva_servizi', 'struttura_regime_fiscale']);
  const forfettario = regime === 'RF19';
  const iva = (aliquota) =>
    forfettario ? { aliquota_iva: 0, natura: 'N2.2' } : { aliquota_iva: Number(aliquota) };
  const fuoriCampo = { aliquota_iva: 0, natura: 'N1' };

  if (p.stato === 'cancellata' || p.stato === 'no_show') {
    const penale = p.stato === 'no_show' ? p.totale - p.tassa_soggiorno : p.penale_applicata;
    return [
      {
        descrizione: `Penale per ${p.stato === 'no_show' ? 'mancato arrivo' : 'cancellazione'} prenotazione ${p.codice}`,
        lordo: penale,
        ...fuoriCampo,
      },
    ];
  }

  const sconti = p.sconto_promozione + p.sconto_codice + p.sconto_fedelta;
  const soggiorno = `Soggiorno in ${p.camera.tipologia.nome} dal ${dataIt(p.data_arrivo)} al ${dataIt(p.data_partenza)} (${p.notti} notti, ${p.adulti + p.bambini} ospiti)`;
  const voci = [
    {
      descrizione: sconti > 0 ? `${soggiorno}, sconti inclusi ${formatoEuro(sconti)}` : soggiorno,
      lordo: p.importo_soggiorno - sconti,
      ...iva(ivaSoggiorno),
    },
  ];
  if (p.importo_pacchetto > 0) {
    voci.push({
      descrizione: `Pacchetto ${p.pacchetto?.nome ?? ''}`.trim(),
      lordo: p.importo_pacchetto,
      ...iva(ivaSoggiorno),
    });
  }
  for (const s of p.servizi) {
    const riga = s.prenotazioni_servizi;
    voci.push({
      descrizione: riga.quantita > 1 ? `${s.nome} × ${riga.quantita}` : s.nome,
      lordo: riga.totale,
      ...iva(s.aliquota_iva ?? ivaServizi),
    });
  }
  if (p.tassa_soggiorno > 0)
    voci.push({ descrizione: 'Imposta di soggiorno', lordo: p.tassa_soggiorno, ...fuoriCampo });
  return voci;
}

/**
 * Bozza dalla prenotazione (a soggiorno iniziato o concluso, o per la penale).
 * Una bozza già presente viene rigenerata.
 * @param {object} [cliente]  dati di fatturazione diversi dal titolare (azienda, P.IVA, SDI, PEC)
 */
async function bozzaDaPrenotazione(prenotazioneId, cliente, contesto) {
  const id = await transazione(contesto, async (t) => {
    const p = oppure404(
      await Prenotazione.findByPk(prenotazioneId, {
        include: [
          { model: Camera, as: 'camera', include: [{ model: TipologiaCamera, as: 'tipologia' }] },
          { model: Ospite, as: 'titolare' },
          { model: Pacchetto, as: 'pacchetto', attributes: ['nome'] },
          { model: Servizio, as: 'servizi', through: { model: PrenotazioneServizio } },
        ],
        transaction: t,
        lock: t.LOCK.UPDATE,
      }),
      'PRENOTAZIONE_NON_TROVATA',
      'Prenotazione non trovata',
    );
    const fatturabile =
      ['in_soggiorno', 'conclusa', 'no_show'].includes(p.stato) ||
      (p.stato === 'cancellata' && p.penale_applicata > 0);
    if (!fatturabile)
      throw conflitto('NON_FATTURABILE', 'La prenotazione non ha ancora nulla da fatturare');

    const emesse = await Fattura.findAll({
      where: { prenotazione_id: p.id, stato_sdi: { [Op.ne]: 'bozza' } },
      attributes: ['tipo_documento', 'totale'],
      transaction: t,
    });
    const netto = emesse.reduce(
      (s, f) => s + (f.tipo_documento === 'TD04' ? -f.totale : f.totale),
      0,
    );
    if (netto > 0.005)
      throw conflitto(
        'FATTURA_GIA_EMESSA',
        'La prenotazione è già fatturata: per correggere emetti una nota di credito',
      );

    const { righe, imposta } = fpa.righeDaLordi(await vociDi(p));
    const importi = fpa.totali(righe, imposta);
    await Fattura.destroy({ where: { prenotazione_id: p.id, stato_sdi: 'bozza' }, transaction: t });
    const f = await Fattura.create(
      {
        prenotazione_id: p.id,
        data_emissione: oggi(),
        ...clienteDa(p.titolare, cliente),
        imponibile: importi.imponibile,
        imposta: importi.imposta,
        importo_esente: importi.importo_esente,
        totale: importi.totale,
        note: `Prenotazione ${p.codice}`,
        creato_da: contesto?.utenteId ?? null,
      },
      { transaction: t },
    );
    await FatturaRiga.bulkCreate(
      righe.map((r) => ({ ...r, fattura_id: f.id })),
      { transaction: t },
    );
    return f.id;
  });
  return trova(id);
}

/**
 * Modifica di una bozza: intestatario, note, righe (sostituite, prezzi imponibili).
 * @param {{ cliente?: object, note?: string, righe?: { descrizione, quantita, prezzo_unitario, aliquota_iva, natura? }[] }} dati
 */
async function aggiornaBozza(id, dati, contesto) {
  await transazione(contesto, async (t) => {
    const f = await trova(id, t);
    if (f.stato_sdi !== 'bozza')
      throw conflitto('FATTURA_NON_MODIFICABILE', 'La fattura è già emessa');
    const modifiche = {};
    if (dati.cliente) {
      const attuale = Object.fromEntries(CAMPI_CLIENTE.map((k) => [k, f[`cliente_${k}`]]));
      Object.assign(modifiche, clienteDa(null, { ...attuale, ...dati.cliente }));
    }
    if (dati.note !== undefined) modifiche.note = dati.note;
    if (dati.righe) {
      if (!dati.righe.length)
        throw richiestaNonValida('RIGHE_MANCANTI', 'La fattura deve avere almeno una riga');
      const importi = fpa.totali(dati.righe);
      Object.assign(modifiche, {
        imponibile: importi.imponibile,
        imposta: importi.imposta,
        importo_esente: importi.importo_esente,
        totale: importi.totale,
      });
      await FatturaRiga.destroy({ where: { fattura_id: id }, transaction: t });
      await FatturaRiga.bulkCreate(
        dati.righe.map((r, i) => ({
          fattura_id: id,
          descrizione: r.descrizione,
          quantita: r.quantita ?? 1,
          prezzo_unitario: r.prezzo_unitario,
          aliquota_iva: r.aliquota_iva,
          natura: r.aliquota_iva > 0 ? null : r.natura,
          ordine: i,
        })),
        { transaction: t },
      );
    }
    await f.update(modifiche, { transaction: t });
  });
  return trova(id);
}

async function eliminaBozza(id) {
  const f = await trova(id);
  if (f.stato_sdi !== 'bozza')
    throw conflitto(
      'FATTURA_NON_ELIMINABILE',
      'Una fattura emessa non si elimina: emetti una nota di credito',
    );
  await f.destroy();
}

// --- emissione ------------------------------------------------------------------------------------

async function cedente() {
  const s = await impostazioni.leggiMolte([
    'struttura_nome',
    'struttura_ragione_sociale',
    'struttura_partita_iva',
    'struttura_codice_fiscale',
    'struttura_regime_fiscale',
    'struttura_indirizzo',
    'struttura_cap',
    'struttura_comune',
    'struttura_provincia',
    'struttura_email',
    'struttura_telefono',
  ]);
  const c = {
    nome: s.struttura_nome,
    ragione_sociale: s.struttura_ragione_sociale,
    partita_iva: s.struttura_partita_iva,
    codice_fiscale: s.struttura_codice_fiscale,
    regime_fiscale: s.struttura_regime_fiscale || 'RF01',
    indirizzo: s.struttura_indirizzo,
    cap: s.struttura_cap,
    comune: s.struttura_comune,
    provincia: s.struttura_provincia,
    email: s.struttura_email,
    telefono: s.struttura_telefono,
  };
  const mancanti = ['ragione_sociale', 'partita_iva', 'indirizzo', 'cap', 'comune'].filter(
    (k) => !c[k],
  );
  if (mancanti.length) {
    throw nonElaborabile(
      'DATI_FISCALI_STRUTTURA_MANCANTI',
      `Completa i dati fiscali della struttura nelle impostazioni: ${mancanti.join(', ')}`,
      { campi: mancanti },
    );
  }
  return c;
}

function documentoPdf(f, c, origine) {
  const { riepilogo } = fpa.totali(f.righe, f.imposta);
  const titolo = f.tipo_documento === 'TD04' ? 'Nota di credito' : 'Fattura';
  const cliente = f.cliente_denominazione || `${f.cliente_nome} ${f.cliente_cognome}`;
  const cella = (testo, extra = {}) => ({ text: String(testo), ...extra });
  const destra = { alignment: 'right' };
  return {
    defaultStyle: { font: 'Helvetica', fontSize: 9 },
    pageMargins: [40, 40, 40, 60],
    footer: {
      text: 'Copia di cortesia. L’originale è la fattura elettronica trasmessa al Sistema di Interscambio.',
      alignment: 'center',
      fontSize: 7,
      color: '#666',
    },
    content: [
      {
        columns: [
          [
            { text: c.ragione_sociale, bold: true, fontSize: 12 },
            `${c.indirizzo}, ${c.cap} ${c.comune}${c.provincia ? ` (${c.provincia})` : ''}`,
            `P.IVA ${c.partita_iva}${c.codice_fiscale ? ` · C.F. ${c.codice_fiscale}` : ''}`,
            [c.email, c.telefono].filter(Boolean).join(' · '),
          ],
          [
            {
              text: `${titolo} n. ${fpa.numeroCompleto(f)}`,
              bold: true,
              fontSize: 14,
              alignment: 'right',
            },
            { text: `del ${dataIt(f.data_emissione)}`, alignment: 'right' },
            origine
              ? {
                  text: `rif. fattura n. ${fpa.numeroCompleto(origine)} del ${dataIt(origine.data_emissione)}`,
                  alignment: 'right',
                }
              : '',
          ],
        ],
      },
      { text: 'Intestata a', margin: [0, 20, 0, 2], color: '#666' },
      { text: cliente, bold: true },
      `${f.cliente_indirizzo}, ${f.cliente_cap} ${f.cliente_comune}${f.cliente_provincia ? ` (${f.cliente_provincia})` : ''} ${f.cliente_nazione}`,
      [
        f.cliente_partita_iva && `P.IVA ${f.cliente_partita_iva}`,
        f.cliente_codice_fiscale && `C.F. ${f.cliente_codice_fiscale}`,
      ]
        .filter(Boolean)
        .join(' · '),
      {
        margin: [0, 20, 0, 10],
        table: {
          headerRows: 1,
          widths: ['*', 40, 60, 40, 60],
          body: [
            ['Descrizione', 'Q.tà', 'Prezzo', 'IVA', 'Importo'].map((h) =>
              cella(h, { bold: true }),
            ),
            ...f.righe.map((r) => [
              cella(r.descrizione),
              cella(Number(r.quantita), destra),
              cella(formatoEuro(r.prezzo_unitario), destra),
              cella(r.natura ?? `${Number(r.aliquota_iva)}%`, destra),
              cella(formatoEuro(r.totale ?? r.quantita * r.prezzo_unitario), destra),
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
      },
      {
        columns: [
          {
            width: '*',
            table: {
              body: [
                ['Aliquota', 'Imponibile', 'Imposta'].map((h) => cella(h, { bold: true })),
                ...riepilogo.map((g) => [
                  cella(
                    g.natura
                      ? `${g.natura}${g.natura === 'N1' ? ' (art. 15)' : ''}`
                      : `${g.aliquota_iva}%`,
                  ),
                  cella(formatoEuro(g.imponibile), destra),
                  cella(formatoEuro(g.imposta), destra),
                ]),
              ],
            },
            layout: 'noBorders',
          },
          {
            width: 180,
            table: {
              widths: ['*', 80],
              body: [
                ['Imponibile', cella(formatoEuro(f.imponibile), destra)],
                ['IVA', cella(formatoEuro(f.imposta), destra)],
                ['Non imponibile / escluso', cella(formatoEuro(f.importo_esente), destra)],
                [
                  cella('Totale', { bold: true }),
                  cella(formatoEuro(f.totale), { ...destra, bold: true }),
                ],
              ],
            },
            layout: 'noBorders',
          },
        ],
      },
      c.regime_fiscale === 'RF19'
        ? {
            text: 'Operazione in franchigia da IVA ai sensi dell’art. 1, commi 54-89, L. 190/2014.',
            margin: [0, 10, 0, 0],
            fontSize: 8,
          }
        : '',
      f.note ? { text: f.note, margin: [0, 10, 0, 0], color: '#444' } : '',
    ],
  };
}

/** XML + PDF su disco, percorsi salvati sulla fattura. */
async function generaFile(id, c, transaction) {
  const f = await trova(id, transaction);
  const origine = f.fattura_origine_id ? await trova(f.fattura_origine_id, transaction) : null;
  const nomeXml = fpa.nomeFile(c.partita_iva, f.id);
  const cartella = `fatture/${f.anno}`;
  const percorsoXml = await file.salva(`${cartella}/${nomeXml}`, fpa.xml(f, c, origine));
  const pdf = await pdfmake.createPdf(documentoPdf(f, c, origine)).getBuffer();
  const percorsoPdf = await file.salva(
    `${cartella}/${f.tipo_documento}-${f.anno}-${f.sezionale || ''}${f.numero}.pdf`,
    pdf,
  );
  await f.update(
    { nome_file_xml: nomeXml, percorso_xml: percorsoXml, percorso_pdf: percorsoPdf },
    { transaction },
  );
  return f;
}

async function inviaAlCliente(id) {
  try {
    const f = await Fattura.findByPk(id, {
      include: [
        { model: Prenotazione, as: 'prenotazione', include: [{ model: Ospite, as: 'titolare' }] },
      ],
    });
    const destinatario = f.prenotazione?.titolare;
    if (!destinatario?.email || !f.percorso_pdf) return;
    await email.invia({
      a: destinatario.email,
      modello: 'fattura_emessa',
      lingua: destinatario.lingua,
      dati: { nome: destinatario.nome, numero: fpa.numeroCompleto(f) },
      allegati: [
        {
          filename: `fattura-${f.anno}-${f.numero}.pdf`,
          path: file.percorsoAssoluto(f.percorso_pdf),
        },
      ],
    });
  } catch (err) {
    logger.warn('Invio fattura al cliente non riuscito', { fattura: id, errore: err.message });
  }
}

/**
 * Emette la bozza: il DB assegna anno e numero, poi si generano i file.
 * Gli incassi della prenotazione senza documento fiscale prendono il numero della fattura.
 */
async function emetti(id, contesto) {
  const c = await cedente();
  await transazione(contesto, async (t) => {
    const f = await trova(id, t);
    if (f.stato_sdi !== 'bozza')
      throw conflitto('FATTURA_GIA_EMESSA', 'La fattura è già stata emessa');
    if (!f.righe.length || f.totale <= 0)
      throw nonElaborabile('FATTURA_VUOTA', 'La fattura non ha importi');
    await f.update({ stato_sdi: 'da_inviare', data_emissione: oggi() }, { transaction: t });
    await f.reload({ transaction: t });
    await generaFile(id, c, t);
    if (f.prenotazione_id && f.tipo_documento === 'TD01') {
      await Pagamento.update(
        { documento_fiscale: `Fattura ${fpa.numeroCompleto(f)}` },
        {
          where: {
            prenotazione_id: f.prenotazione_id,
            documento_fiscale: null,
            stato: 'completato',
            tipo: { [Op.ne]: 'rimborso' },
          },
          transaction: t,
        },
      );
    }
  });
  await inviaAlCliente(id);
  return trova(id);
}

/**
 * Nota di credito (TD04) che storna la fattura, per intero o con le righe indicate.
 * Nasce già emessa.
 */
async function notaDiCredito(id, { motivo, righe } = {}, contesto) {
  const c = await cedente();
  const notaId = await transazione(contesto, async (t) => {
    const origine = await trova(id, t);
    if (origine.stato_sdi === 'bozza' || origine.tipo_documento !== 'TD01') {
      throw conflitto('NON_STORNABILE', 'Si storna solo una fattura emessa');
    }
    const giaStornato =
      (await Fattura.sum('totale', { where: { fattura_origine_id: id }, transaction: t })) ?? 0;
    const nuoveRighe = (righe ?? origine.righe).map((r, i) => ({
      descrizione: r.descrizione,
      quantita: r.quantita ?? 1,
      prezzo_unitario: r.prezzo_unitario,
      aliquota_iva: r.aliquota_iva,
      natura: r.natura ?? null,
      ordine: i,
    }));
    const importi = fpa.totali(nuoveRighe, righe ? undefined : origine.imposta);
    if (importi.totale + giaStornato > origine.totale + 0.005) {
      throw nonElaborabile(
        'STORNO_OLTRE_IL_TOTALE',
        `Puoi stornare al massimo ${formatoEuro(origine.totale - giaStornato)}`,
      );
    }

    const campiCliente = Object.fromEntries(
      Object.keys(origine.get())
        .filter((k) => k.startsWith('cliente_') || k === 'codice_destinatario' || k === 'pec')
        .map((k) => [k, origine[k]]),
    );
    const nota = await Fattura.create(
      {
        ...campiCliente,
        prenotazione_id: origine.prenotazione_id,
        fattura_origine_id: origine.id,
        tipo_documento: 'TD04',
        sezionale: origine.sezionale,
        data_emissione: oggi(),
        imponibile: importi.imponibile,
        imposta: importi.imposta,
        importo_esente: importi.importo_esente,
        totale: importi.totale,
        note: motivo
          ? `Storno fattura ${fpa.numeroCompleto(origine)}: ${motivo}`
          : `Storno fattura ${fpa.numeroCompleto(origine)}`,
        creato_da: contesto?.utenteId ?? null,
      },
      { transaction: t },
    );
    await FatturaRiga.bulkCreate(
      nuoveRighe.map((r) => ({ ...r, fattura_id: nota.id })),
      { transaction: t },
    );
    await nota.update({ stato_sdi: 'da_inviare' }, { transaction: t });
    await generaFile(nota.id, c, t);
    return nota.id;
  });
  await inviaAlCliente(notaId);
  return trova(notaId);
}

/** Esito della trasmissione (dall'intermediario SDI o inserito a mano). */
async function aggiornaSdi(id, { stato_sdi: stato, id_sdi: idSdi, esito_sdi: esito }, contesto) {
  if (!STATI_SDI.includes(stato))
    throw richiestaNonValida('STATO_SDI_NON_VALIDO', 'Stato SDI non valido');
  await transazione(contesto, async (t) => {
    const f = await trova(id, t);
    if (f.stato_sdi === 'bozza')
      throw conflitto('FATTURA_NON_EMESSA', 'La fattura non è ancora emessa');
    await f.update(
      { stato_sdi: stato, id_sdi: idSdi ?? f.id_sdi, esito_sdi: esito ?? f.esito_sdi },
      { transaction: t },
    );
  });
  return trova(id);
}

/** Rigenera XML e PDF (es. dopo aver corretto i dati della struttura). */
async function rigeneraFile(id, contesto) {
  const c = await cedente();
  const f = await trova(id);
  if (f.stato_sdi === 'bozza')
    throw conflitto('FATTURA_NON_EMESSA', 'La fattura non è ancora emessa');
  await transazione(contesto, (t) => generaFile(id, c, t));
  return trova(id);
}

module.exports = {
  elenco,
  dettaglio,
  percorsoFile,
  filePerCliente,
  bozzaDaPrenotazione,
  aggiornaBozza,
  eliminaBozza,
  emetti,
  notaDiCredito,
  aggiornaSdi,
  rigeneraFile,
};
