// Email transazionali via SMTP (nodemailer). Senza SMTP configurato le email
// vengono solo scritte nel log: in sviluppo si vede il contenuto senza inviarle.
// Testi in italiano e inglese: la lingua è quella del destinatario.

const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('../config/logger');
const impostazioni = require('./impostazioni.service');

let trasporto = null;

function ottieniTrasporto() {
  if (!config.smtp.attivo) return null;
  trasporto ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.porta,
    secure: config.smtp.sicuro,
    auth: config.smtp.utente ? { user: config.smtp.utente, pass: config.smtp.password } : undefined,
  });
  return trasporto;
}

const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Testi dei modelli: (dati) => { oggetto, righe[], link?, piede? } per lingua. */
const MODELLI = {
  verifica_email: {
    it: (d) => ({
      oggetto: 'Conferma il tuo indirizzo email',
      righe: [
        `Ciao ${d.nome},`,
        `il tuo codice di verifica è: ${d.codice}`,
        'Il codice scade tra 24 ore.',
      ],
    }),
    en: (d) => ({
      oggetto: 'Confirm your email address',
      righe: [
        `Hi ${d.nome},`,
        `your verification code is: ${d.codice}`,
        'The code expires in 24 hours.',
      ],
    }),
  },
  reset_password: {
    it: (d) => ({
      oggetto: 'Reimposta la password',
      righe: [
        `Ciao ${d.nome},`,
        'per scegliere una nuova password apri il link qui sotto (valido 1 ora).',
        'Se non l’hai chiesto tu, ignora questa email.',
      ],
      link: d.link,
    }),
    en: (d) => ({
      oggetto: 'Reset your password',
      righe: [
        `Hi ${d.nome},`,
        'open the link below to choose a new password (valid for 1 hour).',
        'If you did not ask for it, ignore this email.',
      ],
      link: d.link,
    }),
  },
  prenotazione_ricevuta: {
    it: (d) => ({
      oggetto: `Prenotazione ${d.codice} ricevuta`,
      righe: [
        `Gentile ${d.nome},`,
        `abbiamo ricevuto la tua prenotazione ${d.codice} dal ${d.arrivo} al ${d.partenza}.`,
        `Totale: ${d.totale}. Acconto richiesto: ${d.acconto}.`,
        d.scadenza
          ? `Completa il pagamento entro il ${d.scadenza}, poi la prenotazione scade.`
          : '',
      ],
      link: d.link,
    }),
    en: (d) => ({
      oggetto: `Booking ${d.codice} received`,
      righe: [
        `Dear ${d.nome},`,
        `we received your booking ${d.codice} from ${d.arrivo} to ${d.partenza}.`,
        `Total: ${d.totale}. Deposit due: ${d.acconto}.`,
        d.scadenza
          ? `Please complete the payment by ${d.scadenza}, otherwise the booking expires.`
          : '',
      ],
      link: d.link,
    }),
  },
  prenotazione_confermata: {
    it: (d) => ({
      oggetto: `Prenotazione ${d.codice} confermata`,
      righe: [
        `Gentile ${d.nome},`,
        `la tua prenotazione ${d.codice} dal ${d.arrivo} al ${d.partenza} è confermata.`,
        `Check-in dalle ${d.checkin}, check-out entro le ${d.checkout}.`,
        d.link
          ? 'Puoi fare il check-in online dal link qui sotto e risparmiare tempo all’arrivo.'
          : '',
      ],
      link: d.link,
    }),
    en: (d) => ({
      oggetto: `Booking ${d.codice} confirmed`,
      righe: [
        `Dear ${d.nome},`,
        `your booking ${d.codice} from ${d.arrivo} to ${d.partenza} is confirmed.`,
        `Check-in from ${d.checkin}, check-out by ${d.checkout}.`,
        d.link ? 'You can check in online from the link below and save time on arrival.' : '',
      ],
      link: d.link,
    }),
  },
  promemoria_checkin: {
    it: (d) => ({
      oggetto: `Ti aspettiamo il ${d.arrivo}`,
      righe: [
        `Gentile ${d.nome},`,
        `ti ricordiamo che il tuo soggiorno (prenotazione ${d.codice}) inizia il ${d.arrivo}.`,
        `Check-in dalle ${d.checkin}.`,
        d.link ? 'Completa il check-in online dal link qui sotto per fare prima all’arrivo.' : '',
      ],
      link: d.link,
    }),
    en: (d) => ({
      oggetto: `See you on ${d.arrivo}`,
      righe: [
        `Dear ${d.nome},`,
        `this is a reminder that your stay (booking ${d.codice}) starts on ${d.arrivo}.`,
        `Check-in from ${d.checkin}.`,
        d.link ? 'Complete the online check-in from the link below to save time.' : '',
      ],
      link: d.link,
    }),
  },
  prenotazione_cancellata: {
    it: (d) => ({
      oggetto: `Prenotazione ${d.codice} cancellata`,
      righe: [
        `Gentile ${d.nome},`,
        `la prenotazione ${d.codice} è stata cancellata.`,
        d.penale ? `Penale applicata: ${d.penale}.` : 'Nessuna penale applicata.',
      ],
    }),
    en: (d) => ({
      oggetto: `Booking ${d.codice} cancelled`,
      righe: [
        `Dear ${d.nome},`,
        `booking ${d.codice} has been cancelled.`,
        d.penale ? `Cancellation fee: ${d.penale}.` : 'No cancellation fee applied.',
      ],
    }),
  },
  invito_recensione: {
    it: (d) => ({
      oggetto: 'Com’è andato il soggiorno?',
      righe: [
        `Gentile ${d.nome},`,
        `grazie per aver soggiornato da noi (prenotazione ${d.codice}).`,
        'Ci farebbe piacere sapere com’è andata: puoi lasciare una recensione dal link qui sotto.',
      ],
      link: d.link,
    }),
    en: (d) => ({
      oggetto: 'How was your stay?',
      righe: [
        `Dear ${d.nome},`,
        `thank you for staying with us (booking ${d.codice}).`,
        'We would love to hear how it went: you can leave a review using the link below.',
      ],
      link: d.link,
    }),
  },
  link_pagamento: {
    it: (d) => ({
      oggetto: `Pagamento prenotazione ${d.codice}`,
      righe: [
        `Gentile ${d.nome},`,
        `puoi pagare ${d.importo} per la prenotazione ${d.codice} dal link qui sotto.`,
      ],
      link: d.link,
    }),
    en: (d) => ({
      oggetto: `Payment for booking ${d.codice}`,
      righe: [
        `Dear ${d.nome},`,
        `you can pay ${d.importo} for booking ${d.codice} using the link below.`,
      ],
      link: d.link,
    }),
  },
  fattura_emessa: {
    it: (d) => ({
      oggetto: `Fattura ${d.numero}`,
      righe: [
        `Gentile ${d.nome},`,
        `in allegato la fattura ${d.numero} relativa al tuo soggiorno.`,
        'La trovi anche nella tua area personale.',
      ],
    }),
    en: (d) => ({
      oggetto: `Invoice ${d.numero}`,
      righe: [
        `Dear ${d.nome},`,
        `please find attached invoice ${d.numero} for your stay.`,
        'You can also find it in your personal area.',
      ],
    }),
  },
  promozione: {
    it: (d) => ({
      oggetto: `Nuova offerta: ${d.offerta}`,
      righe: [
        `Ciao ${d.nome},`,
        `abbiamo una nuova offerta per i soggiorni dal ${d.dal} al ${d.al}: ${d.offerta}.`,
        d.descrizione,
        'Tutti i dettagli dal link qui sotto.',
      ],
      link: d.link,
      piede: 'Non vuoi più ricevere offerte? Disiscriviti:',
    }),
    en: (d) => ({
      oggetto: `New offer: ${d.offerta}`,
      righe: [
        `Hi ${d.nome},`,
        `we have a new offer for stays from ${d.dal} to ${d.al}: ${d.offerta}.`,
        d.descrizione,
        'All the details at the link below.',
      ],
      link: d.link,
      piede: 'No longer want our offers? Unsubscribe:',
    }),
  },
  chat_non_letti: {
    it: (d) => ({
      oggetto: 'Hai nuovi messaggi',
      righe: [
        `Ciao ${d.nome},`,
        `hai ${d.numero} messaggi non letti nella conversazione "${d.titolo}".`,
      ],
      link: d.link,
    }),
    en: (d) => ({
      oggetto: 'You have new messages',
      righe: [`Hi ${d.nome},`, `you have ${d.numero} unread messages in "${d.titolo}".`],
      link: d.link,
    }),
  },
};

