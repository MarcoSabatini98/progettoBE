// Amministrazione: fatture elettroniche con gli esiti dello SDI, nota di
// credito, punti fedeltà assegnati a mano, recensioni moderate e un incasso annullato.

const fattureService = require('../../src/services/fatture.service');
const fedeltaService = require('../../src/services/fedelta.service');
const recensioniService = require('../../src/services/recensioni.service');
const pagamentiService = require('../../src/services/pagamenti.service');
const ospitiService = require('../../src/services/ospiti.service');
const fattureRepo = require('../../src/repositories/fatture.repository');
const pagamentiRepo = require('../../src/repositories/pagamenti.repository');
const fatturaPa = require('../../src/services/helpers/fattura-pa');
const { contesto, giorno, momento, retrodata } = require('./comune');
const { incassa, alMomento } = require('./storico');

// ─────────────────────────────────────
// Fatture
// ─────────────────────────────────────

// Cliente estero: lo SDI vuole il codice destinatario XXXXXXX.
const ESTERO = { codice_destinatario: 'XXXXXXX' };

const NURAGHE = {
  denominazione: 'Nuraghe Software S.r.l.',
  partita_iva: '03456780921',
  codice_fiscale: '03456780921',
  indirizzo: 'Via Sonnino 12',
  cap: '09125',
  comune: 'Cagliari',
  provincia: 'CA',
  codice_destinatario: 'M5UXCR1',
  pec: 'amministrazione@pec.nuraghesoftware.example.com',
};

const SMITH_CONSULTING = {
  denominazione: 'Smith Consulting Ltd',
  partita_iva: 'GB123456789',
  indirizzo: '22 Baker Street',
  cap: 'NW1 6XE',
  comune: 'London',
  nazione: 'GB',
  codice_destinatario: 'XXXXXXX',
};

/**
 * Fatture in ordine di emissione (il DB numera per anno). `giorno`: data di
 * emissione relativa a oggi; `sdi`: esito della trasmissione, se arrivato.
 */
const FATTURE = [
  {
    prenotazione: 'mueller',
    giorno: -446,
    cliente: ESTERO,
    sdi: { stato_sdi: 'consegnata', esito_sdi: 'RC: consegnata al destinatario' },
  },
  {
    prenotazione: 'johnFamiglia',
    giorno: -327,
    cliente: SMITH_CONSULTING,
    sdi: { stato_sdi: 'consegnata', esito_sdi: 'RC: consegnata al destinatario' },
  },
  {
    prenotazione: 'cancellata',
    giorno: -225,
    cliente: {
      indirizzo: 'Via Brigata Sassari 4',
      cap: '07100',
      comune: 'Sassari',
      provincia: 'SS',
      codice_fiscale: 'PNNFNC71A12I452K',
    },
    sdi: { stato_sdi: 'consegnata', esito_sdi: 'RC: consegnata al destinatario' },
  },
  {
    prenotazione: 'noShow',
    giorno: -149,
    cliente: {
      indirizzo: 'Via Roma 210',
      cap: '09016',
      comune: 'Iglesias',
      provincia: 'SU',
      codice_fiscale: 'MLSGRG77H20E281P',
    },
    sdi: {
      stato_sdi: 'mancata_consegna',
      esito_sdi: 'MC: recapito non riuscito, fattura a disposizione nel cassetto fiscale',
    },
  },
  {
    prenotazione: 'lauraAmici',
    giorno: -87,
    sdi: { stato_sdi: 'consegnata', esito_sdi: 'RC: consegnata al destinatario' },
  },
  {
    prenotazione: 'chiara',
    giorno: -27,
    sdi: { stato_sdi: 'consegnata', esito_sdi: 'RC: consegnata al destinatario' },
  },
  {
    prenotazione: 'deVries',
    giorno: -16,
    sdi: {
      stato_sdi: 'scartata',
      esito_sdi: 'NS 00311: codice destinatario non valido per un cessionario estero',
    },
  },
  {
    prenotazione: 'johnSuite',
    giorno: -9,
    cliente: ESTERO,
    sdi: { stato_sdi: 'inviata' },
  },
  // Emessa ieri, ancora da trasmettere.
  { prenotazione: 'pala', giorno: -1, cliente: NURAGHE },
];

