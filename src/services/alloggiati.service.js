// Alloggiati Web (Polizia di Stato): schedine degli ospiti entro 24 ore dall'arrivo.
// Genera il file a tracciato fisso da caricare sul portale e registra gli invii.
// ponytail: il collegamento diretto al web service arriverà con i connettori;
// intanto il file si carica a mano dal portale ("Invio da file").

const { Op } = require('sequelize');
const { Prenotazione, Ospite, InvioAlloggiati, Utente } = require('../models');
const { oppure404, nonElaborabile } = require('../utils/errori');
const { contaNotti, oggi, aggiungiGiorni } = require('../utils/date');
const { campiMancanti } = require('./ospiti.service');

const CODICI_TIPO = {
  ospite_singolo: '16',
  capofamiglia: '17',
  capogruppo: '18',
  familiare: '19',
  membro_gruppo: '20',
};
const CON_DOCUMENTO = ['ospite_singolo', 'capofamiglia', 'capogruppo'];
const ITALIA = '100000100';
const LUNGHEZZA = 168;

/** Maiuscolo senza accenti, tagliato e allineato a sinistra con spazi. */
const campo = (valore, lunghezza) =>
  String(valore ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .slice(0, lunghezza)
    .padEnd(lunghezza, ' ');

const dataIt = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

/**
 * Una riga del tracciato (168 caratteri).
 * @param {object} o  ospite
 * @param {{ data_arrivo: string, data_partenza: string }} p  prenotazione
 * @param {string} tipo  tipo_alloggiato
 */
function schedina(o, p, tipo) {
  const natoInItalia = o.stato_nascita_codice === ITALIA;
  const documento = CON_DOCUMENTO.includes(tipo);
  const riga = [
    campo(CODICI_TIPO[tipo], 2),
    campo(dataIt(p.data_arrivo), 10),
    // ponytail: il portale accetta al massimo 30 giorni, i soggiorni più lunghi si rinnovano
    campo(String(Math.min(contaNotti(p.data_arrivo, p.data_partenza), 30)).padStart(2, '0'), 2),
    campo(o.cognome, 50),
    campo(o.nome, 30),
    campo(o.sesso === 'F' ? '2' : '1', 1),
    campo(dataIt(o.data_nascita), 10),
    campo(natoInItalia ? o.comune_nascita_codice : '', 9),
    campo(natoInItalia ? o.provincia_nascita : '', 2),
    campo(o.stato_nascita_codice, 9),
    campo(o.cittadinanza_codice, 9),
    campo(documento ? o.tipo_documento : '', 5),
    campo(documento ? o.numero_documento : '', 20),
    campo(documento ? o.luogo_rilascio_codice : '', 9),
  ].join('');
  if (riga.length !== LUNGHEZZA) throw new Error(`Schedina di ${riga.length} caratteri`);
  return riga;
}

// il capofamiglia/capogruppo va prima dei suoi familiari/membri
const ordine = (tipo) => (CON_DOCUMENTO.includes(tipo) ? 0 : 1);

/** Ospiti della prenotazione con schedina, campi mancanti e ultimo invio. */
async function daPrenotazione(prenotazioneId) {
  const p = oppure404(
    await Prenotazione.findByPk(prenotazioneId, {
      attributes: ['id', 'codice', 'stato', 'data_arrivo', 'data_partenza'],
      include: [
        { model: Ospite, as: 'ospiti', through: { attributes: ['tipo_alloggiato'] } },
        {
          model: InvioAlloggiati,
          as: 'invii_alloggiati',
          include: [{ model: Utente, as: 'mittente', attributes: ['id', 'nome', 'cognome'] }],
        },
      ],
      order: [[{ model: InvioAlloggiati, as: 'invii_alloggiati' }, 'inviato_il', 'DESC']],
    }),
    'PRENOTAZIONE_NON_TROVATA',
    'Prenotazione non trovata',
  );
  const ospiti = p.ospiti
    .map((o) => {
      const tipo = o.prenotazioni_ospiti.tipo_alloggiato;
      const mancanti = campiMancanti(o, tipo);
      return {
        ospite_id: o.id,
        nome: o.nome,
        cognome: o.cognome,
        tipo_alloggiato: tipo,
        campi_mancanti: mancanti,
        schedina: mancanti.length ? null : schedina(o, p, tipo),
        ultimo_invio: p.invii_alloggiati.find((i) => i.ospite_id === o.id) ?? null,
      };
    })
    .sort((a, b) => ordine(a.tipo_alloggiato) - ordine(b.tipo_alloggiato));
  return {
    prenotazione: { id: p.id, codice: p.codice, stato: p.stato, data_arrivo: p.data_arrivo },
    completa: ospiti.length > 0 && ospiti.every((o) => o.schedina),
    ospiti,
  };
}

/**
 * File da caricare sul portale per le prenotazioni indicate (righe CRLF).
 * Rifiuta se qualche ospite ha dati mancanti, indicando chi e cosa.
 */
async function file(prenotazioniIds) {
  const schede = await Promise.all(prenotazioniIds.map(daPrenotazione));
  const incomplete = schede
    .filter((s) => !s.completa)
    .map((s) => ({
      codice: s.prenotazione.codice,
      ospiti: s.ospiti
        .filter((o) => !o.schedina)
        .map((o) => ({ nome: `${o.nome} ${o.cognome}`, campi_mancanti: o.campi_mancanti })),
    }));
  if (incomplete.length)
    throw nonElaborabile(
      'DATI_ALLOGGIATI_INCOMPLETI',
      'Completa i dati degli ospiti prima dell’invio',
      { prenotazioni: incomplete },
    );
  return {
    nome: `alloggiati_${oggi()}.txt`,
    contenuto: `${schede.flatMap((s) => s.ospiti.map((o) => o.schedina)).join('\r\n')}\r\n`,
  };
}

/** Registra l'avvenuto invio (o l'errore restituito dal portale). */
async function registraInvio(prenotazioneId, { esito = 'inviata', messaggio }, contesto) {
  const { ospiti } = await daPrenotazione(prenotazioneId);
  await InvioAlloggiati.bulkCreate(
    ospiti.map((o) => ({
      prenotazione_id: prenotazioneId,
      ospite_id: o.ospite_id,
      schedina: o.schedina ?? '',
      esito,
      messaggio: messaggio ?? null,
      inviato_da: contesto.utenteId,
    })),
  );
  return daPrenotazione(prenotazioneId);
}

/**
 * Promemoria per la reception: soggiorni iniziati negli ultimi 2 giorni senza
 * invio riuscito (la legge dà 24 ore dall'arrivo).
 */
async function daInviare() {
  const righe = await Prenotazione.findAll({
    where: {
      stato: { [Op.in]: ['in_soggiorno', 'conclusa'] },
      data_arrivo: { [Op.gte]: aggiungiGiorni(oggi(), -2) },
    },
    attributes: ['id', 'codice', 'data_arrivo', 'camera_id'],
    include: [
      {
        model: InvioAlloggiati,
        as: 'invii_alloggiati',
        where: { esito: 'inviata' },
        required: false,
        attributes: ['id'],
      },
    ],
    order: [['data_arrivo', 'ASC']],
  });
  return righe
    .filter((p) => !p.invii_alloggiati.length)
    .map(({ id, codice, data_arrivo, camera_id }) => ({ id, codice, data_arrivo, camera_id }));
}

module.exports = { schedina, daPrenotazione, file, registraInvio, daInviare };
