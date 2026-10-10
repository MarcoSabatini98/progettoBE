// Catalogo: dotazioni, servizi extra, tipologie, camere, piani, periodi,
// promozioni, codici sconto, pacchetti e tassa di soggiorno.

const modelli = require('../../src/models');
const camereService = require('../../src/services/camere.service');
const tariffeService = require('../../src/services/tariffe.service');
const { oggi } = require('../../src/utils/date');
const { giorno, italiano, traduci, aggiungiFoto } = require('./comune');

// Testi tradotti: [it, en, fr, de, es].
const DOTAZIONI = {
  'Wi-Fi gratuito': [
    ['Wi-Fi gratuito', 'Free Wi-Fi', 'Wi-Fi gratuit', 'Kostenloses WLAN', 'Wi-Fi gratuito'],
    [
      'Fibra veloce in camera e in tutta la struttura.',
      'Fast fibre connection in the room and throughout the property.',
      'Fibre rapide dans la chambre et dans tout l’établissement.',
      'Schnelles Glasfaser-Internet im Zimmer und im ganzen Haus.',
      'Fibra rápida en la habitación y en todo el alojamiento.',
    ],
  ],
  'Aria condizionata': [
    ['Aria condizionata', 'Air conditioning', 'Climatisation', 'Klimaanlage', 'Aire acondicionado'],
    [
      'Regolabile da ogni camera, silenziosa anche di notte.',
      'Adjustable in every room, quiet even at night.',
      'Réglable dans chaque chambre, silencieuse même la nuit.',
      'In jedem Zimmer regelbar, auch nachts leise.',
      'Regulable en cada habitación, silencioso incluso de noche.',
    ],
  ],
  Riscaldamento: [
    ['Riscaldamento', 'Heating', 'Chauffage', 'Heizung', 'Calefacción'],
    [
      'Riscaldamento autonomo per le sere fresche d’autunno e d’inverno.',
      'Independent heating for cool autumn and winter evenings.',
      'Chauffage individuel pour les soirées fraîches d’automne et d’hiver.',
      'Eigene Heizung für kühle Herbst- und Winterabende.',
      'Calefacción independiente para las noches frescas de otoño e invierno.',
    ],
  ],
  'TV a schermo piatto': [
    [
      'TV a schermo piatto',
      'Flat-screen TV',
      'Télévision à écran plat',
      'Flachbild-TV',
      'TV de pantalla plana',
    ],
    [
      'Smart TV con canali italiani e internazionali.',
      'Smart TV with Italian and international channels.',
      'Smart TV avec chaînes italiennes et internationales.',
      'Smart-TV mit italienischen und internationalen Sendern.',
      'Smart TV con canales italianos e internacionales.',
    ],
  ],
  'Bagno privato': [
    ['Bagno privato', 'Private bathroom', 'Salle de bain privée', 'Eigenes Bad', 'Baño privado'],
    [
      'Bagno in camera, rinnovato e con finestra.',
      'En-suite bathroom, renovated and with a window.',
      'Salle de bain dans la chambre, rénovée et avec fenêtre.',
      'Renoviertes Bad im Zimmer, mit Fenster.',
      'Baño en la habitación, reformado y con ventana.',
    ],
  ],
  Doccia: [
    ['Doccia', 'Shower', 'Douche', 'Dusche', 'Ducha'],
    [
      'Doccia a filo pavimento con soffione a pioggia.',
      'Walk-in shower with rainfall head.',
      'Douche à l’italienne avec pomme pluie.',
      'Bodengleiche Dusche mit Regenbrause.',
      'Ducha a ras de suelo con rociador de lluvia.',
    ],
  ],
  Asciugacapelli: [
    ['Asciugacapelli', 'Hairdryer', 'Sèche-cheveux', 'Haartrockner', 'Secador de pelo'],
    [
      'Asciugacapelli professionale in ogni bagno.',
      'Professional hairdryer in every bathroom.',
      'Sèche-cheveux professionnel dans chaque salle de bain.',
      'Profi-Haartrockner in jedem Bad.',
      'Secador profesional en cada baño.',
    ],
  ],
  'Set di cortesia': [
    ['Set di cortesia', 'Toiletries', 'Produits d’accueil', 'Pflegeprodukte', 'Artículos de aseo'],
    [
      'Saponi naturali prodotti in Sardegna.',
      'Natural soaps made in Sardinia.',
      'Savons naturels fabriqués en Sardaigne.',
      'Naturseifen aus Sardinien.',
      'Jabones naturales elaborados en Cerdeña.',
    ],
  ],
  'Biancheria da letto e da bagno': [
    [
      'Biancheria da letto e da bagno',
      'Bed linen and towels',
      'Linge de lit et de bain',
      'Bettwäsche und Handtücher',
      'Ropa de cama y toallas',
    ],
    [
      'Lenzuola in cotone e asciugamani cambiati ogni due giorni.',
      'Cotton sheets and towels changed every two days.',
      'Draps en coton et serviettes changés tous les deux jours.',
      'Baumwollbettwäsche und Handtücher, alle zwei Tage gewechselt.',
      'Sábanas de algodón y toallas cambiadas cada dos días.',
    ],
  ],
  Minibar: [
    ['Minibar', 'Minibar', 'Minibar', 'Minibar', 'Minibar'],
    [
      'Acqua, bibite e snack del territorio.',
      'Water, soft drinks and local snacks.',
      'Eau, boissons et en-cas locaux.',
      'Wasser, Softdrinks und regionale Snacks.',
      'Agua, refrescos y aperitivos locales.',
    ],
  ],
  Bollitore: [
    ['Bollitore', 'Kettle', 'Bouilloire', 'Wasserkocher', 'Hervidor'],
    [
      'Bollitore con tè, tisane e caffè solubile.',
      'Kettle with tea, herbal teas and instant coffee.',
      'Bouilloire avec thé, tisanes et café soluble.',
      'Wasserkocher mit Tee, Kräutertee und Instantkaffee.',
      'Hervidor con té, infusiones y café soluble.',
    ],
  ],
  Cassaforte: [
    ['Cassaforte', 'Safe', 'Coffre-fort', 'Safe', 'Caja fuerte'],
    [
      'Cassaforte elettronica adatta a un portatile.',
      'Electronic safe that fits a laptop.',
      'Coffre-fort électronique pouvant contenir un ordinateur portable.',
      'Elektronischer Safe, passend für einen Laptop.',
      'Caja fuerte electrónica con espacio para un portátil.',
    ],
  ],
  Scrivania: [
    ['Scrivania', 'Desk', 'Bureau', 'Schreibtisch', 'Escritorio'],
    [
      'Scrivania con lampada e prese vicine.',
      'Desk with lamp and nearby sockets.',
      'Bureau avec lampe et prises à proximité.',
      'Schreibtisch mit Lampe und Steckdosen in der Nähe.',
      'Escritorio con lámpara y enchufes cerca.',
    ],
  ],
  Balcone: [
    ['Balcone', 'Balcony', 'Balcon', 'Balkon', 'Balcón'],
    [
      'Balcone arredato con vista sull’altopiano.',
      'Furnished balcony overlooking the plateau.',
      'Balcon meublé avec vue sur le plateau.',
      'Möblierter Balkon mit Blick auf die Hochebene.',
      'Balcón amueblado con vistas a la meseta.',
    ],
  ],
  'Vista mare': [
    ['Vista mare', 'Sea view', 'Vue sur la mer', 'Meerblick', 'Vistas al mar'],
    [
      'Nelle giornate limpide si vede il mare verso Bosa.',
      'On clear days you can see the sea towards Bosa.',
      'Par temps clair, on voit la mer vers Bosa.',
      'An klaren Tagen sieht man das Meer bei Bosa.',
      'En los días claros se ve el mar hacia Bosa.',
    ],
  ],
  'Accessibile in sedia a rotelle': [
    [
      'Accessibile in sedia a rotelle',
      'Wheelchair accessible',
      'Accessible en fauteuil roulant',
      'Rollstuhlgerecht',
      'Accesible en silla de ruedas',
    ],
    [
      'Ingresso senza gradini, bagno ampio con maniglioni.',
      'Step-free entrance, spacious bathroom with grab bars.',
      'Entrée sans marche, grande salle de bain avec barres d’appui.',
      'Stufenloser Zugang, großes Bad mit Haltegriffen.',
      'Entrada sin escalones, baño amplio con asideros.',
    ],
  ],
  'Culla su richiesta': [
    [
      'Culla su richiesta',
      'Cot on request',
      'Lit bébé sur demande',
      'Babybett auf Anfrage',
      'Cuna bajo petición',
    ],
    [
      'Culla e seggiolone gratuiti: basta chiederli.',
      'Free cot and high chair: just ask.',
      'Lit bébé et chaise haute gratuits : il suffit de demander.',
      'Babybett und Hochstuhl kostenlos: einfach fragen.',
      'Cuna y trona gratuitas: solo hay que pedirlas.',
    ],
  ],
  'Animali ammessi': [
    [
      'Animali ammessi',
      'Pets allowed',
      'Animaux acceptés',
      'Haustiere erlaubt',
      'Se admiten mascotas',
    ],
    [
      'Cani e gatti di piccola taglia sono i benvenuti.',
      'Small dogs and cats are welcome.',
      'Les chiens et chats de petite taille sont les bienvenus.',
      'Kleine Hunde und Katzen sind willkommen.',
      'Perros y gatos pequeños son bienvenidos.',
    ],
  ],
};

