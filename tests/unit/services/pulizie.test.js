process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/repositories/pulizie.repository', () => ({
  trovaAttivitaPerId: jest.fn(),
  aggiornaAttivita: jest.fn(),
  trovaCoda: jest.fn(),
  trovaAperteAssegnate: jest.fn(),
  trovaUltimaFinita: jest.fn(),
  prendiSeLibera: jest.fn(),
}));
jest.mock('../../../src/repositories/utenti.repository', () => ({ trovaStaffAttivo: jest.fn() }));
jest.mock('../../../src/services/impostazioni.service', () => ({ leggi: jest.fn() }));
jest.mock('../../../src/services/notifiche.service', () => ({
  invia: jest.fn(),
  aChiPuo: jest.fn(),
}));
jest.mock('../../../src/services/permessi.service', () => ({ ha: jest.fn() }));

const pulizieRepo = require('../../../src/repositories/pulizie.repository');
const utentiRepo = require('../../../src/repositories/utenti.repository');
const impostazioni = require('../../../src/services/impostazioni.service');
const permessi = require('../../../src/services/permessi.service');
const pulizie = require('../../../src/services/pulizie.service');

const GIORNO = '2026-10-04';
const camera = (id, piano, extra = {}) => ({
  id,
  priorita: 'normale',
  rinviata_il: null,
  camera: { numero: String(id), piano },
  ...extra,
});
const ids = (elenco) => elenco.map((attivita) => attivita.id);

// A turno, ispezione spenta: avanza e rinvia passano subito alla prossima.
const impostazioniTurno = (chiave) => Promise.resolve(chiave === 'pulizie_autoassegna');

beforeEach(() => {
  jest.clearAllMocks();
  impostazioni.leggi.mockImplementation(impostazioniTurno);
  permessi.ha.mockResolvedValue(false);
  pulizieRepo.prendiSeLibera.mockResolvedValue([1]);
  pulizieRepo.trovaAperteAssegnate.mockResolvedValue([]);
  pulizieRepo.trovaUltimaFinita.mockResolvedValue(null);
});

describe('ordinaCoda', () => {
  const coda = [camera(301, 3), camera(101, 1), camera(1, 0), camera(201, 2), camera(302, 3)];

  it('dal piano di partenza va al più vicino, senza saltare tra piani lontani', () => {
    expect(ids(pulizie.ordinaCoda(coda, 3))).toEqual([301, 302, 201, 101, 1]);
  });

  it('le rinviate in fondo, le urgenti in testa', () => {
    const conRinvio = [
      camera(301, 3, { rinviata_il: new Date() }),
      camera(1, 0, { priorita: 'urgente' }),
      camera(302, 3),
    ];
    expect(ids(pulizie.ordinaCoda(conRinvio, 3))).toEqual([1, 302, 301]);
  });

  it('a inizio turno il piano con meno gente', () => {
    const affollamento = new Map([
      [0, 2],
      [1, 1],
    ]);
    expect(ids(pulizie.ordinaCoda(coda, null, affollamento))).toEqual([201, 301, 302, 101, 1]);
  });
});

describe('autoassegna a turno', () => {
  it('una camera per addetto libero, sparpagliati per piano', async () => {
    utentiRepo.trovaStaffAttivo.mockResolvedValue([{ id: 7 }, { id: 8 }, { id: 9 }]);
    const coda = [camera(1, 0), camera(2, 0), camera(101, 1)];
    const aperte = [{ assegnata_a: 9, camera: { piano: 2 } }];
    pulizieRepo.trovaCoda.mockImplementation(() => Promise.resolve(coda));
    pulizieRepo.trovaAperteAssegnate.mockImplementation(() => Promise.resolve(aperte));
    pulizieRepo.prendiSeLibera.mockImplementation((id, utenteId) => {
      const presa = coda.splice(
        coda.findIndex((attivita) => attivita.id === id),
        1,
      )[0];
      aperte.push({ ...presa, assegnata_a: utenteId });
      return Promise.resolve([1]);
    });
    pulizieRepo.trovaAttivitaPerId.mockImplementation((id) => Promise.resolve({ id }));

    expect(await pulizie.autoassegna(GIORNO)).toEqual({ assegnate: 2, non_assegnate: 1 });
    expect(pulizieRepo.prendiSeLibera.mock.calls).toEqual([
      [1, 7],
      [101, 8],
    ]);
  });

  it('se un altro addetto la prende prima passa alla successiva', async () => {
    pulizieRepo.trovaCoda.mockResolvedValue([camera(1, 0), camera(2, 0)]);
    pulizieRepo.prendiSeLibera.mockResolvedValueOnce([0]).mockResolvedValueOnce([1]);
    pulizieRepo.trovaAttivitaPerId.mockResolvedValue(camera(2, 0, { assegnata_a: 5 }));

    expect((await pulizie.prossima({ utenteId: 5 })).id).toBe(2);
  });
});

