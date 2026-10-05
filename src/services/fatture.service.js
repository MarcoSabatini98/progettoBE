// src/services/fatture.service.js
//
// Fatture elettroniche della struttura.
//   bozza (dalla prenotazione, modificabile)
//   → emissione: il DB assegna il numero, si generano XML FatturaPA e PDF,
//     il cliente riceve il PDF per email
//   → esito dello SDI.
// Dopo l'emissione il DB blocca ogni modifica: si corregge con una nota di credito (TD04).
// ponytail: la trasmissione allo SDI la fa l'intermediario; qui si registra l'esito.

const { transazione } = require('../models');
const logger = require('../config/logger');
const fattureRepo = require('../repositories/fatture.repository');
const pagamentiRepo = require('../repositories/pagamenti.repository');
const prenotazioniRepo = require('../repositories/prenotazioni.repository');
const impostazioni = require('./impostazioni.service');
const email = require('./email.service');
const notifiche = require('./notifiche.service');
const fatturaPa = require('./helpers/fattura-pa');
const { documentoFattura } = require('./helpers/fattura-pdf');
const { STATI_SDI } = require('../constants/pagamenti.constants');
const { PERMESSI } = require('../constants/ruoli.constants');
const { CARTELLE_UPLOAD } = require('../constants/sistema.constants');
const {
  nonTrovato,
  conflitto,
  nonElaborabile,
  vietato,
  richiestaNonValida,
} = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { centesimi, euro, formatoEuro } = require('../utils/denaro');
const { oggi, dataItaliana } = require('../utils/date');
const { creaPdf } = require('../utils/pdf');
const file = require('../utils/file');

// Stati impostabili con l'esito dello SDI (la bozza no).
const ESITI_SDI = STATI_SDI.filter((stato) => stato !== 'bozza');

async function fatturaOppure404(id, transaction = null) {
  const fattura = await fattureRepo.trovaFatturaPerId(id, transaction);
  if (!fattura) {
    throw nonTrovato('FATTURA_NON_TROVATA', 'Fattura non trovata');
  }
  return fattura;
}

function richiediBozza(fattura) {
  if (fattura.stato_sdi !== 'bozza') {
    throw conflitto('FATTURA_NON_MODIFICABILE', 'La fattura è già emessa');
  }
}

function richiediEmessa(fattura) {
  if (fattura.stato_sdi === 'bozza') {
    throw conflitto('FATTURA_NON_EMESSA', 'La fattura non è ancora emessa');
  }
}

// ─────────────────────────────────────
// Lettura
// ─────────────────────────────────────

async function elenco(query) {
  const p = pagina(query);
  const trovate = await fattureRepo.trovaFatture(query, p);
  return risultato(trovate, p);
}

async function dettaglio(id) {
  return await fatturaOppure404(id);
}

/** Percorso su disco e nome del file (pdf o xml) da scaricare. */
function fileDellaFattura(fattura, tipo) {
  const percorso = tipo === 'xml' ? fattura.percorso_xml : fattura.percorso_pdf;
  if (!percorso) {
    throw conflitto('FILE_NON_DISPONIBILE', "Il file si genera all'emissione della fattura");
  }
  const nome =
    tipo === 'xml' ? fattura.nome_file_xml : `fattura-${fattura.anno}-${fattura.numero}.pdf`;
  return { percorso: file.percorsoAssoluto(percorso), nome };
}

async function percorsoFile(id, tipo = 'pdf') {
  const fattura = await fatturaOppure404(id);
  return fileDellaFattura(fattura, tipo);
}

/** File per il cliente: solo le sue fatture e solo se emesse. */
async function filePerCliente(id, utenteId, tipo = 'pdf') {
  const fattura = await fattureRepo.trovaFatturaConTitolare(id);
  const sua = fattura?.prenotazione?.utente_id === utenteId;
  if (!fattura || !sua || fattura.stato_sdi === 'bozza') {
    throw vietato('FATTURA_ALTRUI', 'Questa fattura non è tua');
  }
  return fileDellaFattura(fattura, tipo);
}

// ─────────────────────────────────────
// Intestatario
// ─────────────────────────────────────