async function descriviDotazioni() {
  const dotazioni = await modelli.Servizio.findAll({ where: { tipo: 'dotazione' } });
  for (const dotazione of dotazioni) {
    const [nome, descrizione] = DOTAZIONI[dotazione.nome];
    await camereService.aggiornaServizio(dotazione.id, { descrizione: descrizione[0] });
    await traduci('servizio', dotazione.id, { nome, descrizione });
  }
  return (nome) => dotazioni.find((dotazione) => dotazione.nome === nome).id;
}

const EXTRA = [
  {
    chiave: 'colazione',
    prezzo: 12,
    calcolo_prezzo: 'a_persona_notte',
    icona: 'breakfast_dining',
    aliquota_iva: 10,
    foto: 'servizio-colazione.jpg',
    nome: ['Colazione', 'Breakfast', 'Petit-déjeuner', 'Frühstück', 'Desayuno'],
    descrizione: [
      'Dolci fatti in casa, pane caldo, formaggi e frutta di stagione.',
      'Homemade cakes, warm bread, cheeses and seasonal fruit.',
      'Gâteaux maison, pain chaud, fromages et fruits de saison.',
      'Hausgemachter Kuchen, warmes Brot, Käse und Obst der Saison.',
      'Dulces caseros, pan caliente, quesos y fruta de temporada.',
    ],
  },
  {
    chiave: 'parcheggio',
    prezzo: 10,
    calcolo_prezzo: 'a_notte',
    icona: 'local_parking',
    foto: 'servizio-parcheggio.jpg',
    nome: ['Parcheggio', 'Parking', 'Parking', 'Parkplatz', 'Aparcamiento'],
    descrizione: [
      'Posto auto recintato e videosorvegliato a 50 metri.',
      'Fenced, CCTV-monitored parking space 50 metres away.',
      'Place de parking clôturée et sous vidéosurveillance à 50 mètres.',
      'Eingezäunter, videoüberwachter Stellplatz 50 Meter entfernt.',
      'Plaza vallada y con videovigilancia a 50 metros.',
    ],
  },
  {
    chiave: 'transfer',
    prezzo: 35,
    calcolo_prezzo: 'a_soggiorno',
    icona: 'local_taxi',
    aliquota_iva: 10,
    foto: 'servizio-transfer.jpg',
    nome: [
      'Transfer aeroporto',
      'Airport transfer',
      'Transfert aéroport',
      'Flughafentransfer',
      'Traslado al aeropuerto',
    ],
    descrizione: [
      'Andata e ritorno dall’aeroporto di Alghero o Olbia.',
      'Return transfer from Alghero or Olbia airport.',
      'Aller-retour depuis l’aéroport d’Alghero ou d’Olbia.',
      'Hin- und Rückfahrt vom Flughafen Alghero oder Olbia.',
      'Ida y vuelta desde el aeropuerto de Alghero u Olbia.',
    ],
  },
  {
    chiave: 'lateCheckout',
    prezzo: 20,
    calcolo_prezzo: 'a_soggiorno',
    icona: 'schedule',
    foto: 'servizio-late-checkout.jpg',
    nome: [
      'Late check-out',
      'Late check-out',
      'Départ tardif',
      'Später Check-out',
      'Salida tardía',
    ],
    descrizione: [
      'La camera resta tua fino alle 14:00.',
      'Keep your room until 2 pm.',
      'La chambre reste à vous jusqu’à 14 h.',
      'Das Zimmer bleibt bis 14 Uhr Ihres.',
      'La habitación es tuya hasta las 14:00.',
    ],
  },
  {
    chiave: 'bici',
    prezzo: 15,
    calcolo_prezzo: 'a_persona',
    icona: 'pedal_bike',
    foto: 'servizio-bici.jpg',
    nome: [
      'Noleggio bici',
      'Bike rental',
      'Location de vélos',
      'Fahrradverleih',
      'Alquiler de bicicletas',
    ],
    descrizione: [
      'E-bike con casco e cartina dei sentieri dell’altopiano.',
      'E-bike with helmet and a map of the plateau trails.',
      'Vélo électrique avec casque et carte des sentiers du plateau.',
      'E-Bike mit Helm und Karte der Wege auf der Hochebene.',
      'Bicicleta eléctrica con casco y mapa de los senderos de la meseta.',
    ],
  },
  {
    chiave: 'massaggio',
    prezzo: 50,
    calcolo_prezzo: 'a_persona',
    icona: 'spa',
    foto: 'servizio-massaggio.jpg',
    nome: ['Massaggio', 'Massage', 'Massage', 'Massage', 'Masaje'],
    descrizione: [
      'Cinquanta minuti di massaggio rilassante con oli al mirto.',
      'Fifty-minute relaxing massage with myrtle oils.',
      'Cinquante minutes de massage relaxant aux huiles de myrte.',
      'Fünfzig Minuten entspannende Massage mit Myrtenöl.',
      'Cincuenta minutos de masaje relajante con aceites de mirto.',
    ],
  },
  {
    // Stagionale: torna attivo a maggio.
    chiave: 'kayak',
    prezzo: 40,
    calcolo_prezzo: 'a_persona',
    icona: 'kayaking',
    attivo: false,
    foto: 'servizio-kayak.jpg',
    nome: [
      'Escursione in kayak',
      'Kayak tour',
      'Excursion en kayak',
      'Kajaktour',
      'Excursión en kayak',
    ],
    descrizione: [
      'Mezza giornata in kayak lungo il Temo, da maggio a settembre.',
      'Half a day kayaking along the Temo river, May to September.',
      'Une demi-journée en kayak sur le Temo, de mai à septembre.',
      'Ein halber Tag im Kajak auf dem Temo, von Mai bis September.',
      'Media jornada en kayak por el río Temo, de mayo a septiembre.',
    ],
  },
];

