// Contenuti del sito: dati della struttura, documenti legali, pagine, sezioni,
// foto e video, FAQ, eventi speciali e chiusure.

const impostazioniService = require('../../src/services/impostazioni.service');
const contenutiService = require('../../src/services/contenuti.service');
const contenutiRepo = require('../../src/repositories/contenuti.repository');
const calendariService = require('../../src/services/calendari.service');
const { creaPdf } = require('../../src/utils/pdf');
const file = require('../../src/utils/file');
const { CARTELLE_UPLOAD } = require('../../src/constants/sistema.constants');
const { giorno, momento, italiano, traduci, aggiungiFoto, retrodata } = require('./comune');

const LINGUE = ['it', 'en', 'fr', 'de', 'es'];

// ─────────────────────────────────────
// Dati della struttura
// ─────────────────────────────────────

const NOME_PREDEFINITO = 'Hotel Le Querce';

/** Dati fiscali e di contatto verosimili; il nome resta quello scelto nel .env. */
async function impostaStruttura(ctxAdmin) {
  const nome = (await impostazioniService.leggi('struttura_nome')) || NOME_PREDEFINITO;
  const ragioneSociale = `${nome} S.r.l.`;
  await impostazioniService.aggiorna(
    {
      struttura_nome: nome,
      struttura_ragione_sociale: ragioneSociale,
      struttura_partita_iva: '02841760917',
      struttura_codice_fiscale: '02841760917',
      struttura_indirizzo: 'Via Giuseppe Mazzini 59',
      struttura_cap: '08015',
      struttura_comune: 'Macomer',
      struttura_provincia: 'NU',
      struttura_email: 'info@example.com',
      struttura_telefono: '+39 0785 70568',
      struttura_cin: 'IT091044A1QRC7X2LM',
      struttura_iban: 'IT60X0542811101000000123456',
      struttura_intestatario_conto: ragioneSociale,
      orario_checkin: '14:00',
      orario_checkout: '11:00',
      blocco_checkout_minuti: 20,
      pulizie_autoassegna: true,
      chat_riepilogo_email_minuti: 30,
      aspetto_colore: '#5e6b3a',
      aspetto_tema: 'sistema',
    },
    ctxAdmin,
  );
  return { nome, ragioneSociale };
}

// ─────────────────────────────────────
// Documenti legali
// ─────────────────────────────────────

const TITOLI_LEGALI = {
  privacy: [
    'Informativa sulla privacy',
    'Privacy policy',
    'Politique de confidentialité',
    'Datenschutzerklärung',
    'Política de privacidad',
  ],
  termini: [
    'Termini e condizioni',
    'Terms and conditions',
    'Conditions générales',
    'Allgemeine Geschäftsbedingungen',
    'Términos y condiciones',
  ],
  cookie: [
    'Informativa sui cookie',
    'Cookie policy',
    'Politique relative aux cookies',
    'Cookie-Richtlinie',
    'Política de cookies',
  ],
};