/** Intestatario dall'anagrafica del titolare. */
function intestatarioDaOspite(ospite) {
  return {
    nome: ospite?.nome,
    cognome: ospite?.cognome,
    codice_fiscale: ospite?.codice_fiscale,
    indirizzo: ospite?.indirizzo,
    cap: ospite?.cap,
    comune: ospite?.citta,
    provincia: ospite?.provincia,
    nazione: ospite?.paese || 'IT',
  };
}

/** Intestatario già salvato su una fattura. */
function intestatarioDaFattura(fattura) {
  return {
    denominazione: fattura.cliente_denominazione,
    nome: fattura.cliente_nome,
    cognome: fattura.cliente_cognome,
    codice_fiscale: fattura.cliente_codice_fiscale,
    partita_iva: fattura.cliente_partita_iva,
    indirizzo: fattura.cliente_indirizzo,
    cap: fattura.cliente_cap,
    comune: fattura.cliente_comune,
    provincia: fattura.cliente_provincia,
    nazione: fattura.cliente_nazione,
    codice_destinatario: fattura.codice_destinatario,
    pec: fattura.pec,
  };
}

// Solo i campi valorizzati sostituiscono quelli di base.
function unisciIntestatario(base, modifiche = {}) {
  const unito = { ...base };
  for (const [campo, valore] of Object.entries(modifiche)) {
    if (valore != null) {
      unito[campo] = valore;
    }
  }
  unito.nazione = String(unito.nazione || 'IT').toUpperCase();
  // Un'azienda si intesta con la denominazione, non con nome e cognome.
  if (unito.denominazione) {
    unito.nome = null;
    unito.cognome = null;
  }
  return unito;
}

function controllaIntestatario(cliente) {
  const mancanti = ['indirizzo', 'cap', 'comune'].filter((campo) => !cliente[campo]);
  if (!cliente.denominazione && (!cliente.nome || !cliente.cognome)) {
    mancanti.push('nome e cognome o denominazione');
  }
  if (cliente.nazione === 'IT' && !cliente.codice_fiscale && !cliente.partita_iva) {
    mancanti.push('codice_fiscale o partita_iva');
  }
  if (cliente.denominazione && !cliente.partita_iva) {
    mancanti.push('partita_iva');
  }
  if (mancanti.length > 0) {
    throw nonElaborabile(
      'DATI_FATTURAZIONE_MANCANTI',
      `Mancano dati per la fattura: ${mancanti.join(', ')}`,
      { campi: mancanti },
    );
  }
}

/** Intestatario → colonne della tabella fatture. */
function colonneIntestatario(cliente) {
  return {
    cliente_denominazione: cliente.denominazione ?? null,
    cliente_nome: cliente.nome ?? null,
    cliente_cognome: cliente.cognome ?? null,
    cliente_codice_fiscale: cliente.codice_fiscale ?? null,
    cliente_partita_iva: cliente.partita_iva ?? null,
    cliente_indirizzo: cliente.indirizzo,
    cliente_cap: cliente.cap,
    cliente_comune: cliente.comune,
    cliente_provincia: cliente.provincia ?? null,
    cliente_nazione: cliente.nazione,
    // Senza codice destinatario lo SDI recapita nel cassetto fiscale.
    codice_destinatario: (cliente.codice_destinatario || '0000000').toUpperCase(),
    pec: cliente.pec ?? null,
  };
}

// ─────────────────────────────────────
// Bozza
// ─────────────────────────────────────

/** Aliquota IVA della voce: il regime forfettario (RF19) non applica IVA. */
async function regoleIva() {
  const valori = await impostazioni.leggiMolte([
    'iva_soggiorno',
    'iva_servizi',
    'struttura_regime_fiscale',
  ]);
  const forfettario = valori.struttura_regime_fiscale === 'RF19';

  function iva(aliquota) {
    if (forfettario) {
      return { aliquota_iva: 0, natura: 'N2.2' };
    }
    return { aliquota_iva: Number(aliquota) };
  }

  return {
    soggiorno: iva(valori.iva_soggiorno),
    servizio: (aliquotaServizio) => iva(aliquotaServizio ?? valori.iva_servizi),
    // Tassa di soggiorno e penali sono fuori campo IVA (art. 15).
    fuoriCampo: { aliquota_iva: 0, natura: 'N1' },
  };
}