async function creaExtra() {
  const extra = {};
  for (const [ordine, { chiave, foto, nome, descrizione, ...servizio }] of EXTRA.entries()) {
    const testi = { nome, descrizione };
    extra[chiave] = await camereService.creaServizio({
      ...servizio,
      ...italiano(testi),
      tipo: 'extra',
      ordine,
    });
    await traduci('servizio', extra[chiave].id, testi);
    await aggiungiFoto(
      { entita: 'servizio', entitaId: extra[chiave].id, testoAlternativo: nome[0] },
      [foto],
    );
  }

  // Tolto dal catalogo: resta solo nello storico.
  const navetta = await camereService.creaServizio({
    nome: 'Navetta per la spiaggia',
    descrizione: 'Servizio sospeso: sostituito dal transfer su richiesta.',
    icona: 'airport_shuttle',
    tipo: 'extra',
    prezzo: 8,
    calcolo_prezzo: 'a_persona',
    ordine: EXTRA.length,
  });
  await camereService.eliminaServizio(navetta.id);
  return extra;
}

const DOTAZIONI_BASE = [
  'Wi-Fi gratuito',
  'Aria condizionata',
  'Riscaldamento',
  'TV a schermo piatto',
  'Bagno privato',
  'Doccia',
  'Asciugacapelli',
  'Set di cortesia',
  'Biancheria da letto e da bagno',
];

