// Calcoli e XML della fattura elettronica (FatturaPA FPR12, verso privati).
// Funzioni pure: niente DB, così si testano da sole.

const { centesimi, euro } = require('../../utils/denaro');

const importo = (valore) => Number(valore).toFixed(2);
const escapa = (testo) =>
  String(testo ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
const tag = (nome, valore) =>
  valore === undefined || valore === null || valore === ''
    ? ''
    : `<${nome}>${escapa(valore)}</${nome}>`;
const blocco = (nome, ...figli) => `<${nome}>${figli.join('')}</${nome}>`;

/** "12/2026" oppure "12/B/2026" con sezionale. */
const numeroCompleto = (f) => [f.numero, f.sezionale || null, f.anno].filter(Boolean).join('/');

const chiaveGruppo = (r) => `${Number(r.aliquota_iva)}|${r.natura ?? ''}`;
const impostaDi = (imponibileCent, aliquota) => Math.round((imponibileCent * aliquota) / 100);

/**
 * Riepilogo per aliquota/natura e totali del documento, dalle righe.
 * Con `impostaEsatta` (fatture generate da prezzi IVA inclusa) lo scarto di
 * arrotondamento, massimo 1 cent per aliquota come tollera lo SDI, va sul gruppo maggiore.
 * @param {{ quantita: number, prezzo_unitario: number, aliquota_iva: number, natura?: string }[]} righe
 * @param {number} [impostaEsatta]  euro
 * @returns {{ riepilogo: { aliquota_iva: number, natura: string|null, imponibile: number, imposta: number }[],
 *   imponibile: number, imposta: number, importo_esente: number, totale: number }} in euro
 */
function totali(righe, impostaEsatta) {
  const gruppi = new Map();
  for (const r of righe) {
    const g = gruppi.get(chiaveGruppo(r)) ?? {
      aliquota_iva: Number(r.aliquota_iva),
      natura: r.natura ?? null,
      cent: 0,
    };
    g.cent += Math.round(Number(r.quantita) * centesimi(r.prezzo_unitario));
    gruppi.set(chiaveGruppo(r), g);
  }
  const conIva = [...gruppi.values()].filter((g) => g.aliquota_iva > 0);
  for (const g of conIva) g.imposta = impostaDi(g.cent, g.aliquota_iva);
  const scarto =
    impostaEsatta == null
      ? 0
      : centesimi(impostaEsatta) - conIva.reduce((s, g) => s + g.imposta, 0);
  if (scarto && Math.abs(scarto) <= conIva.length)
    conIva.reduce((a, b) => (b.cent > a.cent ? b : a)).imposta += scarto;

  const riepilogo = [...gruppi.values()].map((g) => ({
    aliquota_iva: g.aliquota_iva,
    natura: g.natura,
    imponibile: euro(g.cent),
    imposta: euro(g.imposta ?? 0),
  }));
  const imponibile = conIva.reduce((s, g) => s + g.cent, 0);
  const imposta = conIva.reduce((s, g) => s + g.imposta, 0);
  const esente = [...gruppi.values()].reduce((s, g) => s + (g.aliquota_iva > 0 ? 0 : g.cent), 0);
  return {
    riepilogo,
    imponibile: euro(imponibile),
    imposta: euro(imposta),
    importo_esente: euro(esente),
    totale: euro(imponibile + imposta + esente),
  };
}

/**
 * Righe da importi IVA inclusa (prezzi al pubblico): scorpora l'IVA per riga.
 * `imposta` = lordo − imponibile, da passare a totali() perché il documento
 * torni esattamente al lordo incassato.
 * @param {{ descrizione: string, lordo: number, aliquota_iva: number, natura?: string }[]} voci  lordo in euro
 * @returns {{ righe: object[], imposta: number }}
 */
function righeDaLordi(voci) {
  const righe = voci
    .filter((v) => centesimi(v.lordo) !== 0)
    .map((v, i) => ({
      descrizione: v.descrizione,
      quantita: 1,
      cent:
        v.aliquota_iva > 0
          ? Math.round(centesimi(v.lordo) / (1 + v.aliquota_iva / 100))
          : centesimi(v.lordo),
      aliquota_iva: v.aliquota_iva,
      natura: v.natura ?? null,
      ordine: i,
      lordo: centesimi(v.lordo),
    }));

  const imposta = righe.filter((r) => r.aliquota_iva > 0).reduce((s, r) => s + r.lordo - r.cent, 0);
  return {
    righe: righe.map(({ cent, lordo: _lordo, ...r }) => ({ ...r, prezzo_unitario: euro(cent) })),
    imposta: euro(imposta),
  };
}

/** Progressivo d'invio (5 caratteri) e nome file SDI: IT<partita IVA>_<progressivo>.xml */
const progressivo = (id) => id.toString(36).toUpperCase().padStart(5, '0').slice(-5);
const nomeFile = (partitaIva, id) => `IT${partitaIva}_${progressivo(id)}.xml`;

function anagraficaCliente(f) {
  const idFiscale = f.cliente_partita_iva
    ? blocco(
        'IdFiscaleIVA',
        tag('IdPaese', f.cliente_nazione),
        tag('IdCodice', f.cliente_partita_iva),
      )
    : f.cliente_nazione !== 'IT'
      ? blocco('IdFiscaleIVA', tag('IdPaese', f.cliente_nazione), tag('IdCodice', '99999999999'))
      : '';
  const nome = f.cliente_denominazione
    ? tag('Denominazione', f.cliente_denominazione)
    : tag('Nome', f.cliente_nome) + tag('Cognome', f.cliente_cognome);
  return blocco(
    'DatiAnagrafici',
    idFiscale,
    f.cliente_nazione === 'IT' ? tag('CodiceFiscale', f.cliente_codice_fiscale) : '',
    blocco('Anagrafica', nome),
  );
}

/**
 * XML FPR12.
 * @param {object} f  fattura emessa con `righe`
 * @param {object} cedente  { partita_iva, codice_fiscale, ragione_sociale, regime_fiscale, indirizzo, cap, comune, provincia }
 * @param {object} [origine]  fattura stornata (per le note di credito)
 */
function xml(f, cedente, origine) {
  const { riepilogo } = totali(f.righe, f.imposta);
  const estero = f.cliente_nazione !== 'IT';
  const bollo = cedente.regime_fiscale === 'RF19' && Number(f.importo_esente) > 77.47;

  const linee = [...f.righe]
    .sort((a, b) => a.ordine - b.ordine)
    .map((r, i) =>
      blocco(
        'DettaglioLinee',
        tag('NumeroLinea', i + 1),
        tag('Descrizione', r.descrizione.slice(0, 1000)),
        tag('Quantita', Number(r.quantita).toFixed(2)),
        tag('PrezzoUnitario', importo(r.prezzo_unitario)),
        tag(
          'PrezzoTotale',
          importo(euro(Math.round(Number(r.quantita) * centesimi(r.prezzo_unitario)))),
        ),
        tag('AliquotaIVA', importo(r.aliquota_iva)),
        tag('Natura', r.natura),
      ),
    );
  const riepiloghi = riepilogo.map((g) =>
    blocco(
      'DatiRiepilogo',
      tag('AliquotaIVA', importo(g.aliquota_iva)),
      tag('Natura', g.natura),
      tag('ImponibileImporto', importo(g.imponibile)),
      tag('Imposta', importo(g.imposta)),
      g.aliquota_iva > 0 ? tag('EsigibilitaIVA', 'I') : '',
      g.natura === 'N1' ? tag('RiferimentoNormativo', 'Escluso art. 15 DPR 633/72') : '',
      g.natura === 'N2.2'
        ? tag('RiferimentoNormativo', 'Operazione in franchigia art. 1 c. 54-89 L. 190/2014')
        : '',
    ),
  );

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" ' +
    'xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    blocco(
      'FatturaElettronicaHeader',
      blocco(
        'DatiTrasmissione',
        blocco(
          'IdTrasmittente',
          tag('IdPaese', 'IT'),
          tag('IdCodice', cedente.codice_fiscale || cedente.partita_iva),
        ),
        tag('ProgressivoInvio', progressivo(f.id)),
        tag('FormatoTrasmissione', 'FPR12'),
        tag('CodiceDestinatario', estero ? 'XXXXXXX' : f.codice_destinatario),
        f.codice_destinatario === '0000000' ? tag('PECDestinatario', f.pec) : '',
      ),
      blocco(
        'CedentePrestatore',
        blocco(
          'DatiAnagrafici',
          blocco('IdFiscaleIVA', tag('IdPaese', 'IT'), tag('IdCodice', cedente.partita_iva)),
          tag('CodiceFiscale', cedente.codice_fiscale),
          blocco('Anagrafica', tag('Denominazione', cedente.ragione_sociale)),
          tag('RegimeFiscale', cedente.regime_fiscale),
        ),
        blocco(
          'Sede',
          tag('Indirizzo', cedente.indirizzo),
          tag('CAP', cedente.cap),
          tag('Comune', cedente.comune),
          tag('Provincia', cedente.provincia),
          tag('Nazione', 'IT'),
        ),
      ),
      blocco(
        'CessionarioCommittente',
        anagraficaCliente(f),
        blocco(
          'Sede',
          tag('Indirizzo', f.cliente_indirizzo),
          tag('CAP', estero ? '00000' : f.cliente_cap),
          tag('Comune', f.cliente_comune),
          estero ? '' : tag('Provincia', f.cliente_provincia),
          tag('Nazione', f.cliente_nazione),
        ),
      ),
    ) +
    blocco(
      'FatturaElettronicaBody',
      blocco(
        'DatiGenerali',
        blocco(
          'DatiGeneraliDocumento',
          tag('TipoDocumento', f.tipo_documento),
          tag('Divisa', 'EUR'),
          tag('Data', f.data_emissione),
          tag('Numero', numeroCompleto(f)),
          bollo ? blocco('DatiBollo', tag('BolloVirtuale', 'SI'), tag('ImportoBollo', '2.00')) : '',
          tag('ImportoTotaleDocumento', importo(f.totale)),
          tag('Causale', f.note?.slice(0, 200)),
        ),
        origine
          ? blocco(
              'DatiFattureCollegate',
              tag('IdDocumento', numeroCompleto(origine)),
              tag('Data', origine.data_emissione),
            )
          : '',
      ),
      blocco('DatiBeniServizi', ...linee, ...riepiloghi),
    ) +
    '</p:FatturaElettronica>'
  );
}

module.exports = { totali, righeDaLordi, xml, nomeFile, numeroCompleto };