function idSdi() {
  return String(Math.floor(10_000_000_000 + Math.random() * 89_999_999_999));
}

/**
 * Emissione con la data di allora: `emetti` usa sempre la data di oggi e dopo
 * il DB non la lascia cambiare, quindi qui la data si fissa all'emissione.
 */
async function emessaIl(fattura, prenotazioni, ctx) {
  const prenotazione = prenotazioni[fattura.prenotazione];
  const quando = momento(fattura.giorno, '12:00');
  const bozza = await alMomento(quando, () =>
    fattureService.bozzaDaPrenotazione(prenotazione.id, fattura.cliente, ctx),
  );
  await fattureRepo.aggiornaFattura(bozza.id, {
    stato_sdi: 'da_inviare',
    data_emissione: giorno(fattura.giorno),
  });
  const emessa = await alMomento(quando, () => fattureService.rigeneraFile(bozza.id, ctx));
  await pagamentiRepo.assegnaDocumentoFiscale(
    prenotazione.id,
    `Fattura ${fatturaPa.numeroCompleto(emessa)}`,
  );
  if (fattura.sdi) {
    const esito = momento(fattura.giorno + 1, '08:00');
    await alMomento(esito, () =>
      fattureService.aggiornaSdi(bozza.id, { id_sdi: idSdi(), ...fattura.sdi }, ctx),
    );
  }
  await retrodata('fatture', { creato_il: quando }, { id: bozza.id });
  return emessa;
}

async function creaFatture(prenotazioni, ctx) {
  const emesse = {};
  for (const fattura of FATTURE) {
    emesse[fattura.prenotazione] = await emessaIl(fattura, prenotazioni, ctx);
  }

  // Oggi: storno parziale per il late check-out addebitato ma non goduto.
  const nota = await fattureService.notaDiCredito(
    emesse.johnSuite.id,
    {
      motivo: 'Late check-out non usufruito',
      righe: [{ descrizione: 'Storno late check-out', prezzo_unitario: 24.59, aliquota_iva: 22 }],
    },
    ctx,
  );
  await fattureService.aggiornaSdi(nota.id, { stato_sdi: 'inviata', id_sdi: idSdi() }, ctx);

  // La famiglia Rossi è ancora in casa: fattura preparata, da emettere alla partenza.
  await fattureService.bozzaDaPrenotazione(prenotazioni.rossi.id, undefined, ctx);
}

// ─────────────────────────────────────
// Fedeltà
// ─────────────────────────────────────

async function gestisciPunti({ clienti }, ctxAdmin) {
  await alMomento(momento(-85, '10:00'), () =>
    fedeltaService.assegnaPunti(
      clienti.laura.id,
      { punti: 50, motivo: 'bonus', note: 'Grazie per averci consigliato agli amici' },
      ctxAdmin,
    ),
  );
  await alMomento(momento(-320, '09:00'), () =>
    fedeltaService.assegnaPunti(
      clienti.john.id,
      { punti: -10, motivo: 'rettifica', note: 'Punti del transfer conteggiati due volte' },
      ctxAdmin,
    ),
  );
  await alMomento(momento(-100, '16:00'), () =>
    fedeltaService.impostaLivello(clienti.klaus.id, 'gold', ctxAdmin),
  );
  await retrodata(
    'movimenti_punti',
    { creato_il: momento(-85, '10:00') },
    { utente_id: clienti.laura.id, motivo: 'bonus' },
  );
  await retrodata(
    'movimenti_punti',
    { creato_il: momento(-320, '09:00') },
    { utente_id: clienti.john.id, motivo: 'rettifica' },
  );
  await retrodata(
    'movimenti_punti',
    { creato_il: momento(-100, '16:00') },
    { utente_id: clienti.klaus.id, motivo: 'rettifica' },
  );
}

// ─────────────────────────────────────
// Recensioni
// ─────────────────────────────────────

