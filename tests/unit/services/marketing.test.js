process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/models', () => ({
  sequelize: { transaction: (fn) => fn('transazione') },
}));
jest.mock('../../../src/repositories/notifiche.repository', () => ({
  creaNotifiche: jest.fn().mockResolvedValue([]),
  trovaIdClienti: jest.fn().mockResolvedValue([]),
  trovaClientiMarketing: jest.fn(),
}));
jest.mock('../../../src/repositories/utenti.repository', () => ({
  trovaUtentePerUuid: jest.fn(),
  aggiornaUtente: jest.fn(),
}));
jest.mock('../../../src/repositories/auth.repository', () => ({
  trovaDocumentoLegalePubblicato: jest.fn().mockResolvedValue({ id: 3 }),
  creaConsensi: jest.fn(),
}));
jest.mock('../../../src/services/impostazioni.service', () => ({
  leggi: jest.fn().mockResolvedValue('Casa del Mare'),
}));

const notificheRepo = require('../../../src/repositories/notifiche.repository');
const utentiRepo = require('../../../src/repositories/utenti.repository');
const authRepo = require('../../../src/repositories/auth.repository');
const auth = require('../../../src/services/auth.service');
const email = require('../../../src/services/email.service');
const notifiche = require('../../../src/services/notifiche.service');

const cliente = {
  id: 7,
  uuid: '6f1c2b1e-0000-4000-8000-000000000007',
  nome: 'Giulia',
  email: 'giulia@example.com',
  lingua: 'en',
  ospite_id: 9,
  email_marketing: true,
};
const tokenDelLink = (link) => new URL(link).searchParams.get('token');

beforeEach(() => jest.clearAllMocks());

describe('email delle offerte', () => {
  it('parte per chi ha il consenso, nella sua lingua, col link per disiscriversi', async () => {
    notificheRepo.trovaClientiMarketing.mockResolvedValue([cliente]);
    const invia = jest.spyOn(email, 'invia').mockResolvedValue(true);

    await notifiche.promozioneAiClienti({
      nome: 'Autunno',
      descrizione: null,
      soggiorno_dal: '2026-10-01',
      soggiorno_al: '2026-11-30',
    });
    await new Promise(setImmediate);

    expect(invia).toHaveBeenCalledWith(
      expect.objectContaining({
        a: cliente.email,
        modello: 'promozione',
        lingua: 'en',
        dati: expect.objectContaining({ dal: '01/10/2026', al: '30/11/2026' }),
      }),
    );
    const { disiscrizione } = invia.mock.calls[0][0].dati;
    expect(tokenDelLink(disiscrizione)).toMatch(new RegExp(`^${cliente.uuid}\\.`));
  });

  it('il piede col link di disiscrizione compare solo nelle offerte', () => {
    const dati = { nome: 'G', offerta: 'Autunno', dal: 'a', al: 'b', disiscrizione: 'https://x/d' };
    const offerta = email.componi('promozione', 'it', dati, 'Casa del Mare');
    expect(offerta.testo).toContain('Disiscriviti: https://x/d');
    expect(offerta.html).toContain('href="https://x/d"');

    const servizio = email.componi('fattura_emessa', 'it', { ...dati, numero: '1' }, '');
    expect(servizio.testo).not.toContain('https://x/d');
  });
});

describe('disiscrizione dal link', () => {
  it('revoca il consenso e lo registra; ripetuta non scrive nulla', async () => {
    utentiRepo.trovaUtentePerUuid.mockResolvedValue(cliente);
    const token = tokenDelLink(auth.linkDisiscrizione(cliente));

    await auth.disiscrivi(token, { ip: '1.2.3.4' });

    expect(utentiRepo.aggiornaUtente).toHaveBeenCalledWith(
      7,
      { email_marketing: false },
      'transazione',
    );
    expect(authRepo.creaConsensi).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          utente_id: 7,
          tipo: 'marketing',
          accettato: false,
          ip: '1.2.3.4',
        }),
      ],
      'transazione',
    );

    jest.clearAllMocks();
    utentiRepo.trovaUtentePerUuid.mockResolvedValue({ ...cliente, email_marketing: false });
    await auth.disiscrivi(token, {});
    expect(utentiRepo.aggiornaUtente).not.toHaveBeenCalled();
  });

  it('una firma alterata non vale', async () => {
    await expect(auth.disiscrivi(`${cliente.uuid}.falsa`, {})).rejects.toMatchObject({
      codice: 'LINK_NON_VALIDO',
    });
    expect(utentiRepo.trovaUtentePerUuid).not.toHaveBeenCalled();
  });
});