/** Testi dei documenti, nelle cinque lingue, con i dati della struttura. */
function testiLegali({ ragioneSociale }) {
  const sede = 'Via Giuseppe Mazzini 59, 08015 Macomer (NU)';
  const email = 'info@example.com';
  return {
    privacy: [
      `Titolare del trattamento è ${ragioneSociale}, ${sede}.

Raccogliamo i dati che ci fornisci quando prenoti, ti registri o ci scrivi: nome, contatti, dati di pagamento e, all'arrivo, i dati del documento richiesti dalla legge (art. 109 TULPS).

Li usiamo per gestire il soggiorno, emettere le fatture, comunicare gli ospiti alla Questura tramite Alloggiati Web e, solo con il tuo consenso, inviarti le nostre offerte.

I dati restano in Italia, sono conservati per il tempo previsto dalla legge e non vengono venduti a terzi. Puoi chiederne copia, rettifica o cancellazione scrivendo a ${email}.`,
      `The data controller is ${ragioneSociale}, ${sede}.

We collect the data you give us when you book, sign up or write to us: name, contact details, payment details and, on arrival, the identity document details required by Italian law (art. 109 TULPS).

We use them to manage your stay, issue invoices, report guests to the police through Alloggiati Web and, only with your consent, send you our offers.

Your data stays in Italy, is kept for the period required by law and is never sold. You can ask for a copy, a correction or its deletion by writing to ${email}.`,
      `Le responsable du traitement est ${ragioneSociale}, ${sede}.

Nous collectons les données que vous nous fournissez lors de la réservation, de l'inscription ou d'un message : nom, coordonnées, données de paiement et, à l'arrivée, les données de la pièce d'identité exigées par la loi italienne (art. 109 TULPS).

Nous les utilisons pour gérer votre séjour, émettre les factures, déclarer les clients à la police via Alloggiati Web et, uniquement avec votre accord, vous envoyer nos offres.

Les données restent en Italie, sont conservées pendant la durée prévue par la loi et ne sont jamais vendues. Vous pouvez en demander une copie, la rectification ou l'effacement en écrivant à ${email}.`,
      `Verantwortlicher ist ${ragioneSociale}, ${sede}.

Wir erheben die Daten, die Sie uns bei der Buchung, der Registrierung oder in einer Nachricht mitteilen: Name, Kontaktdaten, Zahlungsdaten und bei der Ankunft die gesetzlich vorgeschriebenen Ausweisdaten (Art. 109 TULPS).

Wir verwenden sie für Ihren Aufenthalt, für Rechnungen, für die Gästemeldung an die Polizei über Alloggiati Web und, nur mit Ihrer Einwilligung, für unsere Angebote.

Die Daten bleiben in Italien, werden so lange wie gesetzlich vorgeschrieben aufbewahrt und nie verkauft. Auskunft, Berichtigung oder Löschung können Sie unter ${email} verlangen.`,
      `El responsable del tratamiento es ${ragioneSociale}, ${sede}.

Recogemos los datos que nos facilitas al reservar, registrarte o escribirnos: nombre, contacto, datos de pago y, a la llegada, los datos del documento exigidos por la ley italiana (art. 109 TULPS).

Los usamos para gestionar la estancia, emitir las facturas, comunicar los huéspedes a la policía mediante Alloggiati Web y, solo con tu consentimiento, enviarte nuestras ofertas.

Los datos permanecen en Italia, se conservan el tiempo que exige la ley y nunca se venden. Puedes pedir una copia, su rectificación o su supresión escribiendo a ${email}.`,
    ],
    termini: [
      `La prenotazione è confermata quando ricevi l'email di conferma. Le tariffe comprendono l'IVA; l'imposta di soggiorno si paga in struttura.

Cancellazione: dipende dalla tariffa scelta ed è indicata nel riepilogo prima del pagamento. Le tariffe non rimborsabili non prevedono rimborsi.

Il check-in è dalle 14:00, il check-out entro le 11:00. All'arrivo serve un documento valido per ogni ospite.

In camera non si fuma. Eventuali danni vengono addebitati. Per qualunque richiesta scrivi a ${email}.`,
      `A booking is confirmed when you receive the confirmation email. Rates include VAT; the city tax is paid at the property.

Cancellation depends on the rate you choose and is shown in the summary before payment. Non-refundable rates are not refunded.

Check-in is from 2 pm, check-out by 11 am. A valid ID is required for every guest on arrival.

Smoking is not allowed in the rooms. Any damage will be charged. For any request write to ${email}.`,
      `La réservation est confirmée à la réception de l'e-mail de confirmation. Les tarifs incluent la TVA ; la taxe de séjour se paie sur place.

L'annulation dépend du tarif choisi et figure dans le récapitulatif avant le paiement. Les tarifs non remboursables ne donnent lieu à aucun remboursement.

L'arrivée se fait à partir de 14 h, le départ avant 11 h. Une pièce d'identité valide est demandée pour chaque client.

Il est interdit de fumer dans les chambres. Les éventuels dommages sont facturés. Pour toute demande, écrivez à ${email}.`,
      `Die Buchung ist mit der Bestätigungs-E-Mail verbindlich. Die Preise enthalten die MwSt.; die Kurtaxe wird vor Ort bezahlt.

Die Stornierungsbedingungen hängen vom gewählten Tarif ab und stehen vor der Zahlung in der Übersicht. Nicht erstattbare Tarife werden nicht zurückerstattet.

Check-in ab 14 Uhr, Check-out bis 11 Uhr. Bei der Ankunft ist für jeden Gast ein gültiger Ausweis nötig.

In den Zimmern ist das Rauchen verboten. Schäden werden in Rechnung gestellt. Für Anfragen schreiben Sie an ${email}.`,
      `La reserva se confirma al recibir el correo de confirmación. Las tarifas incluyen el IVA; la tasa turística se paga en el alojamiento.

La cancelación depende de la tarifa elegida y aparece en el resumen antes del pago. Las tarifas no reembolsables no admiten reembolso.

El check-in es a partir de las 14:00 y el check-out antes de las 11:00. A la llegada se necesita un documento válido de cada huésped.

No se permite fumar en las habitaciones. Los daños se cobrarán. Para cualquier consulta escribe a ${email}.`,
    ],
    cookie: [
      `Il sito usa solo cookie tecnici, necessari per l'accesso all'area personale, la lingua scelta e il pagamento sicuro.

Non usiamo cookie di profilazione né strumenti di pubblicità di terze parti. Le statistiche di visita sono anonime e restano sui nostri server.

Puoi cancellare i cookie dalle impostazioni del browser: il sito continuerà a funzionare, ma dovrai accedere di nuovo.`,
      `The website only uses technical cookies, needed to sign in to your personal area, remember your language and pay securely.

We do not use profiling cookies or third-party advertising tools. Visit statistics are anonymous and stay on our servers.

You can delete cookies from your browser settings: the website will keep working, but you will have to sign in again.`,
      `Le site utilise uniquement des cookies techniques, nécessaires pour accéder à l'espace personnel, mémoriser la langue et payer en toute sécurité.

Nous n'utilisons ni cookies de profilage ni outils publicitaires de tiers. Les statistiques de visite sont anonymes et restent sur nos serveurs.

Vous pouvez supprimer les cookies depuis votre navigateur : le site continuera à fonctionner, mais vous devrez vous reconnecter.`,
      `Die Website verwendet nur technische Cookies für die Anmeldung im persönlichen Bereich, die gewählte Sprache und die sichere Zahlung.

Wir setzen keine Profiling-Cookies und keine Werbewerkzeuge Dritter ein. Besuchsstatistiken sind anonym und bleiben auf unseren Servern.

Sie können Cookies in den Browsereinstellungen löschen: Die Website funktioniert weiter, Sie müssen sich aber neu anmelden.`,
      `El sitio solo usa cookies técnicas, necesarias para acceder al área personal, recordar el idioma y pagar de forma segura.

No usamos cookies de perfilado ni herramientas publicitarias de terceros. Las estadísticas de visita son anónimas y se quedan en nuestros servidores.

Puedes borrar las cookies desde el navegador: el sitio seguirá funcionando, pero tendrás que volver a iniciar sesión.`,
    ],
  };
}