const VOTI_PIENI = {
  voto: 5,
  voto_pulizia: 5,
  voto_personale: 5,
  voto_posizione: 5,
  voto_comfort: 5,
  voto_qualita_prezzo: 5,
};

/**
 * cliente: chi scrive dall'area personale; senza, l'ospite usa il link
 * dell'email (codice + email). esito: moderazione dello staff, se c'è stata.
 */
const RECENSIONI = [
  {
    prenotazione: 'lauraPrimo',
    partenza: -596,
    cliente: 'laura',
    dati: {
      ...VOTI_PIENI,
      titolo: 'Come a casa',
      commento:
        'Camera luminosa, colazione con dolci fatti in casa e personale gentilissimo. Torneremo di sicuro.',
      lingua: 'it',
    },
    esito: 'pubblicata',
    risposta: 'Grazie Laura, è stato un piacere ospitarvi. Vi aspettiamo per la prossima vacanza!',
  },
  {
    prenotazione: 'klausPrimo',
    partenza: -496,
    cliente: 'klaus',
    dati: {
      voto: 4,
      voto_pulizia: 5,
      voto_personale: 5,
      voto_posizione: 3,
      voto_comfort: 4,
      voto_qualita_prezzo: 4,
      titolo: 'Ruhige Dependance',
      commento: 'Sehr ruhig und sauber. Ohne Auto ist der Weg ins Zentrum etwas lang.',
      lingua: 'de',
    },
    esito: 'pubblicata',
    risposta: 'Danke, Klaus! Gerne leihen wir Ihnen beim nächsten Mal ein Fahrrad.',
  },
  {
    prenotazione: 'johnFamiglia',
    partenza: -327,
    cliente: 'john',
    dati: {
      voto: 4,
      voto_pulizia: 4,
      voto_personale: 5,
      voto_posizione: 4,
      voto_comfort: 4,
      voto_qualita_prezzo: 5,
      titolo: 'Great with kids',
      commento:
        'The staff prepared a cot and a high chair before we arrived. Breakfast had plenty for the children.',
      lingua: 'en',
    },
    esito: 'pubblicata',
  },
  {
    prenotazione: 'sophieMare',
    partenza: -246,
    cliente: 'sophie',
    dati: {
      ...VOTI_PIENI,
      titolo: 'Séjour parfait',
      commento:
        'La suite est magnifique et le forfait mer vaut vraiment le coup. Merci pour les conseils sur les plages !',
      lingua: 'fr',
    },
    esito: 'pubblicata',
    risposta: 'Merci Sophie ! À bientôt en Sardaigne.',
  },
  {
    prenotazione: 'klausLungo',
    partenza: -113,
    cliente: 'klaus',
    dati: {
      voto: 5,
      voto_pulizia: 5,
      voto_personale: 5,
      voto_posizione: 4,
      voto_comfort: 5,
      voto_qualita_prezzo: 5,
      titolo: 'Eine Woche Erholung',
      commento: 'Wir kommen jedes Jahr wieder. Das Frühstück im Garten ist ein Traum.',
      lingua: 'de',
      anonima: true,
    },
    esito: 'pubblicata',
  },
  {
    prenotazione: 'lucia',
    partenza: -42,
    cliente: 'lucia',
    dati: {
      voto: 3,
      voto_pulizia: 4,
      voto_personale: 4,
      voto_posizione: 3,
      voto_comfort: 2,
      voto_qualita_prezzo: 3,
      titolo: 'Bien, pero ruidoso',
      commento:
        'La habitación está bien, pero se oía el tráfico por la noche. El personal muy amable.',
      lingua: 'es',
    },
    esito: 'pubblicata',
    risposta: 'Gracias, Lucía. Hemos cambiado las ventanas de las habitaciones que dan a la calle.',
  },
  {
    prenotazione: 'chiara',
    partenza: -27,
    cliente: 'chiara',
    dati: {
      voto: 1,
      titolo: 'Pessima esperienza',
      commento: 'Piscina chiusa e niente parcheggio. Sconsigliato.',
      lingua: 'it',
    },
    // La struttura non ha piscina chiusa né mancava il parcheggio: era un altro hotel.
    esito: 'rifiutata',
  },
  // Arrivate dal link dell'email, da moderare.
  {
    prenotazione: 'mueller',
    partenza: -446,
    email: 'hans.mueller@example.com',
    dati: {
      voto: 5,
      voto_pulizia: 5,
      voto_personale: 5,
      voto_posizione: 5,
      voto_comfort: 4,
      voto_qualita_prezzo: 5,
      titolo: 'Wunderbar',
      commento: 'Ein kleines Paradies mitten in Sardinien.',
      lingua: 'de',
    },
  },
  {
    prenotazione: 'johnSuite',
    partenza: -9,
    cliente: 'john',
    dati: {
      voto: 5,
      voto_pulizia: 5,
      voto_personale: 5,
      voto_comfort: 5,
      titolo: 'Back again, even better',
      commento:
        'Second stay, this time in the suite with the kids. The late check-out made our travel day much easier.',
      lingua: 'en',
    },
  },
];