const TIPOLOGIE = [
  {
    chiave: 'singola',
    prezzo_base: 70,
    ospiti_max: 1,
    superficie_mq: 14,
    dotazioni: ['Scrivania'],
    foto: 'tipologia-singola.jpg',
    nome: ['Singola', 'Single', 'Simple', 'Einzelzimmer', 'Individual'],
    letti: ['1 letto singolo', '1 single bed', '1 lit simple', '1 Einzelbett', '1 cama individual'],
    descrizione: [
      'Raccolta e luminosa, perfetta per chi viaggia da solo o per lavoro.',
      'Cosy and bright, ideal for solo or business travellers.',
      'Intime et lumineuse, idéale pour voyager seul ou pour le travail.',
      'Gemütlich und hell, ideal für Alleinreisende und Geschäftsreisen.',
      'Acogedora y luminosa, perfecta para viajar solo o por trabajo.',
    ],
  },
  {
    chiave: 'doppia',
    prezzo_base: 95,
    ospiti_max: 2,
    superficie_mq: 18,
    dotazioni: ['Bollitore', 'Culla su richiesta', 'Animali ammessi'],
    foto: 'tipologia-doppia.jpg',
    nome: ['Doppia', 'Double', 'Double', 'Doppelzimmer', 'Doble'],
    letti: [
      '1 letto matrimoniale',
      '1 double bed',
      '1 lit double',
      '1 Doppelbett',
      '1 cama de matrimonio',
    ],
    descrizione: [
      'Letto matrimoniale, legno chiaro e tessuti sardi fatti a mano.',
      'Double bed, light wood and handmade Sardinian fabrics.',
      'Lit double, bois clair et tissus sardes faits main.',
      'Doppelbett, helles Holz und handgewebte sardische Stoffe.',
      'Cama de matrimonio, madera clara y tejidos sardos hechos a mano.',
    ],
  },
  {
    chiave: 'tripla',
    prezzo_base: 120,
    ospiti_max: 3,
    superficie_mq: 24,
    dotazioni: ['Bollitore', 'Culla su richiesta', 'Accessibile in sedia a rotelle'],
    foto: 'tipologia-tripla.jpg',
    nome: ['Tripla', 'Triple', 'Triple', 'Dreibettzimmer', 'Triple'],
    letti: [
      '1 letto matrimoniale e 1 singolo',
      '1 double and 1 single bed',
      '1 lit double et 1 lit simple',
      '1 Doppelbett und 1 Einzelbett',
      '1 cama de matrimonio y 1 individual',
    ],
    descrizione: [
      'Spaziosa e accessibile, pensata per le famiglie e i piccoli gruppi.',
      'Spacious and accessible, designed for families and small groups.',
      'Spacieuse et accessible, pensée pour les familles et les petits groupes.',
      'Geräumig und barrierefrei, für Familien und kleine Gruppen.',
      'Amplia y accesible, pensada para familias y grupos pequeños.',
    ],
  },
  {
    chiave: 'suite',
    prezzo_base: 180,
    ospiti_max: 4,
    superficie_mq: 40,
    dotazioni: ['Minibar', 'Bollitore', 'Cassaforte', 'Balcone', 'Vista mare', 'Scrivania'],
    foto: 'tipologia-suite.jpg',
    nome: ['Suite', 'Suite', 'Suite', 'Suite', 'Suite'],
    letti: [
      '1 letto matrimoniale e 1 divano letto',
      '1 double bed and 1 sofa bed',
      '1 lit double et 1 canapé-lit',
      '1 Doppelbett und 1 Schlafsofa',
      '1 cama de matrimonio y 1 sofá cama',
    ],
    descrizione: [
      'Salotto, balcone panoramico e vasca: la camera più bella della casa.',
      'Living area, panoramic balcony and bathtub: the finest room in the house.',
      'Salon, balcon panoramique et baignoire : la plus belle chambre de la maison.',
      'Wohnbereich, Panoramabalkon und Badewanne: das schönste Zimmer des Hauses.',
      'Salón, balcón panorámico y bañera: la habitación más bonita de la casa.',
    ],
  },
  {
    // In allestimento: non ancora prenotabile dal sito.
    chiave: 'familiare',
    prezzo_base: 150,
    ospiti_max: 5,
    superficie_mq: 35,
    attiva: false,
    dotazioni: ['Bollitore', 'Culla su richiesta'],
    nome: ['Familiare', 'Family room', 'Familiale', 'Familienzimmer', 'Familiar'],
    letti: [
      '1 letto matrimoniale e 3 singoli',
      '1 double and 3 single beds',
      '1 lit double et 3 lits simples',
      '1 Doppelbett und 3 Einzelbetten',
      '1 cama de matrimonio y 3 individuales',
    ],
    descrizione: [
      'Due ambienti comunicanti per le famiglie numerose: apre la prossima primavera.',
      'Two connecting rooms for larger families: opening next spring.',
      'Deux pièces communicantes pour les grandes familles : ouverture au printemps prochain.',
      'Zwei verbundene Räume für große Familien: Eröffnung im nächsten Frühjahr.',
      'Dos estancias comunicadas para familias numerosas: abre la próxima primavera.',
    ],
  },
];