/** PDF del documento pubblicato, scaricabile dal sito. */
async function salvaPdf(documento, titolo) {
  const pdf = await creaPdf({
    info: { title: titolo },
    defaultStyle: { font: 'Helvetica', fontSize: 11 },
    content: [
      { text: titolo, fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
      { text: `v${documento.versione}`, color: '#666666', margin: [0, 0, 0, 16] },
      ...documento.contenuto.split('\n\n').map((paragrafo) => ({
        text: paragrafo,
        margin: [0, 0, 0, 10],
      })),
    ],
  });
  const relativo = `${CARTELLE_UPLOAD.documenti}/legali/${documento.tipo}-${documento.versione}-${documento.lingua}.pdf`;
  await contenutiRepo.aggiornaDocumentoLegale(documento.id, {
    percorso_pdf: await file.salva(relativo, pdf),
  });
}

async function pubblica(dati, ctx, quando) {
  const documento = await contenutiService.creaDocumentoLegale(dati, ctx);
  await contenutiService.pubblicaDocumentoLegale(documento.id);
  const indice = LINGUE.indexOf(dati.lingua);
  await salvaPdf({ ...dati, id: documento.id }, TITOLI_LEGALI[dati.tipo][indice]);
  await retrodata(
    'documenti_legali',
    { creato_il: momento(quando - 3), pubblicato_il: momento(quando) },
    { id: documento.id },
  );
}

/**
 * Prima dei clienti: i loro consensi puntano alle versioni pubblicate.
 * Privacy 1.0 solo in italiano, poi la 2.0 in tutte le lingue; dei termini
 * resta in bozza la 1.1.
 */
async function creaDocumentiLegali(ctxAdmin, struttura) {
  const testi = testiLegali(struttura);
  await pubblica(
    { tipo: 'privacy', versione: '1.0', lingua: 'it', contenuto: testi.privacy[0] },
    ctxAdmin,
    -720,
  );
  for (const [indice, lingua] of LINGUE.entries()) {
    for (const [tipo, versione] of [
      ['privacy', '2.0'],
      ['termini', '1.0'],
      ['cookie', '1.0'],
    ]) {
      await pubblica(
        { tipo, versione, lingua, contenuto: testi[tipo][indice] },
        ctxAdmin,
        tipo === 'privacy' ? -400 : -700,
      );
    }
  }
  await contenutiService.creaDocumentoLegale(
    {
      tipo: 'termini',
      versione: '1.1',
      lingua: 'it',
      contenuto: `${testi.termini[0]}\n\nGli animali di piccola taglia sono ammessi su richiesta, con un supplemento per la pulizia.`,
    },
    ctxAdmin,
  );
}

// ─────────────────────────────────────
// Pagine, sezioni, foto e video
// ─────────────────────────────────────

// Foto e video scelti dal cliente (database/dati/media), con una foto CC0 di
// riserva per chi clona il progetto senza quella cartella.
const SFONDI = [
  [
    'home',
    { cliente: 'home.mp4', riserva: 'struttura-vista.jpg' },
    'Sfondo della home a tema chiaro',
  ],
  [
    'home_scuro',
    { cliente: 'home-scuro.mp4', riserva: 'varie-panorama.jpg' },
    'Sfondo della home a tema scuro',
  ],
  ['logo', { cliente: 'logo.png' }, 'Logo della struttura'],
];

const PAGINE = {
  home: {
    descrizione: [
      'Un rifugio tranquillo nel cuore della Sardegna, tra querce, nuraghi e sapori di casa.',
      'A quiet retreat in the heart of Sardinia, among oaks, nuraghi and home-made flavours.',
      'Un refuge paisible au cœur de la Sardaigne, entre chênes, nuraghes et saveurs maison.',
      'Ein ruhiger Rückzugsort im Herzen Sardiniens, zwischen Eichen, Nuraghen und hausgemachten Spezialitäten.',
      'Un refugio tranquilo en el corazón de Cerdeña, entre robles, nuragas y sabores caseros.',
    ],
    testo: [
      'Undici camere, una colazione che profuma di forno e tutto il tempo che ti serve.',
      'Eleven rooms, a breakfast that smells of the oven and all the time you need.',
      'Onze chambres, un petit-déjeuner qui sent le four et tout le temps qu’il vous faut.',
      'Elf Zimmer, ein Frühstück, das nach Backofen duftet, und alle Zeit, die Sie brauchen.',
      'Once habitaciones, un desayuno que huele a horno y todo el tiempo que necesites.',
    ],
    sezioni: [
      {
        foto: { cliente: 'sezione-colazione.png', riserva: 'struttura-colazione.jpg' },
        titolo: [
          'Colazione in giardino',
          'Breakfast in the garden',
          'Petit-déjeuner au jardin',
          'Frühstück im Garten',
          'Desayuno en el jardín',
        ],
        testo: [
          'Ogni mattina torte fatte in casa, formaggi del territorio, frutta di stagione e caffè, tra i fiori del nostro giardino.',
          'Every morning home-made cakes, local cheeses, seasonal fruit and coffee, among the flowers of our garden.',
          'Chaque matin, gâteaux maison, fromages du terroir, fruits de saison et café, parmi les fleurs de notre jardin.',
          'Jeden Morgen hausgemachte Kuchen, Käse aus der Region, Obst der Saison und Kaffee zwischen den Blumen unseres Gartens.',
          'Cada mañana tartas caseras, quesos de la zona, fruta de temporada y café, entre las flores de nuestro jardín.',
        ],
      },
      {
        foto: { cliente: 'sezione-gatto.png', riserva: 'varie-gatto.jpg' },
        titolo: [
          'Ospiti a quattro zampe',
          'Four-legged guests',
          'Hôtes à quatre pattes',
          'Gäste auf vier Pfoten',
          'Huéspedes de cuatro patas',
        ],
        testo: [
          'Cani e gatti di piccola taglia sono i benvenuti: ciotola, cuccia e una passeggiata consigliata li aspettano all’arrivo.',
          'Small dogs and cats are welcome: a bowl, a bed and a recommended walk are waiting for them on arrival.',
          'Les chiens et chats de petite taille sont les bienvenus : gamelle, panier et une promenade conseillée les attendent.',
          'Kleine Hunde und Katzen sind willkommen: Napf, Körbchen und ein Spaziertipp warten bei der Ankunft.',
          'Los perros y gatos pequeños son bienvenidos: comedero, cama y un paseo recomendado los esperan a la llegada.',
        ],
      },
      {
        foto: 'struttura-piscina.jpg',
        titolo: ['La piscina', 'The pool', 'La piscine', 'Der Pool', 'La piscina'],
        testo: [
          'Aperta da giugno a settembre, con lettini e ombrelloni per tutti gli ospiti.',
          'Open from June to September, with sunbeds and umbrellas for every guest.',
          'Ouverte de juin à septembre, avec transats et parasols pour tous les clients.',
          'Von Juni bis September geöffnet, mit Liegen und Sonnenschirmen für alle Gäste.',
          'Abierta de junio a septiembre, con tumbonas y sombrillas para todos los huéspedes.',
        ],
      },
    ],
  },
  struttura: {
    copertina: { cliente: 'pagina-struttura.png', riserva: 'struttura-hall.jpg' },
    descrizione: [
      'Una casa di famiglia diventata albergo, con il giardino e la terrazza sui tetti di Macomer.',
      'A family home turned hotel, with a garden and a terrace over the roofs of Macomer.',
      'Une maison de famille devenue hôtel, avec un jardin et une terrasse sur les toits de Macomer.',
      'Ein Familienhaus, das zum Hotel wurde, mit Garten und Terrasse über den Dächern von Macomer.',
      'Una casa familiar convertida en hotel, con jardín y terraza sobre los tejados de Macomer.',
    ],
    testo: [
      'Dal 1987 accogliamo viaggiatori, famiglie e chi lavora in zona come si accoglie un amico.',
      'Since 1987 we have welcomed travellers, families and people working nearby as you would welcome a friend.',
      'Depuis 1987, nous accueillons voyageurs, familles et professionnels comme on accueille un ami.',
      'Seit 1987 empfangen wir Reisende, Familien und Geschäftsleute so, wie man Freunde empfängt.',
      'Desde 1987 recibimos a viajeros, familias y a quien trabaja en la zona como se recibe a un amigo.',
    ],
    sezioni: [
      {
        foto: { cliente: 'sezione-reception.png', riserva: 'struttura-hall.jpg' },
        titolo: [
          'La nostra storia',
          'Our story',
          'Notre histoire',
          'Unsere Geschichte',
          'Nuestra historia',
        ],
        testo: [
          'Nonna Giovanna aprì le prime tre camere sopra la bottega di famiglia. Oggi siamo in tre generazioni, ma la reception è sempre lo stesso bancone di legno.',
          'Grandma Giovanna opened the first three rooms above the family shop. Today three generations work here, but the reception is still the same wooden counter.',
          'Grand-mère Giovanna a ouvert les trois premières chambres au-dessus de la boutique familiale. Trois générations y travaillent aujourd’hui, mais la réception est toujours le même comptoir en bois.',
          'Oma Giovanna eröffnete die ersten drei Zimmer über dem Familienladen. Heute arbeiten hier drei Generationen, doch die Rezeption ist noch immer derselbe Holztresen.',
          'La abuela Giovanna abrió las tres primeras habitaciones encima de la tienda familiar. Hoy somos tres generaciones, pero la recepción sigue siendo el mismo mostrador de madera.',
        ],
      },
      {
        foto: { cliente: 'sezione-camera.png', riserva: 'doppia-2.jpg' },
        titolo: ['Le camere', 'The rooms', 'Les chambres', 'Die Zimmer', 'Las habitaciones'],
        testo: [
          'Ogni camera porta il nome di una pianta della macchia mediterranea ed è arredata con il legno e i tessuti dei nostri artigiani.',
          'Each room is named after a Mediterranean shrub and furnished with wood and fabrics from local craftsmen.',
          'Chaque chambre porte le nom d’une plante du maquis et est meublée avec le bois et les tissus de nos artisans.',
          'Jedes Zimmer trägt den Namen einer Pflanze der Macchia und ist mit Holz und Stoffen einheimischer Handwerker eingerichtet.',
          'Cada habitación lleva el nombre de una planta del monte mediterráneo y está amueblada con madera y tejidos de nuestros artesanos.',
        ],
      },
      {
        foto: 'struttura-giardino.jpg',
        titolo: ['Il giardino', 'The garden', 'Le jardin', 'Der Garten', 'El jardín'],
        testo: [
          'Ulivi, querce da sughero e un angolo all’ombra per leggere nel pomeriggio.',
          'Olive trees, cork oaks and a shady corner for reading in the afternoon.',
          'Oliviers, chênes-lièges et un coin d’ombre pour lire l’après-midi.',
          'Olivenbäume, Korkeichen und ein schattiges Plätzchen zum Lesen am Nachmittag.',
          'Olivos, alcornoques y un rincón a la sombra para leer por la tarde.',
        ],
      },
    ],
  },
  attivita: {
    copertina: { cliente: 'pagina-attivita.png', riserva: 'struttura-giardino.jpg' },
    descrizione: [
      'Sport, sentieri e sapori: le esperienze da vivere dentro e fuori dalla struttura.',
      'Sport, trails and flavours: experiences to enjoy inside and outside the hotel.',
      'Sport, sentiers et saveurs : les expériences à vivre dans l’hôtel et alentour.',
      'Sport, Wanderwege und Genuss: Erlebnisse im Hotel und in der Umgebung.',
      'Deporte, senderos y sabores: experiencias dentro y fuera del hotel.',
    ],
    testo: [
      'Chiedi alla reception: prenotiamo noi guide, attrezzatura e tavoli.',
      'Just ask at reception: we book guides, equipment and tables for you.',
      'Demandez à la réception : nous réservons guides, matériel et tables.',
      'Fragen Sie an der Rezeption: Wir buchen Führer, Ausrüstung und Tische für Sie.',
      'Pregunta en recepción: reservamos guías, equipo y mesas por ti.',
    ],
    sezioni: [
      {
        foto: { cliente: 'sezione-pickleball.png', riserva: 'struttura-piscina.jpg' },
        titolo: ['Pickleball', 'Pickleball', 'Pickleball', 'Pickleball', 'Pickleball'],
        testo: [
          'Il nostro campo è aperto tutto il giorno: racchette e palline sono in prestito gratuito alla reception.',
          'Our court is open all day: paddles and balls can be borrowed for free at reception.',
          'Notre terrain est ouvert toute la journée : raquettes et balles sont prêtées gratuitement à la réception.',
          'Unser Platz ist den ganzen Tag geöffnet: Schläger und Bälle leihen Sie kostenlos an der Rezeption.',
          'Nuestra pista está abierta todo el día: palas y pelotas se prestan gratis en recepción.',
        ],
      },
      {
        foto: 'varie-torre.jpg',
        titolo: [
          'Nuraghi e sentieri',
          'Nuraghi and trails',
          'Nuraghes et sentiers',
          'Nuraghen und Wanderwege',
          'Nuragas y senderos',
        ],
        testo: [
          'Il nuraghe Santa Barbara è a dieci minuti a piedi; con le nostre bici raggiungi l’altopiano di Campeda.',
          'The Santa Barbara nuraghe is a ten-minute walk away; with our bikes you can reach the Campeda plateau.',
          'Le nuraghe Santa Barbara est à dix minutes à pied ; avec nos vélos, vous rejoignez le plateau de Campeda.',
          'Der Nuraghe Santa Barbara liegt zehn Gehminuten entfernt; mit unseren Rädern erreichen Sie die Hochebene von Campeda.',
          'El nuraga Santa Barbara está a diez minutos a pie; con nuestras bicis llegas a la meseta de Campeda.',
        ],
      },
      {
        foto: { cliente: 'sezione-lavoro.png', riserva: 'struttura-citta.jpg' },
        titolo: [
          'Lavora con noi',
          'Work with us',
          'Travaillez avec nous',
          'Arbeiten Sie mit uns',
          'Trabaja con nosotros',
        ],
        testo: [
          'Cerchiamo persone che amano accogliere: manda il tuo curriculum a info@example.com.',
          'We are looking for people who love hospitality: send your CV to info@example.com.',
          'Nous cherchons des personnes qui aiment accueillir : envoyez votre CV à info@example.com.',
          'Wir suchen Menschen, die gern Gastgeber sind: Schicken Sie Ihren Lebenslauf an info@example.com.',
          'Buscamos personas a las que les guste recibir: envía tu currículum a info@example.com.',
        ],
      },
      {
        // Ancora in preparazione: non compare sul sito.
        pubblicata: false,
        foto: 'varie-panorama.jpg',
        titolo: [
          'Degustazioni in cantina',
          'Wine tastings',
          'Dégustations en cave',
          'Weinproben im Keller',
          'Catas en la bodega',
        ],
        testo: [
          'Da ottobre, ogni venerdì, vini e formaggi delle cantine del Marghine.',
          'From October, every Friday, wines and cheeses from the Marghine cellars.',
          'Dès octobre, chaque vendredi, vins et fromages des caves du Marghine.',
          'Ab Oktober jeden Freitag Weine und Käse aus den Kellereien des Marghine.',
          'Desde octubre, cada viernes, vinos y quesos de las bodegas del Marghine.',
        ],
      },
    ],
  },
  camere: {
    copertina: { cliente: 'pagina-camere.jpg', riserva: 'doppia-1.jpg' },
    descrizione: [
      'Dalla singola per chi viaggia per lavoro alla suite con la vasca: scegli la tua.',
      'From the single for business trips to the suite with a bathtub: pick yours.',
      'De la single pour les voyages d’affaires à la suite avec baignoire : choisissez la vôtre.',
      'Vom Einzelzimmer für Geschäftsreisen bis zur Suite mit Badewanne: Wählen Sie Ihres.',
      'De la individual para viajes de trabajo a la suite con bañera: elige la tuya.',
    ],
    testo: [
      'Tutte le camere hanno bagno privato, aria condizionata e Wi-Fi gratuito. La colazione si aggiunge alla prenotazione.',
      'Every room has a private bathroom, air conditioning and free Wi-Fi. Breakfast can be added to the booking.',
      'Toutes les chambres ont salle de bain privée, climatisation et Wi-Fi gratuit. Le petit-déjeuner s’ajoute à la réservation.',
      'Alle Zimmer haben eigenes Bad, Klimaanlage und kostenloses WLAN. Das Frühstück kann zur Buchung hinzugefügt werden.',
      'Todas las habitaciones tienen baño privado, aire acondicionado y Wi-Fi gratis. El desayuno se añade a la reserva.',
    ],
    sezioni: [],
  },
};

// Gallerie della struttura e foto varie.
const GALLERIE = {
  struttura: [
    'struttura-hall.jpg',
    'struttura-giardino.jpg',
    'struttura-piscina.jpg',
    'struttura-colazione.jpg',
    'struttura-vista.jpg',
    'struttura-citta.jpg',
  ],
  varie: ['varie-panorama.jpg', 'varie-torre.jpg', 'varie-gatto.jpg'],
};

async function creaPagine() {
  for (const pagina of await contenutiService.elencoPagine()) {
    const { copertina, descrizione, testo, sezioni } = PAGINE[pagina.chiave];
    const testi = { descrizione, testo };
    await contenutiService.aggiornaPagina(pagina.id, italiano(testi));
    await traduci('pagina', pagina.id, testi);
    if (copertina) {
      await aggiungiFoto(
        { entita: 'pagina', entitaId: pagina.id, testoAlternativo: descrizione[0] },
        [copertina],
      );
    }

    for (const [ordine, { foto, titolo, testo: paragrafo, pubblicata }] of sezioni.entries()) {
      const testiSezione = { titolo, testo: paragrafo };
      const sezione = await contenutiService.creaSezione({
        pagina_id: pagina.id,
        ...italiano(testiSezione),
        ordine,
        pubblicata: pubblicata ?? true,
      });
      await traduci('sezione', sezione.id, testiSezione);
      await aggiungiFoto({ entita: 'sezione', entitaId: sezione.id, testoAlternativo: titolo[0] }, [
        foto,
      ]);
    }
  }
}

async function creaMedia() {
  for (const [entita, voce, testoAlternativo] of SFONDI) {
    await aggiungiFoto({ entita, testoAlternativo }, [voce]);
  }
  for (const [entita, foto] of Object.entries(GALLERIE)) {
    await aggiungiFoto({ entita, testoAlternativo: 'Foto della struttura' }, foto);
  }
}

// ─────────────────────────────────────
// FAQ ed eventi
// ─────────────────────────────────────

const FAQ = [
  {
    categoria: 'Arrivo',
    domanda: [
      'A che ora posso arrivare?',
      'What time can I arrive?',
      'À quelle heure puis-je arriver ?',
      'Ab wann kann ich anreisen?',
      '¿A qué hora puedo llegar?',
    ],
    risposta: [
      'Il check-in è dalle 14:00 alle 22:00. Se arrivi più tardi avvisaci in chat: lasciamo le chiavi in cassetta.',
      'Check-in is from 2 pm to 10 pm. If you arrive later let us know in the chat: we leave the keys in a key box.',
      'L’arrivée se fait de 14 h à 22 h. Si vous arrivez plus tard, prévenez-nous par chat : nous laissons les clés dans une boîte.',
      'Check-in von 14 bis 22 Uhr. Wenn Sie später kommen, schreiben Sie uns im Chat: Wir hinterlegen die Schlüssel in einem Schlüsselkasten.',
      'El check-in es de 14:00 a 22:00. Si llegas más tarde avísanos por chat: dejamos las llaves en un cajetín.',
    ],
  },
  {
    categoria: 'Arrivo',
    domanda: [
      'Posso fare il check-in online?',
      'Can I check in online?',
      'Puis-je faire l’enregistrement en ligne ?',
      'Kann ich online einchecken?',
      '¿Puedo hacer el check-in online?',
    ],
    risposta: [
      'Sì: tre giorni prima dell’arrivo ti mandiamo il link per inserire i dati di tutti gli ospiti.',
      'Yes: three days before arrival we send you a link to enter the details of all guests.',
      'Oui : trois jours avant l’arrivée, nous vous envoyons le lien pour saisir les données de tous les clients.',
      'Ja: Drei Tage vor der Anreise schicken wir Ihnen den Link, um die Daten aller Gäste einzugeben.',
      'Sí: tres días antes de la llegada te enviamos el enlace para introducir los datos de todos los huéspedes.',
    ],
  },
  {
    categoria: 'Servizi',
    domanda: [
      'C’è un parcheggio?',
      'Is there parking?',
      'Y a-t-il un parking ?',
      'Gibt es einen Parkplatz?',
      '¿Hay aparcamiento?',
    ],
    risposta: [
      'Sì, coperto e videosorvegliato, a 10 euro a notte: aggiungilo quando prenoti.',
      'Yes, covered and monitored, at 10 euros per night: add it when you book.',
      'Oui, couvert et sous vidéosurveillance, à 10 euros la nuit : ajoutez-le lors de la réservation.',
      'Ja, überdacht und videoüberwacht, für 10 Euro pro Nacht: einfach bei der Buchung hinzufügen.',
      'Sí, cubierto y vigilado, a 10 euros por noche: añádelo al reservar.',
    ],
  },
  {
    categoria: 'Servizi',
    domanda: [
      'Posso portare il mio cane?',
      'Can I bring my dog?',
      'Puis-je venir avec mon chien ?',
      'Darf ich meinen Hund mitbringen?',
      '¿Puedo llevar a mi perro?',
    ],
    risposta: [
      'Sì, gli animali di piccola taglia sono ammessi nelle camere con l’icona della zampa.',
      'Yes, small pets are allowed in the rooms marked with the paw icon.',
      'Oui, les animaux de petite taille sont admis dans les chambres marquées d’une patte.',
      'Ja, kleine Haustiere sind in den Zimmern mit dem Pfotensymbol erlaubt.',
      'Sí, los animales pequeños se admiten en las habitaciones con el icono de la huella.',
    ],
  },
  {
    categoria: 'Prenotazioni',
    domanda: [
      'Posso modificare le date?',
      'Can I change my dates?',
      'Puis-je modifier les dates ?',
      'Kann ich die Daten ändern?',
      '¿Puedo cambiar las fechas?',
    ],
    risposta: [
      'Sì, dall’area personale o scrivendoci in chat, se la camera è libera nelle nuove date.',
      'Yes, from your personal area or by writing to us in the chat, if the room is free on the new dates.',
      'Oui, depuis l’espace personnel ou par chat, si la chambre est libre aux nouvelles dates.',
      'Ja, im persönlichen Bereich oder per Chat, wenn das Zimmer an den neuen Daten frei ist.',
      'Sí, desde el área personal o por chat, si la habitación está libre en las nuevas fechas.',
    ],
  },
  {
    categoria: 'Prenotazioni',
    domanda: [
      'Quali metodi di pagamento accettate?',
      'Which payment methods do you accept?',
      'Quels moyens de paiement acceptez-vous ?',
      'Welche Zahlungsmethoden akzeptieren Sie?',
      '¿Qué métodos de pago aceptáis?',
    ],
    risposta: [
      'Carta online, PayPal, bonifico e, in struttura, POS e contanti nei limiti di legge.',
      'Card online, PayPal, bank transfer and, at the hotel, card terminal and cash within the legal limits.',
      'Carte en ligne, PayPal, virement et, sur place, TPE et espèces dans les limites légales.',
      'Karte online, PayPal, Überweisung und vor Ort Kartenterminal und Bargeld im gesetzlichen Rahmen.',
      'Tarjeta online, PayPal, transferencia y, en el hotel, TPV y efectivo dentro de los límites legales.',
    ],
  },
  {
    categoria: 'Prenotazioni',
    // Bozza: la regola sui gruppi non è ancora decisa.
    pubblicata: false,
    domanda: [
      'Fate prezzi per i gruppi?',
      'Do you offer group rates?',
      'Proposez-vous des tarifs de groupe ?',
      'Gibt es Gruppenpreise?',
      '¿Tenéis precios para grupos?',
    ],
    risposta: [
      'Per gruppi da cinque camere in su scrivici: prepariamo un preventivo su misura.',
      'For groups of five rooms or more write to us: we prepare a tailored quote.',
      'Pour les groupes de cinq chambres ou plus, écrivez-nous : nous préparons un devis sur mesure.',
      'Für Gruppen ab fünf Zimmern schreiben Sie uns: Wir erstellen ein individuelles Angebot.',
      'Para grupos de cinco habitaciones o más escríbenos: preparamos un presupuesto a medida.',
    ],
  },
];

async function creaFaq(ctx, ctxAdmin) {
  const create = [];
  for (const [ordine, { categoria, pubblicata, domanda, risposta }] of FAQ.entries()) {
    const testi = { domanda, risposta };
    const faq = await contenutiService.creaFaq(
      { ...italiano(testi), categoria, ordine, pubblicata: pubblicata ?? true },
      ctx,
    );
    await traduci('faq', faq.id, testi);
    create.push(faq);
  }
  // Corretta in un secondo momento dall'amministratore.
  await contenutiService.aggiornaFaq(
    create[0].id,
    {
      risposta:
        'Il check-in è dalle 14:00 alle 22:00. Se arrivi più tardi avvisaci in chat: lasciamo le chiavi in una cassetta con codice.',
    },
    ctxAdmin,
  );
}

const EVENTI = [
  {
    titolo: 'Ferragosto',
    tipo: 'festivita',
    date: (anno) => [`${anno}-08-15`, `${anno}-08-15`],
    impatto: 9,
    note: 'Tutto esaurito da giugno: niente promozioni.',
  },
  {
    titolo: 'Mostra regionale del formaggio',
    tipo: 'fiera',
    giorni: [18, 21],
    impatto: 8,
    note: 'Espositori da tutta l’isola: proporre il soggiorno minimo di due notti.',
  },
  {
    titolo: 'Festa di San Pantaleo',
    tipo: 'evento_locale',
    giorni: [40, 42],
    impatto: 6,
    note: 'Processione e concerti in piazza: avvisare gli ospiti del traffico in centro.',
  },
  {
    titolo: 'Capodanno',
    tipo: 'festivita',
    date: (anno) => [`${anno}-12-31`, `${anno + 1}-01-01`],
    impatto: 7,
    note: 'Cenone in collaborazione con il ristorante accanto.',
  },
  {
    // Gli eventi compaiono anche sul sito: niente che spaventi gli ospiti.
    titolo: 'Mercatino dell’antiquariato',
    tipo: 'altro',
    giorni: [5, 6],
    impatto: 2,
    note: 'Bancarelle in piazza: la strada è chiusa, indicare il parcheggio sul retro.',
  },
];

// Le festività cadono in date fisse dell'anno in corso, gli altri eventi attorno a oggi.
async function creaEventi() {
  const anno = Number(giorno(0).slice(0, 4));
  for (const { giorni, date, ...evento } of EVENTI) {
    const [inizio, fine] = date ? date(anno) : giorni.map(giorno);
    await contenutiService.creaEvento({ ...evento, data_inizio: inizio, data_fine: fine });
  }
}

/** Dopo i documenti legali e le persone: pagine, media, FAQ ed eventi. */
async function creaContenuti(ctx, ctxAdmin) {
  await creaPagine();
  await creaMedia();
  await creaFaq(ctx, ctxAdmin);
  await creaEventi();
}

// ─────────────────────────────────────
// Chiusure
// ─────────────────────────────────────

/** Una camera chiusa per lavori e tutta la struttura chiusa per ferie. */
async function creaChiusure(ctx, camere) {
  await calendariService.blocca(
    {
      camera_id: camere['204'].id,
      data_inizio: giorno(45),
      data_fine: giorno(50),
      motivo: 'Rifacimento del bagno',
    },
    ctx,
  );
  await calendariService.blocca(
    {
      data_inizio: giorno(95),
      data_fine: giorno(105),
      motivo: 'Chiusura per ferie del personale',
    },
    ctx,
  );
}

module.exports = { impostaStruttura, creaDocumentiLegali, creaContenuti, creaChiusure };
