process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/models', () => ({}));
jest.mock('../../../src/repositories/notifiche.repository', () => ({
  creaNotifiche: jest.fn(),
  trovaIdClienti: jest.fn(),
}));

const notificheRepo = require('../../../src/repositories/notifiche.repository');
const notifiche = require('../../../src/services/notifiche.service');

beforeEach(() => {
  jest.clearAllMocks();
  notificheRepo.creaNotifiche.mockImplementation((righe) =>
    Promise.resolve(righe.map((riga) => ({ toJSON: () => riga }))),
  );
});

describe('notifiche.invia', () => {
  it('salva codice e parametri per tradurre il titolo, una riga per destinatario', async () => {
    const emesse = [];
    notifiche.eventi.on('nuova', (notifica) => emesse.push(notifica));

    await notifiche.invia([3, 3, null, 4], {
      tipo: 'recensione',
      codice: 'recensione_nuova',
      parametri: { voto: 5 },
      titolo: 'Nuova recensione: 5/5',
    });

    expect(notificheRepo.creaNotifiche).toHaveBeenCalledWith([
      expect.objectContaining({ utente_id: 3, codice: 'recensione_nuova', parametri: { voto: 5 } }),
      expect.objectContaining({ utente_id: 4, priorita: 'info', testo: null, link: null }),
    ]);
    expect(emesse).toHaveLength(2);
  });

  it('senza destinatari non scrive nulla', async () => {
    await expect(notifiche.invia([null], { codice: 'guasto' })).resolves.toEqual([]);
    expect(notificheRepo.creaNotifiche).not.toHaveBeenCalled();
  });
});

describe('notifiche ai clienti', () => {
  const prenotazione = { id: 12, codice: 'BB-2026-0012', utente_id: 7, data_arrivo: '2026-10-20' };

  it("avvisa il titolare con account e apre la prenotazione nell'area personale", async () => {
    await notifiche.alCliente(prenotazione, 'pagamento_ricevuto', { importo: '120,00 €' });

    expect(notificheRepo.creaNotifiche).toHaveBeenCalledWith([
      expect.objectContaining({
        utente_id: 7,
        tipo: 'pagamento',
        priorita: 'successo',
        codice: 'pagamento_ricevuto',
        parametri: { codice: 'BB-2026-0012', data: '2026-10-20', importo: '120,00 €' },
        titolo: 'Pagamento di 120,00 € ricevuto per BB-2026-0012',
        link: '/area-personale/prenotazioni/12',
      }),
    ]);
  });

  it('la fattura apre le fatture del cliente', async () => {
    await notifiche.alCliente(prenotazione, 'fattura_emessa', { numero: '3/2026' });

    expect(notificheRepo.creaNotifiche).toHaveBeenCalledWith([
      expect.objectContaining({
        link: '/area-personale/fatture',
        titolo: 'Fattura 3/2026 disponibile',
      }),
    ]);
  });

  it('chi ha prenotato senza account riceve solo la email', async () => {
    await notifiche.alCliente({ ...prenotazione, utente_id: null }, 'prenotazione_confermata');
    await notifiche.alCliente(null, 'fattura_emessa');

    expect(notificheRepo.creaNotifiche).not.toHaveBeenCalled();
  });

  it('una nuova promozione arriva a tutti i clienti registrati', async () => {
    notificheRepo.trovaIdClienti.mockResolvedValue([7, 8]);

    await notifiche.promozioneAiClienti({
      nome: 'Autunno',
      soggiorno_dal: '2026-10-01',
      soggiorno_al: '2026-11-30',
    });

    expect(notificheRepo.creaNotifiche).toHaveBeenCalledWith([
      expect.objectContaining({ utente_id: 7, tipo: 'promozione', codice: 'nuova_promozione' }),
      expect.objectContaining({ utente_id: 8, link: '/offerte' }),
    ]);
  });
});