async function creaTipologie(dotazione) {
  const tipologie = {};
  for (const [ordine, voce] of TIPOLOGIE.entries()) {
    const { chiave, foto, dotazioni, nome, letti, descrizione, ...tipologia } = voce;
    const testi = { nome, descrizione, letti };
    tipologie[chiave] = await camereService.creaTipologia({
      ...tipologia,
      ...italiano(testi),
      ordine,
      servizi: [...DOTAZIONI_BASE, ...dotazioni].map(dotazione),
    });
    await traduci('tipologia_camera', tipologie[chiave].id, testi);
    if (foto) {
      await aggiungiFoto(
        {
          entita: 'tipologia_camera',
          entitaId: tipologie[chiave].id,
          testoAlternativo: `Camera ${nome[0].toLowerCase()}`,
        },
        [foto],
      );
    }
  }

  // Dismessa con la ristrutturazione: non ha più camere.
  const ostello = await camereService.creaTipologia({
    nome: 'Camerata',
    descrizione: 'Posti letto in camerata condivisa.',
    prezzo_base: 35,
    ospiti_max: 6,
    superficie_mq: 30,
    letti: '3 letti a castello',
    ordine: TIPOLOGIE.length,
  });
  await camereService.eliminaTipologia(ostello.id);
  return tipologie;
}

// [numero, tipologia, piano, nome, foto, descrizione it/en/fr/de/es, note interne]
const CAMERE = [
  [
    '101',
    'singola',
    1,
    'Ginepro',
    ['camera-101-1.jpg', 'camera-101-2.jpg'],
    [
      'Affaccia sul cortile interno: la più silenziosa della casa.',
      'Overlooks the inner courtyard: the quietest in the house.',
      'Donne sur la cour intérieure : la plus calme de la maison.',
      'Zum Innenhof gelegen: das ruhigste Zimmer des Hauses.',
      'Da al patio interior: la más tranquila de la casa.',
    ],
    'Materasso sostituito a marzo.',
  ],
  [
    '102',
    'doppia',
    1,
    'Mirto',
    ['camera-102-1.jpg', 'camera-102-2.jpg', 'camera-102-3.jpg'],
    [
      'Pareti color sabbia e una finestra grande sul giardino.',
      'Sand-coloured walls and a large window onto the garden.',
      'Murs couleur sable et grande fenêtre sur le jardin.',
      'Sandfarbene Wände und ein großes Fenster zum Garten.',
      'Paredes color arena y una gran ventana al jardín.',
    ],
    null,
  ],
  [
    '103',
    'doppia',
    1,
    'Lentisco',
    ['camera-103-1.jpg', 'camera-103-2.jpg'],
    [
      'Vicina alla sala colazioni, comoda per chi parte presto.',
      'Close to the breakfast room, handy for early departures.',
      'Proche de la salle du petit-déjeuner, pratique pour les départs matinaux.',
      'Nahe am Frühstücksraum, praktisch bei früher Abreise.',
      'Cerca de la sala de desayunos, cómoda si sales temprano.',
    ],
    'Porta del bagno da regolare: cigola.',
  ],
  [
    '104',
    'tripla',
    1,
    'Corbezzolo',
    ['camera-104-1.jpg', 'camera-104-2.jpg'],
    [
      'Al piano terra, senza gradini dall’ingresso alla doccia.',
      'On the ground floor, step-free from the entrance to the shower.',
      'Au rez-de-chaussée, sans marche de l’entrée à la douche.',
      'Im Erdgeschoss, stufenlos vom Eingang bis zur Dusche.',
      'En la planta baja, sin escalones desde la entrada hasta la ducha.',
    ],
    null,
  ],
  [
    '105',
    'doppia',
    1,
    'Elicriso',
    ['doppia-1.jpg', 'doppia-2.jpg'],
    [
      'Arredi in ferro battuto e un piccolo patio privato.',
      'Wrought-iron furniture and a small private patio.',
      'Mobilier en fer forgé et petit patio privé.',
      'Schmiedeeiserne Möbel und eine kleine private Terrasse.',
      'Muebles de hierro forjado y un pequeño patio privado.',
    ],
    'Patio in comune con la 104 durante i lavori.',
  ],
  [
    '201',
    'doppia',
    2,
    'Rosmarino',
    ['camera-201-1.jpg', 'camera-201-2.jpg', 'camera-201-3.jpg'],
    [
      'Soffitto con travi a vista e luce del mattino.',
      'Exposed-beam ceiling and morning light.',
      'Plafond aux poutres apparentes et lumière du matin.',
      'Sichtbare Holzbalken und Morgenlicht.',
      'Techo con vigas vistas y luz de la mañana.',
    ],
    null,
  ],
  [
    '202',
    'tripla',
    2,
    'Lavanda',
    ['camera-202-1.jpg', 'camera-202-2.jpg'],
    [
      'Ampia e luminosa, con due finestre sul paese.',
      'Large and bright, with two windows over the town.',
      'Grande et lumineuse, avec deux fenêtres sur le village.',
      'Groß und hell, mit zwei Fenstern zum Ort.',
      'Amplia y luminosa, con dos ventanas al pueblo.',
    ],
    null,
  ],
  [
    '203',
    'suite',
    2,
    'Sughera',
    ['camera-203-1.jpg', 'camera-203-2.jpg', 'camera-203-3.jpg'],
    [
      'Salotto con camino e balcone affacciato sulla valle.',
      'Living room with fireplace and a balcony over the valley.',
      'Salon avec cheminée et balcon donnant sur la vallée.',
      'Wohnzimmer mit Kamin und Balkon zum Tal.',
      'Salón con chimenea y balcón con vistas al valle.',
    ],
    'Camino solo decorativo: non accendere.',
  ],
  [
    '204',
    'suite',
    2,
    'Olivastro',
    ['camera-204-1.jpg', 'camera-204-2.jpg', 'camera-204-3.jpg'],
    [
      'Vasca freestanding e vista fino al mare nei giorni limpidi.',
      'Freestanding bathtub and a view to the sea on clear days.',
      'Baignoire îlot et vue jusqu’à la mer par temps clair.',
      'Freistehende Badewanne und an klaren Tagen Blick bis zum Meer.',
      'Bañera exenta y vistas al mar en los días claros.',
    ],
    null,
  ],
  [
    '205',
    'singola',
    2,
    'Cisto',
    ['singola-1.jpg'],
    [
      'Piccola mansarda sotto il tetto, intima e calda.',
      'Small attic room under the roof, cosy and warm.',
      'Petite mansarde sous le toit, intime et chaleureuse.',
      'Kleines Dachzimmer unter dem Dach, gemütlich und warm.',
      'Pequeña buhardilla bajo el tejado, íntima y cálida.',
    ],
    'Fuori servizio per infiltrazione dal tetto.',
  ],
  [
    '301',
    'suite',
    3,
    'Asfodelo',
    ['suite-1.jpg', 'suite-2.jpg', 'tripla-2.jpg'],
    [
      'All’ultimo piano, con terrazza privata sui tetti del paese.',
      'On the top floor, with a private terrace over the rooftops.',
      'Au dernier étage, avec terrasse privée sur les toits du village.',
      'Im obersten Stock, mit privater Dachterrasse über dem Ort.',
      'En la última planta, con terraza privada sobre los tejados.',
    ],
    null,
  ],
];