function componi(modello, lingua, dati, nomeStruttura) {
  const versioni = MODELLI[modello];
  if (!versioni) throw new Error(`Modello email inesistente: ${modello}`);
  const { oggetto, righe, link, piede } = (versioni[lingua] ?? versioni.it)(dati);
  const paragrafi = righe.filter(Boolean);
  // Il piede accompagna il link di disiscrizione delle email promozionali.
  const disiscrizione = piede && dati.disiscrizione;
  const testo = [
    ...paragrafi,
    link ?? '',
    '',
    nomeStruttura,
    disiscrizione ? `\n${piede} ${dati.disiscrizione}` : '',
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">
${paragrafi.map((r) => `<p>${escape(r)}</p>`).join('\n')}
${link ? `<p><a href="${escape(link)}">${escape(link)}</a></p>` : ''}
<p style="color:#777">${escape(nomeStruttura)}</p>
${disiscrizione ? `<p style="color:#777;font-size:12px">${escape(piede)} <a href="${escape(dati.disiscrizione)}">${escape(dati.disiscrizione)}</a></p>` : ''}</div>`;
  return { oggetto: nomeStruttura ? `${oggetto} – ${nomeStruttura}` : oggetto, testo, html };
}

/**
 * Invia un'email da modello. Non lancia mai: un'email persa non deve far
 * fallire una prenotazione già salvata. Restituisce true se è partita.
 * @param {{ a: string, modello: keyof MODELLI, lingua?: string, dati: object, allegati?: object[] }} p
 */
async function invia({ a, modello, lingua = 'it', dati, allegati }) {
  try {
    const nomeStruttura = await impostazioni.leggi('struttura_nome', '');
    const { oggetto, testo, html } = componi(modello, lingua, dati, nomeStruttura);
    const smtp = ottieniTrasporto();
    if (!smtp) {
      logger.info('Email non inviata (SMTP non configurato)', { a, oggetto, testo });
      return false;
    }
    const consegna = await smtp.sendMail({
      from: config.smtp.mittente || config.smtp.utente,
      to: a,
      subject: oggetto,
      text: testo,
      html,
      attachments: allegati,
      // I programmi di posta mostrano il loro pulsante "Annulla iscrizione".
      list: dati?.disiscrizione ? { unsubscribe: dati.disiscrizione } : undefined,
    });
    // Accettata dal server SMTP: l'esito della consegna lo dice il provider.
    logger.info('Email inviata', { a, oggetto, id: consegna.messageId });
    return true;
  } catch (err) {
    logger.error('Invio email fallito', { a, modello, errore: err.message });
    return false;
  }
}

module.exports = { invia, componi, MODELLI };
