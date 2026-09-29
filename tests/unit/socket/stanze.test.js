jest.mock('../../../src/repositories/chat.repository', () => ({
  trovaIdPartecipanti: jest.fn().mockResolvedValue([3, 7]),
}));

const { stanzeConversazione, stanzaDi } = require('../../../src/socket/stanze');

test('assistenza: lo staff che la gestisce e il cliente', async () => {
  const stanze = await stanzeConversazione({ tipo: 'assistenza', cliente_id: 5 });
  expect(stanze).toEqual(['assistenza', 'utente:5']);
});

test('assistenza da visitatore del sito', async () => {
  const stanze = await stanzeConversazione({ tipo: 'assistenza', visitatore_id: 9 });
  expect(stanze).toEqual(['assistenza', 'visitatore:9']);
});

test('chat interna: solo i partecipanti ancora dentro', async () => {
  const stanze = await stanzeConversazione({ tipo: 'staff', id: 1 });
  expect(stanze).toEqual(['utente:3', 'utente:7']);
});

test('stanza personale di utente e visitatore', () => {
  expect(stanzaDi({ utenteId: 4, ruolo: 'cliente' })).toBe('utente:4');
  expect(stanzaDi({ visitatoreId: 2 })).toBe('visitatore:2');
});