async function creaCamere(tipologie) {
  const camere = {};
  for (const [numero, tipologia, piano, nome, foto, descrizione, note] of CAMERE) {
    camere[numero] = await camereService.creaCamera({
      numero,
      nome,
      tipologia_id: tipologie[tipologia].id,
      piano,
      descrizione: descrizione[0],
      note,
    });
    await traduci('camera', camere[numero].id, { descrizione });
    await aggiungiFoto(
      {
        entita: 'camera',
        entitaId: camere[numero].id,
        testoAlternativo: `Camera ${numero} ${nome}`,
      },
      foto,
    );
  }

  // Una tripla con un posto in meno: il divano letto è stato tolto.
  await camereService.aggiornaCamera(camere['202'].id, { ospiti_max: 2 });

  // Dependance chiusa: ha solo soggiorni passati (li crea lo storico) e poi si elimina.
  camere.dependance = await camereService.creaCamera({
    numero: 'D1',
    nome: 'Dependance',
    tipologia_id: tipologie.doppia.id,
    piano: 0,
    descrizione: 'Casetta indipendente nel giardino.',
    note: 'Chiusa: diventa il magazzino della biancheria.',
  });
  return camere;
}

// ─────────────────────────────────────
// Tariffe
// ─────────────────────────────────────

async function creaPiani() {
  const nonRimborsabile = await tariffeService.creaPiano({
    nome: 'Non rimborsabile',
    descrizione: 'Il 10% in meno, pagamento anticipato e nessun rimborso.',
    tipo_variazione: 'percentuale',
    valore_variazione: -10,
    rimborsabile: false,
    ore_cancellazione_gratuita: 0,
    penale_percentuale: 100,
    acconto_percentuale: 100,
    ordine: 1,
  });
  const flessibile = await tariffeService.creaPiano({
    nome: 'Flessibile',
    descrizione: 'Cancellazione gratuita fino a 24 ore prima, 8 euro a notte in più.',
    tipo_variazione: 'importo',
    valore_variazione: 8,
    rimborsabile: true,
    ore_cancellazione_gratuita: 24,
    penale_percentuale: 50,
    acconto_percentuale: 30,
    ordine: 2,
  });
  await tariffeService.creaPiano({
    nome: 'Convenzione aziende',
    descrizione: 'Tariffa per le aziende convenzionate: sospesa fino al rinnovo degli accordi.',
    tipo_variazione: 'percentuale',
    valore_variazione: -15,
    rimborsabile: true,
    ore_cancellazione_gratuita: 48,
    penale_percentuale: 0,
    acconto_percentuale: 0,
    attivo: false,
    ordine: 3,
  });
  return { nonRimborsabile, flessibile };
}

async function creaPeriodi(ctx, ctxAdmin, tipologie) {
  const anno = Number(oggi().slice(0, 4));
  for (const estate of [anno - 1, anno, anno + 1]) {
    await tariffeService.creaPeriodo(
      {
        nome: `Alta stagione ${estate}`,
        data_inizio: `${estate}-07-01`,
        data_fine: `${estate}-08-31`,
        tipo_variazione: 'percentuale',
        valore: 30,
        soggiorno_minimo: 3,
        priorita: 10,
      },
      ctx,
    );
    await tariffeService.creaPeriodo(
      {
        nome: `Bassa stagione ${estate}`,
        data_inizio: `${estate}-01-07`,
        data_fine: `${estate}-03-15`,
        tipo_variazione: 'percentuale',
        valore: -15,
        priorita: 5,
      },
      ctx,
    );
  }

  const weekend = await tariffeService.creaPeriodo(
    {
      nome: 'Weekend',
      data_inizio: giorno(-400),
      data_fine: giorno(400),
      giorni_settimana: 16 + 32, // venerdì e sabato
      tipo_variazione: 'percentuale',
      valore: 15,
    },
    ctx,
  );
  // Ritoccato dall'amministratore: resta traccia di chi l'ha cambiato.
  await tariffeService.aggiornaPeriodo(weekend.id, { valore: 12 }, ctxAdmin);

  await tariffeService.creaPeriodo(
    {
      nome: 'Suite a Capodanno',
      tipologia_id: tipologie.suite.id,
      data_inizio: `${anno}-12-29`,
      data_fine: `${anno + 1}-01-02`,
      tipo_variazione: 'importo',
      valore: 60,
      soggiorno_minimo: 2,
      priorita: 20,
    },
    ctx,
  );
  await tariffeService.creaPeriodo(
    {
      nome: 'Sagra di settembre',
      data_inizio: `${anno}-09-10`,
      data_fine: `${anno}-09-14`,
      tipo_variazione: 'percentuale',
      valore: 20,
      priorita: 15,
      attivo: false,
    },
    ctx,
  );
}