describe('prossima', () => {
  it('chi ha già una camera aperta deve finirla', async () => {
    pulizieRepo.trovaAperteAssegnate.mockResolvedValue([{ assegnata_a: 5, camera: { piano: 1 } }]);

    await expect(pulizie.prossima({ utenteId: 5 })).rejects.toMatchObject({
      codice: 'PULIZIA_IN_CORSO',
    });
  });

  it('niente da prendere', async () => {
    pulizieRepo.trovaCoda.mockResolvedValue([]);

    await expect(pulizie.prossima({ utenteId: 5 })).rejects.toMatchObject({
      codice: 'NESSUNA_PULIZIA_LIBERA',
    });
  });

  it('riparte dal piano dell ultima camera finita', async () => {
    pulizieRepo.trovaUltimaFinita.mockResolvedValue({ camera: { piano: 2 } });
    pulizieRepo.trovaCoda.mockResolvedValue([camera(1, 0), camera(301, 3)]);
    pulizieRepo.trovaAttivitaPerId.mockImplementation((id) => Promise.resolve({ id }));

    expect((await pulizie.prossima({ utenteId: 5 })).id).toBe(301);
  });
});

describe('avanza a turno', () => {
  it('a chi finisce dà subito la camera dopo, dal suo piano', async () => {
    const inCorso = camera(201, 2, {
      stato: 'in_corso',
      assegnata_a: 5,
      data_prevista: GIORNO,
      checklist: [{ voce: 'Letto', fatto: true }],
    });
    pulizieRepo.trovaAttivitaPerId
      .mockResolvedValueOnce(inCorso)
      .mockResolvedValueOnce({ ...inCorso, stato: 'completata' })
      .mockResolvedValue({ id: 202 });
    pulizieRepo.trovaCoda.mockResolvedValue([camera(1, 0), camera(202, 2)]);

    await pulizie.avanza(201, { stato: 'completata' }, { utenteId: 5 });

    expect(pulizieRepo.prendiSeLibera).toHaveBeenCalledWith(202, 5);
  });

  it('rimessa da fare: il tempo riparte', async () => {
    pulizieRepo.trovaAttivitaPerId.mockResolvedValue(
      camera(201, 2, { stato: 'in_corso', assegnata_a: 5 }),
    );

    await pulizie.avanza(201, { stato: 'da_fare' }, { utenteId: 5 });

    expect(pulizieRepo.aggiornaAttivita).toHaveBeenCalledWith(
      201,
      expect.objectContaining({ stato: 'da_fare', iniziata_il: null }),
    );
  });
});

describe('rinvia', () => {
  const inCorso = camera(201, 2, { stato: 'in_corso', assegnata_a: 5, data_prevista: GIORNO });

  it('più tardi: torna libera in fondo alla coda e l addetto passa a un altra', async () => {
    pulizieRepo.trovaAttivitaPerId.mockResolvedValue(inCorso);
    pulizieRepo.trovaCoda.mockResolvedValue([camera(201, 2), camera(202, 2)]);

    await pulizie.rinvia(201, { quando: 'oggi' }, { utenteId: 5 });

    expect(pulizieRepo.aggiornaAttivita).toHaveBeenCalledWith(201, {
      stato: 'da_fare',
      assegnata_a: null,
      iniziata_il: null,
      rinviata_il: expect.any(Date),
      data_prevista: undefined,
    });
    expect(pulizieRepo.prendiSeLibera.mock.calls).toEqual([[202, 5]]);
  });

  it('domani: passa al giorno dopo', async () => {
    pulizieRepo.trovaAttivitaPerId.mockResolvedValue(inCorso);
    pulizieRepo.trovaCoda.mockResolvedValue([]);

    await pulizie.rinvia(201, { quando: 'domani' }, { utenteId: 5 });

    expect(pulizieRepo.aggiornaAttivita).toHaveBeenCalledWith(
      201,
      expect.objectContaining({ data_prevista: '2026-10-05', rinviata_il: null }),
    );
  });

  it('non si rinvia una camera finita né quella di un altro', async () => {
    pulizieRepo.trovaAttivitaPerId.mockResolvedValueOnce({ ...inCorso, stato: 'completata' });
    await expect(pulizie.rinvia(201, { quando: 'oggi' }, { utenteId: 5 })).rejects.toMatchObject({
      codice: 'PULIZIA_NON_RINVIABILE',
    });

    pulizieRepo.trovaAttivitaPerId.mockResolvedValueOnce(inCorso);
    await expect(pulizie.rinvia(201, { quando: 'oggi' }, { utenteId: 6 })).rejects.toMatchObject({
      codice: 'PULIZIA_ALTRUI',
    });
  });
});
