const fs = require('node:fs');
const path = require('node:path');
const { dividiIstruzioni } = require('../../../database/schema');

describe('dividiIstruzioni', () => {
  test('divide sul punto e virgola', () => {
    expect(dividiIstruzioni('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  test("tiene l'ultima istruzione senza delimitatore", () => {
    expect(dividiIstruzioni('SELECT 1;\nSELECT 2')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  test('ignora il delimitatore dentro le stringhe', () => {
    expect(dividiIstruzioni('SELECT \'a;b\', "c;d", `e;f`;')).toEqual([
      'SELECT \'a;b\', "c;d", `e;f`',
    ]);
  });

  test('gestisce apici raddoppiati e backslash nelle stringhe', () => {
    expect(dividiIstruzioni("SELECT 'l''uno;', 'x\\';y';")).toEqual(["SELECT 'l''uno;', 'x\\';y'"]);
  });

  test('scarta i commenti', () => {
    const sql = '-- intro; ancora\nSELECT 1; # riga;\n/* blocco; */ SELECT 2;';
    expect(dividiIstruzioni(sql)).toEqual(['SELECT 1', 'SELECT 2']);
  });

  test('non scambia "--" senza spazio per un commento', () => {
    expect(dividiIstruzioni('SELECT 5--1;')).toEqual(['SELECT 5--1']);
  });

  test('cambia delimitatore con DELIMITER', () => {
    const sql = [
      'CREATE TABLE t (id INT);',
      'DELIMITER $$',
      'CREATE TRIGGER x BEFORE INSERT ON t FOR EACH ROW',
      'BEGIN',
      '  SET NEW.id = 1;',
      'END$$',
      'DELIMITER ;',
      'SELECT 1;',
    ].join('\n');
    expect(dividiIstruzioni(sql)).toEqual([
      'CREATE TABLE t (id INT)',
      'CREATE TRIGGER x BEFORE INSERT ON t FOR EACH ROW\nBEGIN\n  SET NEW.id = 1;\nEND',
      'SELECT 1',
    ]);
  });

  test('divide lo schema reale senza residui di DELIMITER', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../../../database/schema.sql'), 'utf8');
    const istruzioni = dividiIstruzioni(sql);
    expect(istruzioni.length).toBeGreaterThan(100);
    expect(istruzioni.some((s) => /^DELIMITER/i.test(s) || s.includes('$$'))).toBe(false);
    expect(istruzioni.filter((s) => s.startsWith('CREATE TRIGGER'))).toHaveLength(28);
  });
});