const PROMOZIONI = [
  {
    tipo_sconto: 'percentuale',
    valore: 10,
    soggiorno: [0, 14],
    prenotabile: [-7, 14],
    nome: ['Last minute', 'Last minute', 'Dernière minute', 'Last Minute', 'Última hora'],
    descrizione: [
      'Il 10% in meno sui soggiorni delle prossime due settimane.',
      '10% off stays in the next two weeks.',
      '10 % de réduction sur les séjours des deux prochaines semaines.',
      '10 % Rabatt auf Aufenthalte in den nächsten zwei Wochen.',
      '10 % de descuento en estancias de las próximas dos semanas.',
    ],
  },
  {
    tipo_sconto: 'percentuale',
    valore: 12,
    notti_min: 7,
    soggiorno: [-60, 300],
    prenotabile: [-60, 280],
    nome: ['Settimana lunga', 'Long week', 'Longue semaine', 'Lange Woche', 'Semana larga'],
    descrizione: [
      'Da sette notti in su il 12% in meno su tutto il soggiorno.',
      'Stay seven nights or more and get 12% off the whole stay.',
      'À partir de sept nuits, 12 % de réduction sur tout le séjour.',
      'Ab sieben Nächten 12 % Rabatt auf den gesamten Aufenthalt.',
      'A partir de siete noches, un 12 % de descuento en toda la estancia.',
    ],
  },
  {
    tipologia: 'tripla',
    tipo_sconto: 'importo',
    valore: 15,
    ospiti_min: 3,
    ospiti_max: 3,
    soggiorno: [-30, 200],
    prenotabile: [-30, 180],
    nome: ['Famiglie', 'Families', 'Familles', 'Familien', 'Familias'],
    descrizione: [
      'In tre nella tripla: 15 euro in meno a notte.',
      'Three guests in a triple room: 15 euros off per night.',
      'À trois dans la chambre triple : 15 euros de moins par nuit.',
      'Zu dritt im Dreibettzimmer: 15 Euro weniger pro Nacht.',
      'Tres personas en la triple: 15 euros menos por noche.',
    ],
  },
  {
    tipo_sconto: 'percentuale',
    valore: 20,
    attiva: false,
    soggiorno: [150, 240],
    prenotabile: [100, 150],
    nome: [
      'Primavera in anticipo',
      'Early spring',
      'Printemps anticipé',
      'Frühbucher Frühling',
      'Primavera anticipada',
    ],
    descrizione: [
      'Il 20% in meno per chi prenota la primavera entro febbraio.',
      '20% off when you book spring by February.',
      '20 % de réduction en réservant le printemps avant février.',
      '20 % Rabatt bei Buchung des Frühlings bis Februar.',
      '20 % de descuento si reservas la primavera antes de febrero.',
    ],
  },
];

async function creaPromozioni(ctx, tipologie) {
  for (const voce of PROMOZIONI) {
    const { tipologia, soggiorno, prenotabile, nome, descrizione, ...promozione } = voce;
    const testi = { nome, descrizione };
    const creata = await tariffeService.creaPromozione(
      {
        ...promozione,
        ...italiano(testi),
        tipologia_id: tipologia ? tipologie[tipologia].id : null,
        soggiorno_dal: giorno(soggiorno[0]),
        soggiorno_al: giorno(soggiorno[1]),
        prenotabile_dal: giorno(prenotabile[0]),
        prenotabile_al: giorno(prenotabile[1]),
      },
      ctx,
    );
    await traduci('promozione', creata.id, testi);
  }
}

async function creaCodici(ctx) {
  for (const codice of [
    {
      codice: 'BENVENUTO10',
      descrizione: 'Il 10% in meno sul primo soggiorno',
      tipo_sconto: 'percentuale',
      valore: 10,
      valido_dal: giorno(-400),
      valido_al: giorno(365),
      utilizzi_per_utente: 1,
    },
    {
      codice: 'ESTATE20',
      descrizione: '20 euro in meno sopra i 200 euro, almeno tre notti',
      tipo_sconto: 'importo',
      valore: 20,
      importo_minimo: 200,
      notti_min: 3,
      utilizzi_max: 50,
    },
    {
      codice: 'AMICI15',
      descrizione: 'Il 15% per gli amici della casa',
      tipo_sconto: 'percentuale',
      valore: 15,
      valido_dal: giorno(-200),
      valido_al: giorno(200),
      utilizzi_max: 20,
      utilizzi_per_utente: 2,
    },
    {
      codice: 'NATALE24',
      descrizione: 'Campagna di Natale conclusa',
      tipo_sconto: 'importo',
      valore: 30,
      valido_dal: giorno(-700),
      valido_al: giorno(-650),
      attivo: false,
    },
  ]) {
    await tariffeService.creaCodiceSconto(codice, ctx);
  }
}