/** Voci IVA inclusa della prenotazione: soggiorno, pacchetto, extra, tassa o penale. */
async function vociDellaPrenotazione(prenotazione) {
  const iva = await regoleIva();

  if (prenotazione.stato === 'no_show') {
    return [
      {
        descrizione: `Penale per mancato arrivo prenotazione ${prenotazione.codice}`,
        lordo: prenotazione.totale - prenotazione.tassa_soggiorno,
        ...iva.fuoriCampo,
      },
    ];
  }
  if (prenotazione.stato === 'cancellata') {
    return [
      {
        descrizione: `Penale per cancellazione prenotazione ${prenotazione.codice}`,
        lordo: prenotazione.penale_applicata,
        ...iva.fuoriCampo,
      },
    ];
  }

  const sconti =
    prenotazione.sconto_promozione + prenotazione.sconto_codice + prenotazione.sconto_fedelta;
  let soggiorno =
    `Soggiorno in ${prenotazione.camera.tipologia.nome}` +
    ` dal ${dataItaliana(prenotazione.data_arrivo)} al ${dataItaliana(prenotazione.data_partenza)}` +
    ` (${prenotazione.notti} notti, ${prenotazione.adulti + prenotazione.bambini} ospiti)`;
  if (sconti > 0) {
    soggiorno += `, sconti inclusi ${formatoEuro(sconti)}`;
  }

  const voci = [
    { descrizione: soggiorno, lordo: prenotazione.importo_soggiorno - sconti, ...iva.soggiorno },
  ];
  if (prenotazione.importo_pacchetto > 0) {
    voci.push({
      descrizione: `Pacchetto ${prenotazione.pacchetto?.nome ?? ''}`.trim(),
      lordo: prenotazione.importo_pacchetto,
      ...iva.soggiorno,
    });
  }
  for (const riga of prenotazione.righe_servizi) {
    const nome = riga.servizio.nome;
    voci.push({
      descrizione: riga.quantita > 1 ? `${nome} × ${riga.quantita}` : nome,
      lordo: riga.totale,
      ...iva.servizio(riga.servizio.aliquota_iva),
    });
  }
  if (prenotazione.tassa_soggiorno > 0) {
    voci.push({
      descrizione: 'Imposta di soggiorno',
      lordo: prenotazione.tassa_soggiorno,
      ...iva.fuoriCampo,
    });
  }
  return voci;
}

function fatturabile(prenotazione) {
  if (['in_soggiorno', 'conclusa', 'no_show'].includes(prenotazione.stato)) {
    return true;
  }
  return prenotazione.stato === 'cancellata' && prenotazione.penale_applicata > 0;
}

/**
 * Bozza dalla prenotazione (a soggiorno iniziato o concluso, o per la penale).
 * Una bozza già presente viene sostituita.
 * cliente: dati di fatturazione diversi dal titolare (azienda, P.IVA, SDI, PEC).
 */
async function bozzaDaPrenotazione(prenotazioneId, cliente, contesto) {
  const bozza = await transazione(contesto, async (transaction) => {
    if (!(await prenotazioniRepo.bloccaPrenotazione(prenotazioneId, transaction))) {
      throw nonTrovato('PRENOTAZIONE_NON_TROVATA', 'Prenotazione non trovata');
    }
    const prenotazione = await fattureRepo.trovaPrenotazioneDaFatturare(
      prenotazioneId,
      transaction,
    );
    if (!fatturabile(prenotazione)) {
      throw conflitto('NON_FATTURABILE', 'La prenotazione non ha ancora nulla da fatturare');
    }

    // Già fatturata se le fatture emesse superano le note di credito.
    const emesse = await fattureRepo.trovaFattureEmesseDiPrenotazione(prenotazione.id, transaction);
    let fatturato = 0;
    for (const fattura of emesse) {
      const segno = fattura.tipo_documento === 'TD04' ? -1 : 1;
      fatturato += segno * centesimi(fattura.totale);
    }
    if (fatturato > 0) {
      throw conflitto(
        'FATTURA_GIA_EMESSA',
        'La prenotazione è già fatturata: per correggere emetti una nota di credito',
      );
    }

    const intestatario = unisciIntestatario(intestatarioDaOspite(prenotazione.titolare), cliente);
    controllaIntestatario(intestatario);

    const { righe, imposta } = fatturaPa.righeDaLordi(await vociDellaPrenotazione(prenotazione));
    const importi = fatturaPa.totali(righe, imposta);

    await fattureRepo.eliminaBozzeDiPrenotazione(prenotazione.id, transaction);
    return await fattureRepo.creaFattura(
      {
        prenotazione_id: prenotazione.id,
        data_emissione: oggi(),
        ...colonneIntestatario(intestatario),
        imponibile: importi.imponibile,
        imposta: importi.imposta,
        importo_esente: importi.importo_esente,
        totale: importi.totale,
        note: `Prenotazione ${prenotazione.codice}`,
        creato_da: contesto?.utenteId ?? null,
      },
      righe,
      transaction,
    );
  });
  return await fatturaOppure404(bozza.id);
}

