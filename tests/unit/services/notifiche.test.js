process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/models', () => ({}));
jest.mock('../../../src/repositories/notifiche.repository', () => ({
  creaNotifiche: jest.fn(),
}));

const notificheRepo = require('../../../src/repositories/notifiche.repository');
const notifiche = require('../../../src/services/notifiche.service');

describe('notifiche.invia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificheRepo.creaNotifiche.mockImplementation((righe) =>
      Promise.resolve(righe.map((riga) => ({ toJSON: () => riga }))),
    );
  });

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