const PACCHETTI = [
  {
    chiave: 'romantico',
    slug: 'fuga-romantica',
    prezzo: 60,
    tipologia: 'suite',
    notti_min: 2,
    servizi: [
      ['colazione', 2],
      ['lateCheckout', 1],
    ],
    foto: 'pacchetto-romantica.jpg',
    nome: [
      'Fuga romantica',
      'Romantic getaway',
      'Escapade romantique',
      'Romantische Auszeit',
      'Escapada romántica',
    ],
    descrizione: [
      'Due notti in suite con colazione in camera e late check-out.',
      'Two nights in a suite with breakfast in bed and late check-out.',
      'Deux nuits en suite avec petit-déjeuner en chambre et départ tardif.',
      'Zwei Nächte in der Suite mit Frühstück im Zimmer und spätem Check-out.',
      'Dos noches en suite con desayuno en la habitación y salida tardía.',
    ],
  },
  {
    chiave: 'relax',
    slug: 'relax',
    prezzo: 110,
    notti_min: 3,
    valido: [-200, 300],
    servizi: [
      ['massaggio', 2],
      ['transfer', 1],
    ],
    foto: 'pacchetto-relax.jpg',
    nome: ['Relax', 'Relax', 'Détente', 'Entspannung', 'Relax'],
    descrizione: [
      'Tre notti, due massaggi e il transfer dall’aeroporto inclusi.',
      'Three nights, two massages and airport transfer included.',
      'Trois nuits, deux massages et le transfert depuis l’aéroport inclus.',
      'Drei Nächte, zwei Massagen und Flughafentransfer inklusive.',
      'Tres noches, dos masajes y traslado desde el aeropuerto incluidos.',
    ],
  },
  {
    chiave: 'mare',
    slug: 'mare-e-sentieri',
    prezzo: 45,
    notti_min: 2,
    valido: [-400, 400],
    servizi: [
      ['bici', 2],
      ['colazione', 2],
    ],
    foto: 'pacchetto-mare.jpg',
    nome: [
      'Mare e sentieri',
      'Sea and trails',
      'Mer et sentiers',
      'Meer und Wanderwege',
      'Mar y senderos',
    ],
    descrizione: [
      'Due e-bike per scendere fino a Bosa e colazione per due.',
      'Two e-bikes to ride down to Bosa and breakfast for two.',
      'Deux vélos électriques pour descendre jusqu’à Bosa et petit-déjeuner pour deux.',
      'Zwei E-Bikes für die Fahrt nach Bosa und Frühstück für zwei.',
      'Dos bicicletas eléctricas para bajar hasta Bosa y desayuno para dos.',
    ],
  },
  {
    chiave: 'capodanno',
    slug: 'capodanno',
    prezzo: 90,
    notti_min: 2,
    attivo: false,
    valido: [60, 100],
    servizi: [['colazione', 2]],
    nome: ['Capodanno', 'New Year', 'Nouvel An', 'Silvester', 'Nochevieja'],
    descrizione: [
      'Cenone e brindisi in terrazza: in preparazione.',
      'Gala dinner and a toast on the terrace: coming soon.',
      'Réveillon et toast en terrasse : en préparation.',
      'Silvestermenü und Anstoßen auf der Terrasse: in Vorbereitung.',
      'Cena de gala y brindis en la terraza: en preparación.',
    ],
  },
];

async function creaPacchetti(tipologie, extra) {
  const pacchetti = {};
  for (const [ordine, voce] of PACCHETTI.entries()) {
    const { chiave, tipologia, valido, servizi, foto, nome, descrizione, ...pacchetto } = voce;
    const testi = { nome, descrizione };
    pacchetti[chiave] = await tariffeService.creaPacchetto({
      ...pacchetto,
      ...italiano(testi),
      ordine,
      tipologia_id: tipologia ? tipologie[tipologia].id : null,
      valido_dal: valido ? giorno(valido[0]) : null,
      valido_al: valido ? giorno(valido[1]) : null,
      servizi: servizi.map(([servizio, quantita]) => ({
        servizio_id: extra[servizio].id,
        quantita,
      })),
    });
    await traduci('pacchetto', pacchetti[chiave].id, testi);
    if (foto) {
      await aggiungiFoto(
        { entita: 'pacchetto', entitaId: pacchetti[chiave].id, testoAlternativo: nome[0] },
        [foto],
      );
    }
  }
  return pacchetti;
}

async function creaTasse() {
  await tariffeService.creaTassa({
    nome: 'Imposta di soggiorno (vecchia tariffa)',
    valida_dal: giorno(-800),
    valida_al: giorno(-401),
    importo_notte: 1.5,
    notti_max: 5,
    eta_esenzione: 12,
    attiva: false,
  });
  await tariffeService.creaTassa({
    nome: 'Imposta di soggiorno',
    valida_dal: giorno(-400),
    valida_al: giorno(730),
    importo_notte: 2,
    notti_max: 7,
    eta_esenzione: 14,
  });
}

async function creaCatalogo(ctx, ctxAdmin) {
  const dotazione = await descriviDotazioni();
  const extra = await creaExtra();
  const tipologie = await creaTipologie(dotazione);
  const camere = await creaCamere(tipologie);
  const piani = await creaPiani();
  await creaPeriodi(ctx, ctxAdmin, tipologie);
  await creaPromozioni(ctx, tipologie);
  await creaCodici(ctx);
  const pacchetti = await creaPacchetti(tipologie, extra);
  await creaTasse();
  return { extra, tipologie, camere, piani, pacchetti };
}

module.exports = { creaCatalogo };