function righeModificate(righe) {
  return righe.map((riga) => ({
    descrizione: riga.descrizione,
    quantita: riga.quantita ?? 1,
    prezzo_unitario: riga.prezzo_unitario,
    aliquota_iva: riga.aliquota_iva,
    // La natura IVA serve solo sulle righe senza imposta.
    natura: riga.aliquota_iva > 0 ? null : (riga.natura ?? null),
  }));
}

/**
 * Modifica di una bozza: intestatario, note, righe (prezzi imponibili).
 * Le righe passate sostituiscono tutte quelle presenti.
 */
async function aggiornaBozza(id, dati, contesto) {
  await transazione(contesto, async (transaction) => {
    const fattura = await fatturaOppure404(id, transaction);
    richiediBozza(fattura);

    const modifiche = {};
    if (dati.cliente) {
      const intestatario = unisciIntestatario(intestatarioDaFattura(fattura), dati.cliente);
      controllaIntestatario(intestatario);
      Object.assign(modifiche, colonneIntestatario(intestatario));
    }
    if (dati.note !== undefined) {
      modifiche.note = dati.note;
    }
    if (dati.righe) {
      if (dati.righe.length === 0) {
        throw richiestaNonValida('RIGHE_MANCANTI', 'La fattura deve avere almeno una riga');
      }
      const righe = righeModificate(dati.righe);
      const importi = fatturaPa.totali(righe);
      modifiche.imponibile = importi.imponibile;
      modifiche.imposta = importi.imposta;
      modifiche.importo_esente = importi.importo_esente;
      modifiche.totale = importi.totale;
      await fattureRepo.sostituisciRighe(id, righe, transaction);
    }

    await fattureRepo.aggiornaFattura(id, modifiche, transaction);
  });
  return await fatturaOppure404(id);
}

async function eliminaBozza(id, contesto) {
  await transazione(contesto, async (transaction) => {
    const fattura = await fatturaOppure404(id, transaction);
    if (fattura.stato_sdi !== 'bozza') {
      throw conflitto(
        'FATTURA_NON_ELIMINABILE',
        'Una fattura emessa non si elimina: emetti una nota di credito',
      );
    }
    await fattureRepo.eliminaFattura(id, transaction);
  });
}

// ─────────────────────────────────────
// Emissione
// ─────────────────────────────────────

