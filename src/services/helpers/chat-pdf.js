// src/services/helpers/chat-pdf.js
//
// Esportazione di una conversazione in PDF (documento pdfmake), ad es. per
// allegarla a un reclamo o a una pratica.

function autore(messaggio) {
  if (messaggio.di_sistema) {
    return 'Sistema';
  }
  if (messaggio.mittente_utente) {
    return `${messaggio.mittente_utente.nome} ${messaggio.mittente_utente.cognome}`;
  }
  return messaggio.mittente_visitatore?.nome ?? 'Visitatore';
}

function orario(data) {
  return new Date(data).toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
}

function blocco(messaggio) {
  const righe = [
    { text: `${autore(messaggio)} · ${orario(messaggio.inviato_il)}`, bold: true, fontSize: 9 },
    { text: messaggio.testo },
  ];
  for (const allegato of messaggio.allegati ?? []) {
    righe.push({ text: `Allegato: ${allegato.nome_originale}`, italics: true, fontSize: 9 });
  }
  return { stack: righe, margin: [0, 0, 0, 8] };
}

/** conversazione: Conversazione; messaggi: con mittenti e allegati, in ordine. */
function documentoChat(conversazione, messaggi, nomeStruttura) {
  const titolo =
    conversazione.titolo || (conversazione.tipo === 'assistenza' ? 'Assistenza' : 'Chat');
  return {
    info: { title: titolo },
    pageMargins: [40, 40, 40, 40],
    defaultStyle: { font: 'Helvetica', fontSize: 10 },
    content: [
      { text: nomeStruttura ?? '', color: '#666' },
      { text: titolo, bold: true, fontSize: 14, margin: [0, 4, 0, 2] },
      { text: `Esportata il ${orario(new Date())}`, fontSize: 9, margin: [0, 0, 0, 16] },
      ...messaggi.map(blocco),
    ],
  };
}

module.exports = { documentoChat };