async function scriviRecensione(recensione, prenotazioni, clienti) {
  const prenotazione = prenotazioni[recensione.prenotazione];
  if (recensione.cliente) {
    return await recensioniService.crea(
      prenotazione.id,
      recensione.dati,
      contesto(clienti[recensione.cliente]),
    );
  }
  return await recensioniService.creaDaCodice(
    prenotazione.codice,
    recensione.email,
    recensione.dati,
  );
}

async function creaRecensioni(prenotazioni, { clienti, staff }, ctxAdmin) {
  const ctxReception = contesto(staff.reception);
  for (const recensione of RECENSIONI) {
    const scritta = momento(recensione.partenza + 2, '20:00');
    const { id } = await alMomento(scritta, () =>
      scriviRecensione(recensione, prenotazioni, clienti),
    );
    const valori = { creato_il: scritta };
    if (recensione.esito) {
      await recensioniService.modera(id, recensione.esito, ctxAdmin);
      valori.moderata_il = momento(recensione.partenza + 3, '09:30');
    }
    if (recensione.risposta) {
      await recensioniService.rispondi(id, recensione.risposta, ctxReception);
      valori.risposta_il = momento(recensione.partenza + 3, '10:00');
    }
    await retrodata('recensioni', valori, { id });
  }
}

// ─────────────────────────────────────
// Incassi
// ─────────────────────────────────────

/** Le bevande della famiglia Rossi registrate due volte: il doppione si annulla. */
async function incassoAnnullato(prenotazioni, ctx) {
  const quando = momento(-1, '21:05');
  await alMomento(quando, async () => {
    const doppione = await incassa(
      prenotazioni.rossi,
      {
        tipo: 'extra',
        metodo: 'pos',
        importo: 12,
        riferimento: 'POS 016045',
        note: 'Bevande dal frigobar',
      },
      quando,
      ctx,
    );
    await pagamentiService.annulla(doppione.id, 'Registrato due volte', ctx);
  });
}

// ─────────────────────────────────────
// Avvio
// ─────────────────────────────────────

/** Anagrafica inserita per un preventivo mai confermato, cancellata su richiesta dell'interessata. */
async function anagraficaCancellata() {
  const ospite = await ospitiService.crea({
    nome: 'Stefania',
    cognome: 'Mura',
    email: 'stefania.mura@example.com',
    telefono: '+39 347 2233441',
    lingua: 'it',
    note: 'Preventivo per due notti ad agosto, poi ha scelto altre date.',
  });
  await retrodata('ospiti', { creato_il: momento(-75, '10:00') }, { id: ospite.id });
  await ospitiService.elimina(ospite.id);
  await retrodata('ospiti', { eliminato_il: momento(-60, '09:30') }, { id: ospite.id });
}

async function creaAmministrazione(prenotazioni, persone, ctxAdmin) {
  const ctx = contesto(persone.staff.reception);
  await incassoAnnullato(prenotazioni, ctx);
  await creaFatture(prenotazioni, ctxAdmin);
  await gestisciPunti(persone, ctxAdmin);
  await creaRecensioni(prenotazioni, persone, ctxAdmin);
  await anagraficaCancellata();
}

module.exports = { creaAmministrazione };