/** Dati fiscali della struttura (cedente). Senza, non si emette. */
async function cedente() {
  const valori = await impostazioni.leggiMolte([
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
  const dati = {
    nome: valori.struttura_nome,
    ragione_sociale: valori.struttura_ragione_sociale,
    partita_iva: valori.struttura_partita_iva,
    codice_fiscale: valori.struttura_codice_fiscale,
    regime_fiscale: valori.struttura_regime_fiscale || 'RF01',
    indirizzo: valori.struttura_indirizzo,
    cap: valori.struttura_cap,
    comune: valori.struttura_comune,
    provincia: valori.struttura_provincia,
    email: valori.struttura_email,
    telefono: valori.struttura_telefono,
  };

  const obbligatori = ['ragione_sociale', 'partita_iva', 'indirizzo', 'cap', 'comune'];
  const mancanti = obbligatori.filter((campo) => !dati[campo]);
  if (mancanti.length > 0) {
    throw nonElaborabile(
      'DATI_FISCALI_STRUTTURA_MANCANTI',
      `Completa i dati fiscali della struttura nelle impostazioni: ${mancanti.join(', ')}`,
      { campi: mancanti },
    );
  }
  return dati;
}

/** Genera XML e PDF su disco e salva i percorsi sulla fattura. */
async function generaFile(id, datiCedente, transaction) {
  const fattura = await fatturaOppure404(id, transaction);
  let origine = null;
  if (fattura.fattura_origine_id) {
    origine = await fatturaOppure404(fattura.fattura_origine_id, transaction);
  }

  const cartella = `${CARTELLE_UPLOAD.fatture}/${fattura.anno}`;
  const nomeXml = fatturaPa.nomeFile(datiCedente.partita_iva, fattura.id);
  const xml = fatturaPa.xml(fattura, datiCedente, origine);
  const percorsoXml = await file.salva(`${cartella}/${nomeXml}`, xml);

  const pdf = await creaPdf(documentoFattura(fattura, datiCedente, origine));
  const nomePdf = `${fattura.tipo_documento}-${fattura.anno}-${fattura.sezionale || ''}${fattura.numero}.pdf`;
  const percorsoPdf = await file.salva(`${cartella}/${nomePdf}`, pdf);

  await fattureRepo.aggiornaFattura(
    id,
    { nome_file_xml: nomeXml, percorso_xml: percorsoXml, percorso_pdf: percorsoPdf },
    transaction,
  );
}

/** PDF al titolare della prenotazione. Un errore finisce nel log, non blocca. */
async function inviaAlCliente(id) {
  try {
    const fattura = await fattureRepo.trovaFatturaConTitolare(id);
    const titolare = fattura.prenotazione?.titolare;
    if (!titolare?.email || !fattura.percorso_pdf) {
      return;
    }
    await email.invia({
      a: titolare.email,
      modello: 'fattura_emessa',
      lingua: titolare.lingua,
      dati: { nome: titolare.nome, numero: fatturaPa.numeroCompleto(fattura) },
      allegati: [
        {
          filename: `fattura-${fattura.anno}-${fattura.numero}.pdf`,
          path: file.percorsoAssoluto(fattura.percorso_pdf),
        },
      ],
    });
  } catch (errore) {
    logger.warn('Invio fattura al cliente non riuscito', { fattura: id, errore: errore.message });
  }
}

/**
 * Emette la bozza: il DB assegna anno e numero, poi si generano i file.
 * Gli incassi della prenotazione senza documento fiscale prendono il numero della fattura.
 */
async function emetti(id, contesto) {
  const datiCedente = await cedente();

  await transazione(contesto, async (transaction) => {
    const fattura = await fatturaOppure404(id, transaction);
    if (fattura.stato_sdi !== 'bozza') {
      throw conflitto('FATTURA_GIA_EMESSA', 'La fattura è già stata emessa');
    }
    if (fattura.righe.length === 0 || fattura.totale <= 0) {
      throw nonElaborabile('FATTURA_VUOTA', 'La fattura non ha importi');
    }

    await fattureRepo.aggiornaFattura(
      id,
      { stato_sdi: 'da_inviare', data_emissione: oggi() },
      transaction,
    );
    await generaFile(id, datiCedente, transaction);

    if (fattura.prenotazione_id && fattura.tipo_documento === 'TD01') {
      const emessa = await fatturaOppure404(id, transaction);
      await pagamentiRepo.assegnaDocumentoFiscale(
        fattura.prenotazione_id,
        `Fattura ${fatturaPa.numeroCompleto(emessa)}`,
        transaction,
      );
    }
  });

  await inviaAlCliente(id);
  return await fatturaOppure404(id);
}

/**
 * Nota di credito (TD04) che storna la fattura, per intero o solo le righe
 * indicate. Nasce già emessa.
 */
async function notaDiCredito(id, { motivo, righe } = {}, contesto) {
  const datiCedente = await cedente();

  const nota = await transazione(contesto, async (transaction) => {
    const origine = await fatturaOppure404(id, transaction);
    if (origine.stato_sdi === 'bozza' || origine.tipo_documento !== 'TD01') {
      throw conflitto('NON_STORNABILE', 'Si storna solo una fattura emessa');
    }

    const righeNota = righeModificate(righe ?? origine.righe);
    // Storno totale: stessa imposta della fattura, senza differenze di arrotondamento.
    const importi = fatturaPa.totali(righeNota, righe ? undefined : origine.imposta);

    const giaStornato = centesimi(await fattureRepo.sommaStornato(id, transaction));
    const stornabile = centesimi(origine.totale) - giaStornato;
    if (centesimi(importi.totale) > stornabile) {
      throw nonElaborabile(
        'STORNO_OLTRE_IL_TOTALE',
        `Puoi stornare al massimo ${formatoEuro(euro(stornabile))}`,
      );
    }

    let note = `Storno fattura ${fatturaPa.numeroCompleto(origine)}`;
    if (motivo) {
      note += `: ${motivo}`;
    }

    const creata = await fattureRepo.creaFattura(
      {
        ...colonneIntestatario(intestatarioDaFattura(origine)),
        prenotazione_id: origine.prenotazione_id,
        fattura_origine_id: origine.id,
        tipo_documento: 'TD04',
        sezionale: origine.sezionale,
        data_emissione: oggi(),
        imponibile: importi.imponibile,
        imposta: importi.imposta,
        importo_esente: importi.importo_esente,
        totale: importi.totale,
        note,
        creato_da: contesto?.utenteId ?? null,
      },
      righeNota,
      transaction,
    );
    await fattureRepo.aggiornaFattura(creata.id, { stato_sdi: 'da_inviare' }, transaction);
    await generaFile(creata.id, datiCedente, transaction);
    return creata;
  });

  await inviaAlCliente(nota.id);
  return await fatturaOppure404(nota.id);
}

/** Esito della trasmissione (dall'intermediario SDI o inserito a mano). */
async function aggiornaSdi(id, dati, contesto) {
  const { stato_sdi: stato, id_sdi: idSdi, esito_sdi: esito } = dati;
  if (!ESITI_SDI.includes(stato)) {
    throw richiestaNonValida('STATO_SDI_NON_VALIDO', 'Stato SDI non valido');
  }

  await transazione(contesto, async (transaction) => {
    const fattura = await fatturaOppure404(id, transaction);
    richiediEmessa(fattura);
    await fattureRepo.aggiornaFattura(
      id,
      {
        stato_sdi: stato,
        id_sdi: idSdi ?? fattura.id_sdi,
        esito_sdi: esito ?? fattura.esito_sdi,
      },
      transaction,
    );
  });
  return await fatturaOppure404(id);
}

/** Rigenera XML e PDF (es. dopo aver corretto i dati della struttura). */
async function rigeneraFile(id, contesto) {
  const datiCedente = await cedente();
  richiediEmessa(await fatturaOppure404(id));

  await transazione(contesto, async (transaction) => {
    await generaFile(id, datiCedente, transaction);
  });
  return await fatturaOppure404(id);
}

/**
 * Job: avvisa chi gestisce le fatture di quelle emesse e ferme (da inviare allo SDI
 * entro 12 giorni, o scartate da riemettere entro 5). Ogni mattina finché restano.
 */
async function avvisaFermeAlloSdi() {
  const ferme = await fattureRepo.trovaFermeAlloSdi();
  if (ferme.length === 0) return { avvisati: 0 };

  const quante = (stato) => ferme.filter((fattura) => fattura.stato_sdi === stato).length;
  const parametri = { da_inviare: quante('da_inviare'), scartate: quante('scartata') };

  const destinatari = await notifiche.aChiPuo(PERMESSI.FATTURE_GESTISCI, {
    tipo: 'pagamento',
    priorita: 'avviso',
    codice: 'fatture_ferme_sdi',
    parametri,
    titolo: `Fatture ferme allo SDI: ${parametri.da_inviare} da inviare, ${parametri.scartate} scartate`,
    testo: ferme.map(fatturaPa.numeroCompleto).join(', '),
    link: ferme.length === 1 ? `/staff/fatture/${ferme[0].id}` : '/staff/fatture',
  });
  return { avvisati: destinatari.length };
}

/** Area cliente: fatture emesse per le sue prenotazioni. */
async function fattureCliente(utenteId) {
  return await fattureRepo.trovaFattureCliente(utenteId);
}

module.exports = {
  elenco,
  dettaglio,
  percorsoFile,
  filePerCliente,
  fattureCliente,
  bozzaDaPrenotazione,
  aggiornaBozza,
  eliminaBozza,
  emetti,
  notaDiCredito,
  aggiornaSdi,
  rigeneraFile,
  avvisaFermeAlloSdi,
};
