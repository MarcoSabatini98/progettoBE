-- =============================================================================
-- SCHEMA DATABASE — Gestionale struttura ricettiva
-- -----------------------------------------------------------------------------
-- Compatibile con MariaDB 10.6+ e MySQL 8.0.16+.
--
-- Esecuzione consigliata:   npm run db:crea          (crea il DB da .env)
--                           npm run db:crea -- --reset  (lo ricrea da zero)
-- In alternativa, da client: mysql -u root -p nome_db < database/schema.sql
--
-- Convenzioni:
--   - nomi di tabelle e colonne in italiano, snake_case;
--   - date/ore salvate in UTC (la connessione usa time_zone '+00:00');
--   - intervalli di soggiorno [data_arrivo, data_partenza): la data di
--     partenza NON è una notte occupata. Stessa regola per date_bloccate;
--   - gli errori dei trigger usano SIGNAL con un codice in MAIUSCOLO che il
--     backend traduce in un messaggio italiano (vedi src/utils/errori-db.js);
--   - vincoli UNIQUE e CHECK hanno nomi espliciti (uq_*, chk_*) per lo stesso
--     motivo.
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- =============================================================================
-- 1. RUOLI, PERMESSI, REGOLE CHAT
-- =============================================================================

CREATE TABLE ruoli (
  codice        VARCHAR(30)  NOT NULL,
  nome          VARCHAR(50)  NOT NULL,
  descrizione   VARCHAR(255) NULL,
  staff         BOOLEAN      NOT NULL DEFAULT FALSE,
  PRIMARY KEY (codice)
);

CREATE TABLE permessi (
  codice        VARCHAR(50)  NOT NULL,
  modulo        VARCHAR(30)  NOT NULL,
  descrizione   VARCHAR(255) NOT NULL,
  PRIMARY KEY (codice)
);

-- Permessi assegnati ai ruoli: modificabili dall'admin.
CREATE TABLE ruoli_permessi (
  ruolo         VARCHAR(30)  NOT NULL,
  permesso      VARCHAR(50)  NOT NULL,
  PRIMARY KEY (ruolo, permesso),
  FOREIGN KEY (ruolo)    REFERENCES ruoli(codice)    ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (permesso) REFERENCES permessi(codice) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Coppie di ruoli dello staff che possono chattare tra loro (chat interna).
-- La coppia è salvata in ordine alfabetico (ruolo_a <= ruolo_b): lo garantisce
-- il trigger trg_regole_chat_bi (MariaDB non ammette CHECK su FK in CASCADE).
CREATE TABLE regole_chat (
  ruolo_a       VARCHAR(30)  NOT NULL,
  ruolo_b       VARCHAR(30)  NOT NULL,
  PRIMARY KEY (ruolo_a, ruolo_b),
  FOREIGN KEY (ruolo_a) REFERENCES ruoli(codice) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (ruolo_b) REFERENCES ruoli(codice) ON UPDATE CASCADE ON DELETE CASCADE
);


-- =============================================================================
-- 2. UTENTI, TOKEN, VISITATORI
-- =============================================================================

CREATE TABLE utenti (
  id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  uuid                  CHAR(36)      NOT NULL DEFAULT (UUID()),
  email                 VARCHAR(255)  NOT NULL,
  password_hash         VARCHAR(255)  NOT NULL,
  ruolo                 VARCHAR(30)   NOT NULL DEFAULT 'cliente',
  nome                  VARCHAR(100)  NOT NULL,
  cognome               VARCHAR(100)  NOT NULL,
  telefono              VARCHAR(30)   NULL,
  lingua                CHAR(2)       NOT NULL DEFAULT 'it',
  attivo                BOOLEAN       NOT NULL DEFAULT TRUE,
  email_verificata_il   DATETIME      NULL,
  notifiche_email       BOOLEAN       NOT NULL DEFAULT TRUE,
  email_marketing       BOOLEAN       NOT NULL DEFAULT FALSE,   -- offerte via email: stato attuale, la prova sta in consensi
  punti_fedelta         INT           NOT NULL DEFAULT 0,   -- aggiornato dal trigger su movimenti_punti
  ospite_id             INT UNSIGNED  NULL,   -- anagrafica personale del titolare (area cliente); FK dopo ospiti
  ultimo_accesso_il     DATETIME      NULL,
  creato_il             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  eliminato_il          DATETIME      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_utenti_uuid  (uuid),
  UNIQUE KEY uq_utenti_email (email),
  UNIQUE KEY uq_utenti_ospite (ospite_id),
  KEY idx_utenti_ruolo (ruolo),
  CONSTRAINT chk_utenti_punti CHECK (punti_fedelta >= 0),
  FOREIGN KEY (ruolo) REFERENCES ruoli(codice) ON UPDATE CASCADE
);

-- Token di sessione e codici monouso. Si salva solo l'hash SHA-256.
--   refresh         : rotazione a ogni uso; "famiglia" collega la catena per
--                     rilevare il riuso di un token già ruotato.
--   verifica_email  : codice a 6 cifre (hash di utente_id + codice).
--   reset_password  : token casuale inviato via email.
CREATE TABLE token_utente (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  utente_id     INT UNSIGNED  NOT NULL,
  tipo          ENUM('refresh','verifica_email','reset_password') NOT NULL,
  hash_token    CHAR(64)      NOT NULL,
  famiglia      CHAR(36)      NULL,
  tentativi     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  scade_il      DATETIME      NOT NULL,
  usato_il      DATETIME      NULL,
  revocato_il   DATETIME      NULL,
  ip            VARCHAR(45)   NULL,
  user_agent    VARCHAR(255)  NULL,
  creato_il     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_token_utente_hash (hash_token),
  KEY idx_token_utente_tipo (utente_id, tipo),
  KEY idx_token_utente_famiglia (famiglia),
  KEY idx_token_utente_scadenza (scade_il),
  FOREIGN KEY (utente_id) REFERENCES utenti(id) ON DELETE CASCADE
);

-- Visitatori non registrati che usano la chat di assistenza.
-- Ricevono un JWT firmato con il loro uuid.
CREATE TABLE visitatori (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  uuid                CHAR(36)      NOT NULL DEFAULT (UUID()),
  nome                VARCHAR(100)  NULL,
  email               VARCHAR(255)  NULL,
  lingua              CHAR(2)       NOT NULL DEFAULT 'it',
  utente_id           INT UNSIGNED  NULL,   -- valorizzato se in seguito si registra
  ip                  VARCHAR(45)   NULL,
  user_agent          VARCHAR(255)  NULL,
  bloccato            BOOLEAN       NOT NULL DEFAULT FALSE,
  ultimo_accesso_il   DATETIME      NULL,
  creato_il           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_visitatori_uuid (uuid),
  KEY idx_visitatori_ultimo_accesso (ultimo_accesso_il),
  FOREIGN KEY (utente_id) REFERENCES utenti(id) ON DELETE SET NULL
);


-- =============================================================================
-- 3. IMPOSTAZIONI, TRADUZIONI, DOCUMENTI LEGALI
-- =============================================================================

CREATE TABLE impostazioni (
  chiave          VARCHAR(60)   NOT NULL,
  valore          TEXT          NOT NULL,
  tipo            ENUM('testo','numero','booleano','json') NOT NULL DEFAULT 'testo',
  gruppo          VARCHAR(30)   NOT NULL DEFAULT 'generale',
  descrizione     VARCHAR(255)  NULL,
  pubblica        BOOLEAN       NOT NULL DEFAULT FALSE,   -- leggibile dal sito senza login
  aggiornato_da   INT UNSIGNED  NULL,
  aggiornato_il   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (chiave),
  KEY idx_impostazioni_gruppo (gruppo),
  FOREIGN KEY (aggiornato_da) REFERENCES utenti(id) ON DELETE SET NULL
);

-- Traduzioni dei contenuti. Il testo in italiano resta nella tabella
-- originale; qui ci sono le altre lingue.
-- Esempio: ('tipologia_camera', 3, 'descrizione', 'en', '...')
CREATE TABLE traduzioni (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  entita          VARCHAR(30)   NOT NULL,
  entita_id       INT UNSIGNED  NOT NULL,
  campo           VARCHAR(30)   NOT NULL,
  lingua          CHAR(2)       NOT NULL,
  testo           TEXT          NOT NULL,
  aggiornato_il   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_traduzioni (entita, entita_id, campo, lingua)
);

CREATE TABLE documenti_legali (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  tipo            ENUM('privacy','termini','cookie') NOT NULL,
  versione        VARCHAR(20)   NOT NULL,
  lingua          CHAR(2)       NOT NULL DEFAULT 'it',
  contenuto       MEDIUMTEXT    NULL,
  percorso_pdf    VARCHAR(255)  NULL,
  pubblicato_il   DATETIME      NULL,
  creato_da       INT UNSIGNED  NULL,
  creato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_documenti_legali (tipo, versione, lingua),
  FOREIGN KEY (creato_da) REFERENCES utenti(id) ON DELETE SET NULL
);


-- =============================================================================
-- 4. CAMERE, SERVIZI, MEDIA
-- =============================================================================

CREATE TABLE tipologie_camera (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nome            VARCHAR(100)  NOT NULL,
  slug            VARCHAR(120)  NOT NULL,
  descrizione     TEXT          NULL,
  prezzo_base     DECIMAL(10,2) NOT NULL,          -- prezzo a notte per camera
  ospiti_max      TINYINT UNSIGNED NOT NULL DEFAULT 2,
  superficie_mq   SMALLINT UNSIGNED NULL,
  letti           VARCHAR(100)  NULL,              -- es. "1 matrimoniale + 1 singolo"
  ordine          SMALLINT      NOT NULL DEFAULT 0,
  attiva          BOOLEAN       NOT NULL DEFAULT TRUE,
  creato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  eliminato_il    DATETIME      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tipologie_camera_nome (nome),
  UNIQUE KEY uq_tipologie_camera_slug (slug),
  CONSTRAINT chk_tipologie_camera_prezzo CHECK (prezzo_base >= 0),
  CONSTRAINT chk_tipologie_camera_ospiti CHECK (ospiti_max > 0)
);

-- dotazione = caratteristica inclusa (Wi-Fi, vista mare, balcone...)
-- extra     = servizio acquistabile (colazione, culla, parcheggio...)
CREATE TABLE servizi (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nome            VARCHAR(100)  NOT NULL,
  descrizione     VARCHAR(255)  NULL,
  icona           VARCHAR(50)   NULL,
  tipo            ENUM('dotazione','extra') NOT NULL DEFAULT 'dotazione',
  prezzo          DECIMAL(10,2) NOT NULL DEFAULT 0,
  calcolo_prezzo  ENUM('a_soggiorno','a_notte','a_persona','a_persona_notte') NOT NULL DEFAULT 'a_soggiorno',
  aliquota_iva    DECIMAL(5,2)  NULL,   -- NULL = aliquota servizi da impostazioni
  ordine          SMALLINT      NOT NULL DEFAULT 0,
  attivo          BOOLEAN       NOT NULL DEFAULT TRUE,
  creato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  eliminato_il    DATETIME      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_servizi_nome (nome),
  CONSTRAINT chk_servizi_prezzo CHECK (prezzo >= 0)
);

CREATE TABLE tipologie_camera_servizi (
  tipologia_id    INT UNSIGNED  NOT NULL,
  servizio_id     INT UNSIGNED  NOT NULL,
  PRIMARY KEY (tipologia_id, servizio_id),
  FOREIGN KEY (tipologia_id) REFERENCES tipologie_camera(id) ON DELETE CASCADE,
  FOREIGN KEY (servizio_id)  REFERENCES servizi(id)          ON DELETE CASCADE
);

-- stato         : disponibilità operativa della camera.
-- stato_pulizia : aggiornato dai trigger di prenotazioni e attivita_pulizia.
-- "Occupata" non è salvato: si ricava dalle prenotazioni (vedi v_stato_camere).
CREATE TABLE camere (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  numero          VARCHAR(10)   NOT NULL,
  nome            VARCHAR(100)  NULL,
  tipologia_id    INT UNSIGNED  NOT NULL,
  piano           TINYINT       NOT NULL DEFAULT 0,
  ospiti_max      TINYINT UNSIGNED NULL,           -- NULL = quello della tipologia
  stato           ENUM('attiva','manutenzione','fuori_servizio') NOT NULL DEFAULT 'attiva',
  stato_pulizia   ENUM('pulita','sporca','in_pulizia','da_ispezionare') NOT NULL DEFAULT 'pulita',
  token_ical      CHAR(64)      NULL,              -- token dell'URL pubblico di esportazione iCal
  note            TEXT          NULL,
  creato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  eliminato_il    DATETIME      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_camere_numero (numero),
  UNIQUE KEY uq_camere_token_ical (token_ical),
  KEY idx_camere_tipologia (tipologia_id),
  CONSTRAINT chk_camere_ospiti CHECK (ospiti_max IS NULL OR ospiti_max > 0),
  FOREIGN KEY (tipologia_id) REFERENCES tipologie_camera(id)
);

-- Dotazioni specifiche della singola camera (es. solo la 101 ha vista mare).
CREATE TABLE camere_servizi (
  camera_id       INT UNSIGNED  NOT NULL,
  servizio_id     INT UNSIGNED  NOT NULL,
  PRIMARY KEY (camera_id, servizio_id),
  FOREIGN KEY (camera_id)   REFERENCES camere(id)  ON DELETE CASCADE,
  FOREIGN KEY (servizio_id) REFERENCES servizi(id) ON DELETE CASCADE
);

-- Immagini e video. Relazione polimorfica: entita + entita_id.
-- entita_id NULL per i contenuti generali (home, home_scuro, logo, struttura, varie).
-- home e home_scuro: sfondo della home col tema chiaro e col tema scuro.
CREATE TABLE media (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  entita              ENUM('camera','tipologia_camera','servizio','pacchetto','struttura','home','home_scuro','logo','varie') NOT NULL,
  entita_id           INT UNSIGNED  NULL,
  percorso            VARCHAR(255)  NOT NULL,      -- relativo alla cartella uploads
  tipo_mime           VARCHAR(50)   NOT NULL,
  dimensione          INT UNSIGNED  NOT NULL,      -- byte
  larghezza           SMALLINT UNSIGNED NULL,
  altezza             SMALLINT UNSIGNED NULL,
  testo_alternativo   VARCHAR(255)  NOT NULL DEFAULT '',
  ordine              SMALLINT      NOT NULL DEFAULT 0,
  creato_il           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_media_entita (entita, entita_id, ordine)
);


-- =============================================================================
-- 5. TARIFFE, PROMOZIONI, FEDELTÀ, TASSA DI SOGGIORNO
-- -----------------------------------------------------------------------------
-- Ordine di calcolo del prezzo (eseguito dal backend):
--   1. per ogni notte: prezzo_base tipologia
--        → variazione del periodo tariffario più prioritario che la copre
--        → variazione del piano tariffario scelto (es. non rimborsabile -10%)
--   2. importo_soggiorno = somma delle notti
--   3. − promozione migliore applicabile (non cumulabili tra loro)
--   4. − codice sconto
--   5. − sconto fedeltà del livello cliente (% sul risultato del punto 4)
--   6. + pacchetto + servizi extra + tassa di soggiorno (non scontati)
-- =============================================================================

-- Piano tariffario = regole di vendita: politica di cancellazione, acconto,
-- eventuale variazione di prezzo (es. "Non rimborsabile" -10%).
CREATE TABLE piani_tariffari (
  id                          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nome                        VARCHAR(100)  NOT NULL,
  descrizione                 TEXT          NULL,
  tipo_variazione             ENUM('percentuale','importo') NOT NULL DEFAULT 'percentuale',
  valore_variazione           DECIMAL(10,2) NOT NULL DEFAULT 0,   -- negativo = sconto a notte
  rimborsabile                BOOLEAN       NOT NULL DEFAULT TRUE,
  ore_cancellazione_gratuita  SMALLINT UNSIGNED NOT NULL DEFAULT 48,
  penale_percentuale          DECIMAL(5,2)  NOT NULL DEFAULT 0,   -- sul totale, se si cancella oltre il limite
  acconto_percentuale         DECIMAL(5,2)  NOT NULL DEFAULT 30,
  predefinito                 BOOLEAN       NOT NULL DEFAULT FALSE,
  -- consente un solo piano predefinito (UNIQUE ignora i NULL)
  predefinito_unico           TINYINT AS (IF(predefinito, 1, NULL)) STORED,
  attivo                      BOOLEAN       NOT NULL DEFAULT TRUE,
  ordine                      SMALLINT      NOT NULL DEFAULT 0,
  creato_il                   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_piani_tariffari_nome (nome),
  UNIQUE KEY uq_piani_tariffari_predefinito (predefinito_unico),
  CONSTRAINT chk_piani_tariffari_penale  CHECK (penale_percentuale BETWEEN 0 AND 100),
  CONSTRAINT chk_piani_tariffari_acconto CHECK (acconto_percentuale BETWEEN 0 AND 100)
);

-- Alta/bassa stagione, weekend, eventi. Date comprese (sono le notti).
-- Se più periodi coprono la stessa notte vince la priorità più alta; a
-- parità, quello legato alla tipologia vince su quello generico.
CREATE TABLE periodi_tariffari (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nome                VARCHAR(100)  NOT NULL,
  tipologia_id        INT UNSIGNED  NULL,          -- NULL = tutte le tipologie
  data_inizio         DATE          NOT NULL,
  data_fine           DATE          NOT NULL,
  giorni_settimana    TINYINT UNSIGNED NOT NULL DEFAULT 127,  -- bit: 1=lun 2=mar 4=mer 8=gio 16=ven 32=sab 64=dom
  tipo_variazione     ENUM('percentuale','importo','prezzo_fisso') NOT NULL,
  valore              DECIMAL(10,2) NOT NULL,      -- negativo = sconto
  soggiorno_minimo    TINYINT UNSIGNED NULL,
  priorita            SMALLINT      NOT NULL DEFAULT 0,
  attivo              BOOLEAN       NOT NULL DEFAULT TRUE,
  creato_da           INT UNSIGNED  NULL,
  aggiornato_da       INT UNSIGNED  NULL,
  creato_il           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_periodi_tariffari_date (data_inizio, data_fine),
  CONSTRAINT chk_periodi_tariffari_date   CHECK (data_fine >= data_inizio),
  CONSTRAINT chk_periodi_tariffari_giorni CHECK (giorni_settimana BETWEEN 1 AND 127),
  CONSTRAINT chk_periodi_tariffari_prezzo CHECK (tipo_variazione <> 'prezzo_fisso' OR valore >= 0),
  FOREIGN KEY (tipologia_id)  REFERENCES tipologie_camera(id) ON DELETE CASCADE,
  FOREIGN KEY (creato_da)     REFERENCES utenti(id) ON DELETE SET NULL,
  FOREIGN KEY (aggiornato_da) REFERENCES utenti(id) ON DELETE SET NULL
);

-- Promozioni decise dalla struttura (es. San Valentino: coppie -10%).
-- percentuale: si applica alle notti che cadono nel periodo di soggiorno.
-- importo    : sconto fisso sulla prenotazione.
CREATE TABLE promozioni (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nome                VARCHAR(100)  NOT NULL,
  descrizione         TEXT          NULL,
  tipologia_id        INT UNSIGNED  NULL,
  soggiorno_dal       DATE          NOT NULL,
  soggiorno_al        DATE          NOT NULL,
  prenotabile_dal     DATE          NULL,
  prenotabile_al      DATE          NULL,
  tipo_sconto         ENUM('percentuale','importo') NOT NULL,
  valore              DECIMAL(10,2) NOT NULL,
  ospiti_min          TINYINT UNSIGNED NULL,
  ospiti_max          TINYINT UNSIGNED NULL,
  notti_min           TINYINT UNSIGNED NULL,
  attiva              BOOLEAN       NOT NULL DEFAULT TRUE,
  creato_da           INT UNSIGNED  NULL,
  creato_il           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_promozioni_soggiorno (soggiorno_dal, soggiorno_al),
  CONSTRAINT chk_promozioni_date   CHECK (soggiorno_al >= soggiorno_dal),
  CONSTRAINT chk_promozioni_valore CHECK (valore > 0 AND (tipo_sconto <> 'percentuale' OR valore <= 100)),
  CONSTRAINT chk_promozioni_ospiti CHECK (ospiti_min IS NULL OR ospiti_max IS NULL OR ospiti_max >= ospiti_min),
  FOREIGN KEY (tipologia_id) REFERENCES tipologie_camera(id) ON DELETE CASCADE,
  FOREIGN KEY (creato_da)    REFERENCES utenti(id) ON DELETE SET NULL
);

CREATE TABLE codici_sconto (
  id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  codice                VARCHAR(30)   NOT NULL,
  descrizione           VARCHAR(255)  NULL,
  tipo_sconto           ENUM('percentuale','importo') NOT NULL,
  valore                DECIMAL(10,2) NOT NULL,
  valido_dal            DATE          NULL,
  valido_al             DATE          NULL,
  importo_minimo        DECIMAL(10,2) NULL,
  notti_min             TINYINT UNSIGNED NULL,
  utilizzi_max          INT UNSIGNED  NULL,
  utilizzi_per_utente   SMALLINT UNSIGNED NULL,
  utilizzi              INT UNSIGNED  NOT NULL DEFAULT 0,   -- aggiornato dai trigger di prenotazioni
  attivo                BOOLEAN       NOT NULL DEFAULT TRUE,
  creato_da             INT UNSIGNED  NULL,
  creato_il             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_codici_sconto_codice (codice),
  CONSTRAINT chk_codici_sconto_valore CHECK (valore > 0 AND (tipo_sconto <> 'percentuale' OR valore <= 100)),
  CONSTRAINT chk_codici_sconto_date   CHECK (valido_dal IS NULL OR valido_al IS NULL OR valido_al >= valido_dal),
  FOREIGN KEY (creato_da) REFERENCES utenti(id) ON DELETE SET NULL
);

-- Pacchetti (es. "Weekend romantico": cena + spa). Il prezzo si somma al soggiorno.
CREATE TABLE pacchetti (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nome            VARCHAR(100)  NOT NULL,
  slug            VARCHAR(120)  NOT NULL,
  descrizione     TEXT          NULL,
  prezzo          DECIMAL(10,2) NOT NULL,
  tipologia_id    INT UNSIGNED  NULL,
  notti_min       TINYINT UNSIGNED NULL,
  valido_dal      DATE          NULL,
  valido_al       DATE          NULL,
  attivo          BOOLEAN       NOT NULL DEFAULT TRUE,
  ordine          SMALLINT      NOT NULL DEFAULT 0,
  creato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pacchetti_slug (slug),
  CONSTRAINT chk_pacchetti_prezzo CHECK (prezzo >= 0),
  FOREIGN KEY (tipologia_id) REFERENCES tipologie_camera(id) ON DELETE SET NULL
);

CREATE TABLE pacchetti_servizi (
  pacchetto_id    INT UNSIGNED  NOT NULL,
  servizio_id     INT UNSIGNED  NOT NULL,
  quantita        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (pacchetto_id, servizio_id),
  FOREIGN KEY (pacchetto_id) REFERENCES pacchetti(id) ON DELETE CASCADE,
  FOREIGN KEY (servizio_id)  REFERENCES servizi(id)   ON DELETE CASCADE
);

-- Tariffe dell'imposta comunale di soggiorno (per persona, per notte).
CREATE TABLE tassa_soggiorno (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nome            VARCHAR(100)  NOT NULL,
  valida_dal      DATE          NOT NULL,
  valida_al       DATE          NOT NULL,
  importo_notte   DECIMAL(6,2)  NOT NULL,
  notti_max       TINYINT UNSIGNED NULL,   -- tetto di notti tassabili
  eta_esenzione   TINYINT UNSIGNED NULL,   -- esenti sotto questa età
  attiva          BOOLEAN       NOT NULL DEFAULT TRUE,
  creato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_tassa_soggiorno_date    CHECK (valida_al >= valida_dal),
  CONSTRAINT chk_tassa_soggiorno_importo CHECK (importo_notte >= 0)
);

-- Livelli del programma fedeltà. Il livello di un cliente è quello con il
-- punteggio minimo più alto raggiunto (vedi v_fedelta_utenti).
CREATE TABLE livelli_fedelta (
  id                  TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codice              VARCHAR(20)   NOT NULL,
  nome                VARCHAR(50)   NOT NULL,
  punti_minimi        INT UNSIGNED  NOT NULL,
  sconto_percentuale  DECIMAL(5,2)  NOT NULL DEFAULT 0,
  colore              CHAR(7)       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_livelli_fedelta_codice (codice),
  UNIQUE KEY uq_livelli_fedelta_punti  (punti_minimi),
  CONSTRAINT chk_livelli_fedelta_sconto CHECK (sconto_percentuale BETWEEN 0 AND 100)
);


-- =============================================================================
-- 6. OSPITI (dati TULPS / Alloggiati Web)
-- =============================================================================

-- Codici luogo di Alloggiati Web (comuni italiani e stati esteri).
-- Popolata dall'import delle tabelle ufficiali, non a mano.
CREATE TABLE alloggiati_luoghi (
  codice          CHAR(9)       NOT NULL,
  descrizione     VARCHAR(100)  NOT NULL,
  provincia       CHAR(2)       NULL,
  tipo            ENUM('comune','stato') NOT NULL,
  soppresso_il    DATE          NULL,
  PRIMARY KEY (codice),
  KEY idx_alloggiati_luoghi_descrizione (tipo, descrizione)
);

CREATE TABLE alloggiati_documenti (
  codice          VARCHAR(5)    NOT NULL,
  descrizione     VARCHAR(100)  NOT NULL,
  PRIMARY KEY (codice)
);

-- I campi *_codice usano i codici Alloggiati. Niente FK verso le tabelle
-- Alloggiati: così gli ospiti si possono salvare anche prima dell'import.
CREATE TABLE ospiti (
  id                      INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  uuid                    CHAR(36)      NOT NULL DEFAULT (UUID()),
  utente_id               INT UNSIGNED  NULL,
  nome                    VARCHAR(100)  NOT NULL,
  cognome                 VARCHAR(100)  NOT NULL,
  email                   VARCHAR(255)  NULL,
  telefono                VARCHAR(30)   NULL,
  sesso                   ENUM('M','F') NULL,
  data_nascita            DATE          NULL,
  cittadinanza_codice     CHAR(9)       NULL,
  stato_nascita_codice    CHAR(9)       NULL,
  comune_nascita_codice   CHAR(9)       NULL,   -- solo per i nati in Italia
  provincia_nascita       CHAR(2)       NULL,   -- sigla, solo per i nati in Italia
  tipo_documento          VARCHAR(5)    NULL,   -- IDENT, PASOR, PATEN...
  numero_documento        VARCHAR(30)   NULL,
  luogo_rilascio_codice   CHAR(9)       NULL,
  scadenza_documento      DATE          NULL,
  codice_fiscale          CHAR(16)      NULL,
  indirizzo               VARCHAR(255)  NULL,
  cap                     VARCHAR(10)   NULL,
  citta                   VARCHAR(100)  NULL,
  provincia               CHAR(2)       NULL,
  paese                   CHAR(2)       NULL,   -- ISO 3166-1 alpha-2
  lingua                  CHAR(2)       NOT NULL DEFAULT 'it',
  note                    TEXT          NULL,
  creato_il               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  eliminato_il            DATETIME      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ospiti_uuid (uuid),
  UNIQUE KEY uq_ospiti_documento (tipo_documento, numero_documento),
  KEY idx_ospiti_email (email),
  KEY idx_ospiti_nominativo (cognome, nome),
  FOREIGN KEY (utente_id) REFERENCES utenti(id) ON DELETE SET NULL
);

-- ospiti.utente_id = account che ha salvato l'ospite (sé stesso o compagni di
-- viaggio); utenti.ospite_id = la SUA anagrafica, con i suoi documenti.
ALTER TABLE utenti
  ADD CONSTRAINT fk_utenti_ospite FOREIGN KEY (ospite_id) REFERENCES ospiti(id) ON DELETE SET NULL;

CREATE TABLE documenti_ospite (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  ospite_id       INT UNSIGNED  NOT NULL,
  nome_originale  VARCHAR(255)  NOT NULL,
  percorso        VARCHAR(255)  NOT NULL,
  tipo_mime       VARCHAR(50)   NOT NULL,
  dimensione      INT UNSIGNED  NOT NULL,
  caricato_il     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_documenti_ospite (ospite_id),
  FOREIGN KEY (ospite_id) REFERENCES ospiti(id) ON DELETE CASCADE
);

-- Consensi GDPR (privacy, termini, marketing, cookie) con prova di accettazione.
CREATE TABLE consensi (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  utente_id       INT UNSIGNED  NULL,
  visitatore_id   INT UNSIGNED  NULL,
  ospite_id       INT UNSIGNED  NULL,
  documento_id    INT UNSIGNED  NULL,
  tipo            ENUM('privacy','termini','marketing','cookie') NOT NULL,
  accettato       BOOLEAN       NOT NULL,
  ip              VARCHAR(45)   NULL,
  user_agent      VARCHAR(255)  NULL,
  creato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_consensi_utente (utente_id, tipo),
  CONSTRAINT chk_consensi_soggetto CHECK (utente_id IS NOT NULL OR visitatore_id IS NOT NULL OR ospite_id IS NOT NULL),
  FOREIGN KEY (utente_id)     REFERENCES utenti(id),
  FOREIGN KEY (visitatore_id) REFERENCES visitatori(id),
  FOREIGN KEY (ospite_id)     REFERENCES ospiti(id),
  FOREIGN KEY (documento_id)  REFERENCES documenti_legali(id) ON DELETE SET NULL
);


-- =============================================================================
-- 7. PRENOTAZIONI, DISPONIBILITÀ, CALENDARI ESTERNI
-- =============================================================================

-- Calendari iCal delle OTA (Booking.com, Airbnb...) da importare per camera.
CREATE TABLE calendari_esterni (
  id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  camera_id             INT UNSIGNED  NOT NULL,
  canale                ENUM('booking_com','airbnb','expedia','altro') NOT NULL,
  nome                  VARCHAR(100)  NULL,
  url                   VARCHAR(1000) NOT NULL,
  attivo                BOOLEAN       NOT NULL DEFAULT TRUE,
  ultima_sincronizzazione_il DATETIME NULL,
  ultimo_esito          VARCHAR(255)  NULL,
  errori_consecutivi    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  creato_il             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_calendari_esterni_camera (camera_id),
  FOREIGN KEY (camera_id) REFERENCES camere(id) ON DELETE CASCADE
);

-- Chiusure: manutenzione, ferie, eventi importati da iCal.
-- camera_id NULL = intera struttura chiusa. data_fine esclusa.
CREATE TABLE date_bloccate (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  camera_id       INT UNSIGNED  NULL,
  data_inizio     DATE          NOT NULL,
  data_fine       DATE          NOT NULL,
  motivo          VARCHAR(255)  NULL,
  origine         ENUM('manuale','ical') NOT NULL DEFAULT 'manuale',
  calendario_id   INT UNSIGNED  NULL,
  uid_esterno     VARCHAR(255)  NULL,
  creato_da       INT UNSIGNED  NULL,
  creato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_date_bloccate_ical (calendario_id, uid_esterno),
  KEY idx_date_bloccate_periodo (camera_id, data_inizio, data_fine),
  CONSTRAINT chk_date_bloccate_date CHECK (data_fine > data_inizio),
  FOREIGN KEY (camera_id)     REFERENCES camere(id)            ON DELETE CASCADE,
  FOREIGN KEY (calendario_id) REFERENCES calendari_esterni(id) ON DELETE CASCADE,
  FOREIGN KEY (creato_da)     REFERENCES utenti(id)            ON DELETE SET NULL
);

-- Stati: in_attesa → confermata → in_soggiorno → conclusa
--        in_attesa / confermata → cancellata;  confermata → no_show
-- Le colonne di importo sono una fotografia al momento della prenotazione.
CREATE TABLE prenotazioni (
  id                          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  uuid                        CHAR(36)      NOT NULL DEFAULT (UUID()),
  codice                      VARCHAR(20)   NOT NULL DEFAULT '',   -- generato dal trigger se vuoto
  ospite_id                   INT UNSIGNED  NOT NULL,              -- titolare
  utente_id                   INT UNSIGNED  NULL,                  -- account che ha prenotato
  camera_id                   INT UNSIGNED  NOT NULL,
  piano_tariffario_id         INT UNSIGNED  NULL,
  promozione_id               INT UNSIGNED  NULL,
  codice_sconto_id            INT UNSIGNED  NULL,
  pacchetto_id                INT UNSIGNED  NULL,
  data_arrivo                 DATE          NOT NULL,
  data_partenza               DATE          NOT NULL,
  notti                       SMALLINT AS (DATEDIFF(data_partenza, data_arrivo)) VIRTUAL,
  adulti                      TINYINT UNSIGNED NOT NULL DEFAULT 1,
  bambini                     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  stato                       ENUM('in_attesa','confermata','in_soggiorno','conclusa','cancellata','no_show') NOT NULL DEFAULT 'in_attesa',
  canale                      ENUM('diretto','telefono','email','walk_in','booking_com','airbnb','expedia','altro') NOT NULL DEFAULT 'diretto',
  id_esterno                  VARCHAR(100)  NULL,                  -- codice prenotazione OTA
  -- importi
  valuta                      CHAR(3)       NOT NULL DEFAULT 'EUR',
  importo_soggiorno           DECIMAL(10,2) NOT NULL DEFAULT 0,    -- somma delle notti
  sconto_promozione           DECIMAL(10,2) NOT NULL DEFAULT 0,
  sconto_codice               DECIMAL(10,2) NOT NULL DEFAULT 0,
  percentuale_fedelta         DECIMAL(5,2)  NOT NULL DEFAULT 0,
  sconto_fedelta              DECIMAL(10,2) NOT NULL DEFAULT 0,
  importo_pacchetto           DECIMAL(10,2) NOT NULL DEFAULT 0,
  importo_servizi             DECIMAL(10,2) NOT NULL DEFAULT 0,    -- aggiornato dai trigger di prenotazioni_servizi
  tassa_soggiorno             DECIMAL(10,2) NOT NULL DEFAULT 0,
  totale                      DECIMAL(10,2) AS (importo_soggiorno - sconto_promozione - sconto_codice - sconto_fedelta
                                                + importo_pacchetto + importo_servizi + tassa_soggiorno) STORED,
  acconto_richiesto           DECIMAL(10,2) NOT NULL DEFAULT 0,
  dettaglio_prezzo            JSON          NULL,                  -- prezzo notte per notte e regole applicate
  -- politica di cancellazione (copiata dal piano tariffario)
  rimborsabile                BOOLEAN       NOT NULL DEFAULT TRUE,
  ore_cancellazione_gratuita  SMALLINT UNSIGNED NOT NULL DEFAULT 48,
  penale_percentuale          DECIMAL(5,2)  NOT NULL DEFAULT 0,
  -- flusso
  richieste_speciali          TEXT          NULL,
  note_interne                TEXT          NULL,
  ora_arrivo_prevista         TIME          NULL,
  scade_il                    DATETIME      NULL,                  -- scadenza delle prenotazioni in_attesa
  token_checkin               CHAR(64)      NULL,                  -- hash del token per il check-in online
  token_checkin_scade_il      DATETIME      NULL,
  checkin_online_il           DATETIME      NULL,
  arrivo_effettivo_il         DATETIME      NULL,
  partenza_effettiva_il       DATETIME      NULL,
  cancellata_il               DATETIME      NULL,
  motivo_cancellazione        VARCHAR(255)  NULL,
  penale_applicata            DECIMAL(10,2) NOT NULL DEFAULT 0,
  creato_da                   INT UNSIGNED  NULL,
  creato_il                   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prenotazioni_uuid (uuid),
  UNIQUE KEY uq_prenotazioni_codice (codice),
  UNIQUE KEY uq_prenotazioni_esterna (canale, id_esterno),
  UNIQUE KEY uq_prenotazioni_token_checkin (token_checkin),
  KEY idx_prenotazioni_camera_periodo (camera_id, data_arrivo, data_partenza),
  KEY idx_prenotazioni_stato (stato),
  KEY idx_prenotazioni_arrivo (data_arrivo),
  KEY idx_prenotazioni_partenza (data_partenza),
  KEY idx_prenotazioni_ospite (ospite_id),
  KEY idx_prenotazioni_utente (utente_id),
  CONSTRAINT chk_prenotazioni_date    CHECK (data_partenza > data_arrivo),
  CONSTRAINT chk_prenotazioni_adulti  CHECK (adulti >= 1),
  CONSTRAINT chk_prenotazioni_importi CHECK (importo_soggiorno >= 0 AND sconto_promozione >= 0 AND sconto_codice >= 0
                                             AND sconto_fedelta >= 0 AND importo_pacchetto >= 0 AND importo_servizi >= 0
                                             AND tassa_soggiorno >= 0 AND acconto_richiesto >= 0 AND penale_applicata >= 0
                                             AND importo_soggiorno - sconto_promozione - sconto_codice - sconto_fedelta >= 0),
  CONSTRAINT chk_prenotazioni_penale  CHECK (penale_percentuale BETWEEN 0 AND 100),
  FOREIGN KEY (ospite_id)           REFERENCES ospiti(id),
  FOREIGN KEY (utente_id)           REFERENCES utenti(id) ON DELETE SET NULL,
  FOREIGN KEY (camera_id)           REFERENCES camere(id),
  FOREIGN KEY (piano_tariffario_id) REFERENCES piani_tariffari(id) ON DELETE SET NULL,
  FOREIGN KEY (promozione_id)       REFERENCES promozioni(id)      ON DELETE SET NULL,
  FOREIGN KEY (codice_sconto_id)    REFERENCES codici_sconto(id)   ON DELETE SET NULL,
  FOREIGN KEY (pacchetto_id)        REFERENCES pacchetti(id)       ON DELETE SET NULL,
  FOREIGN KEY (creato_da)           REFERENCES utenti(id)          ON DELETE SET NULL
);

-- Tutti gli ospiti del soggiorno (obbligatorio per Alloggiati Web).
CREATE TABLE prenotazioni_ospiti (
  prenotazione_id   INT UNSIGNED  NOT NULL,
  ospite_id         INT UNSIGNED  NOT NULL,
  tipo_alloggiato   ENUM('ospite_singolo','capofamiglia','capogruppo','familiare','membro_gruppo') NOT NULL DEFAULT 'ospite_singolo',
  esente_tassa      BOOLEAN       NOT NULL DEFAULT FALSE,
  motivo_esenzione  VARCHAR(100)  NULL,
  PRIMARY KEY (prenotazione_id, ospite_id),
  KEY idx_prenotazioni_ospiti_ospite (ospite_id),
  FOREIGN KEY (prenotazione_id) REFERENCES prenotazioni(id) ON DELETE CASCADE,
  FOREIGN KEY (ospite_id)       REFERENCES ospiti(id)
);

-- Servizi extra acquistati. Prezzo e modalità sono copiati al momento
-- dell'acquisto; il totale è calcolato dal backend (dipende da notti/ospiti).
CREATE TABLE prenotazioni_servizi (
  prenotazione_id   INT UNSIGNED  NOT NULL,
  servizio_id       INT UNSIGNED  NOT NULL,
  quantita          SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  prezzo_unitario   DECIMAL(10,2) NOT NULL,
  calcolo_prezzo    ENUM('a_soggiorno','a_notte','a_persona','a_persona_notte') NOT NULL,
  totale            DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (prenotazione_id, servizio_id),
  KEY idx_prenotazioni_servizi_servizio (servizio_id),
  CONSTRAINT chk_prenotazioni_servizi_quantita CHECK (quantita > 0),
  CONSTRAINT chk_prenotazioni_servizi_totale   CHECK (totale >= 0 AND prezzo_unitario >= 0),
  FOREIGN KEY (prenotazione_id) REFERENCES prenotazioni(id) ON DELETE CASCADE,
  FOREIGN KEY (servizio_id)     REFERENCES servizi(id)
);

-- Blocco temporaneo di una camera durante il checkout online, per evitare
-- che due persone paghino la stessa camera. Scade da solo.
-- Il backend blocca la riga della camera (SELECT ... FOR UPDATE) prima di
-- inserire, così due richieste simultanee non passano entrambe il controllo.
CREATE TABLE blocchi_temporanei (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  camera_id       INT UNSIGNED  NOT NULL,
  data_arrivo     DATE          NOT NULL,
  data_partenza   DATE          NOT NULL,
  sessione        CHAR(36)      NOT NULL,
  utente_id       INT UNSIGNED  NULL,
  visitatore_id   INT UNSIGNED  NULL,
  scade_il        DATETIME      NOT NULL,
  creato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_blocchi_temporanei_sessione (sessione),
  KEY idx_blocchi_temporanei_camera (camera_id, scade_il),
  KEY idx_blocchi_temporanei_scadenza (scade_il),
  CONSTRAINT chk_blocchi_temporanei_date CHECK (data_partenza > data_arrivo),
  FOREIGN KEY (camera_id)     REFERENCES camere(id)     ON DELETE CASCADE,
  FOREIGN KEY (utente_id)     REFERENCES utenti(id)     ON DELETE CASCADE,
  FOREIGN KEY (visitatore_id) REFERENCES visitatori(id) ON DELETE CASCADE
);

-- Storico degli invii ad Alloggiati Web (una schedina per ospite).
CREATE TABLE invii_alloggiati (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  prenotazione_id   INT UNSIGNED  NOT NULL,
  ospite_id         INT UNSIGNED  NOT NULL,
  schedina          VARCHAR(200)  NOT NULL,   -- record a larghezza fissa inviato
  esito             ENUM('inviata','errore','test') NOT NULL,
  messaggio         TEXT          NULL,
  inviato_da        INT UNSIGNED  NULL,
  inviato_il        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_invii_alloggiati_prenotazione (prenotazione_id, ospite_id),
  KEY idx_invii_alloggiati_data (inviato_il),
  FOREIGN KEY (prenotazione_id) REFERENCES prenotazioni(id) ON DELETE CASCADE,
  FOREIGN KEY (ospite_id)       REFERENCES ospiti(id),
  FOREIGN KEY (inviato_da)      REFERENCES utenti(id) ON DELETE SET NULL
);


-- =============================================================================
-- 8. FATTURE (SDI) E PAGAMENTI
-- =============================================================================

CREATE TABLE contatori_fatture (
  anno            SMALLINT UNSIGNED NOT NULL,
  sezionale       VARCHAR(10)   NOT NULL DEFAULT '',
  ultimo_numero   INT UNSIGNED  NOT NULL DEFAULT 0,
  PRIMARY KEY (anno, sezionale)
);

-- Una fattura nasce in 'bozza' senza numero. Il numero progressivo viene
-- assegnato dal trigger quando esce dalla bozza, così le bozze eliminate
-- non lasciano buchi nella numerazione. Dopo l'emissione non è modificabile.
CREATE TABLE fatture (
  id                        INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  prenotazione_id           INT UNSIGNED  NULL,
  fattura_origine_id        INT UNSIGNED  NULL,           -- per le note di credito
  tipo_documento            ENUM('TD01','TD04') NOT NULL DEFAULT 'TD01',   -- TD01 fattura, TD04 nota di credito
  anno                      SMALLINT UNSIGNED NULL,
  sezionale                 VARCHAR(10)   NOT NULL DEFAULT '',
  numero                    INT UNSIGNED  NULL,
  data_emissione            DATE          NOT NULL,
  -- cliente (fotografia al momento dell'emissione)
  cliente_denominazione     VARCHAR(255)  NULL,           -- aziende
  cliente_nome              VARCHAR(100)  NULL,           -- privati
  cliente_cognome           VARCHAR(100)  NULL,
  cliente_codice_fiscale    VARCHAR(16)   NULL,
  cliente_partita_iva       VARCHAR(20)   NULL,
  cliente_indirizzo         VARCHAR(255)  NOT NULL,
  cliente_cap               VARCHAR(10)   NOT NULL,
  cliente_comune            VARCHAR(100)  NOT NULL,
  cliente_provincia         CHAR(2)       NULL,
  cliente_nazione           CHAR(2)       NOT NULL DEFAULT 'IT',
  codice_destinatario       CHAR(7)       NOT NULL DEFAULT '0000000',
  pec                       VARCHAR(255)  NULL,
  -- importi
  imponibile                DECIMAL(10,2) NOT NULL DEFAULT 0,
  imposta                   DECIMAL(10,2) NOT NULL DEFAULT 0,
  importo_esente            DECIMAL(10,2) NOT NULL DEFAULT 0,   -- es. tassa di soggiorno (fuori campo IVA)
  totale                    DECIMAL(10,2) NOT NULL DEFAULT 0,
  -- SDI
  stato_sdi                 ENUM('bozza','da_inviare','inviata','consegnata','mancata_consegna','scartata','accettata','rifiutata') NOT NULL DEFAULT 'bozza',
  id_sdi                    VARCHAR(50)   NULL,
  nome_file_xml             VARCHAR(100)  NULL,
  percorso_xml              VARCHAR(255)  NULL,
  percorso_pdf              VARCHAR(255)  NULL,
  esito_sdi                 TEXT          NULL,
  note                      TEXT          NULL,
  creato_da                 INT UNSIGNED  NULL,
  creato_il                 DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fatture_numero (anno, sezionale, numero),
  KEY idx_fatture_prenotazione (prenotazione_id),
  KEY idx_fatture_stato_sdi (stato_sdi),
  CONSTRAINT chk_fatture_cliente CHECK (cliente_denominazione IS NOT NULL OR (cliente_nome IS NOT NULL AND cliente_cognome IS NOT NULL)),
  CONSTRAINT chk_fatture_nota_credito CHECK (tipo_documento <> 'TD04' OR fattura_origine_id IS NOT NULL),
  FOREIGN KEY (prenotazione_id)    REFERENCES prenotazioni(id) ON DELETE SET NULL,
  FOREIGN KEY (fattura_origine_id) REFERENCES fatture(id),
  FOREIGN KEY (creato_da)          REFERENCES utenti(id) ON DELETE SET NULL
);

CREATE TABLE fatture_righe (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  fattura_id        INT UNSIGNED  NOT NULL,
  descrizione       VARCHAR(255)  NOT NULL,
  quantita          DECIMAL(10,2) NOT NULL DEFAULT 1,
  prezzo_unitario   DECIMAL(10,2) NOT NULL,
  aliquota_iva      DECIMAL(5,2)  NOT NULL,
  natura            VARCHAR(5)    NULL,     -- codice natura SDI (N1...N7) se aliquota 0
  totale            DECIMAL(10,2) AS (ROUND(quantita * prezzo_unitario, 2)) STORED,
  ordine            SMALLINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_fatture_righe_fattura (fattura_id),
  CONSTRAINT chk_fatture_righe_natura CHECK (aliquota_iva > 0 OR natura IS NOT NULL),
  FOREIGN KEY (fattura_id) REFERENCES fatture(id) ON DELETE CASCADE
);

-- Ogni movimento di denaro legato a una prenotazione, online o in struttura.
-- I rimborsi sono righe con tipo 'rimborso' e importo positivo.
CREATE TABLE pagamenti (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  uuid                CHAR(36)      NOT NULL DEFAULT (UUID()),
  prenotazione_id     INT UNSIGNED  NOT NULL,
  tipo                ENUM('acconto','saldo','extra','penale','rimborso') NOT NULL,
  metodo              ENUM('stripe','paypal','bonifico','contanti','pos','ota') NOT NULL,
  stato               ENUM('in_attesa','completato','fallito','annullato') NOT NULL DEFAULT 'in_attesa',
  importo             DECIMAL(10,2) NOT NULL,
  valuta              CHAR(3)       NOT NULL DEFAULT 'EUR',
  id_transazione      VARCHAR(255)  NULL,     -- id del provider (Stripe, PayPal)
  riferimento         VARCHAR(100)  NULL,     -- CRO del bonifico, n. transazione POS...
  documento_fiscale   VARCHAR(50)   NULL,     -- n. documento commerciale / ricevuta
  link_pagamento      VARCHAR(1000) NULL,
  pagato_il           DATETIME      NULL,     -- impostato dal trigger al completamento
  registrato_da       INT UNSIGNED  NULL,     -- operatore che ha registrato l'incasso
  note                TEXT          NULL,
  creato_il           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pagamenti_uuid (uuid),
  UNIQUE KEY uq_pagamenti_transazione (id_transazione),
  KEY idx_pagamenti_prenotazione (prenotazione_id, stato),
  KEY idx_pagamenti_data (pagato_il),
  CONSTRAINT chk_pagamenti_importo CHECK (importo > 0),
  FOREIGN KEY (prenotazione_id) REFERENCES prenotazioni(id),
  FOREIGN KEY (registrato_da)   REFERENCES utenti(id) ON DELETE SET NULL
);

-- Idempotenza dei webhook Stripe/PayPal: ogni evento si elabora una volta sola.
CREATE TABLE eventi_webhook (
  provider        ENUM('stripe','paypal') NOT NULL,
  id_evento       VARCHAR(255)  NOT NULL,
  tipo            VARCHAR(100)  NOT NULL,
  payload         JSON          NULL,
  ricevuto_il     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  elaborato_il    DATETIME      NULL,
  errore          TEXT          NULL,
  PRIMARY KEY (provider, id_evento)
);


-- =============================================================================
-- 9. FEDELTÀ
-- =============================================================================

-- Registro dei punti. Il totale in utenti.punti_fedelta è aggiornato dal trigger.
CREATE TABLE movimenti_punti (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  utente_id         INT UNSIGNED  NOT NULL,
  prenotazione_id   INT UNSIGNED  NULL,
  punti             INT           NOT NULL,     -- negativo per rettifiche
  motivo            ENUM('soggiorno','bonus','rettifica','annullamento') NOT NULL,
  note              VARCHAR(255)  NULL,
  creato_da         INT UNSIGNED  NULL,
  creato_il         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_movimenti_punti_prenotazione (prenotazione_id, motivo),
  KEY idx_movimenti_punti_utente (utente_id, creato_il),
  CONSTRAINT chk_movimenti_punti CHECK (punti <> 0),
  FOREIGN KEY (utente_id)       REFERENCES utenti(id) ON DELETE CASCADE,
  FOREIGN KEY (prenotazione_id) REFERENCES prenotazioni(id) ON DELETE SET NULL,
  FOREIGN KEY (creato_da)       REFERENCES utenti(id) ON DELETE SET NULL
);


-- =============================================================================
-- 10. PULIZIE E MANUTENZIONE
-- =============================================================================

CREATE TABLE checklist_modelli (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  voce            VARCHAR(150)  NOT NULL,
  tipo_pulizia    ENUM('partenza','riassetto','profonda','ispezione') NULL,   -- NULL = tutte
  ordine          SMALLINT      NOT NULL DEFAULT 0,
  attiva          BOOLEAN       NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id)
);

-- Stati: da_fare → in_corso → completata → verificata (dal responsabile).
-- I trigger aggiornano camere.stato_pulizia e le date di avanzamento.
CREATE TABLE attivita_pulizia (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  camera_id         INT UNSIGNED  NOT NULL,
  prenotazione_id   INT UNSIGNED  NULL,
  assegnata_a       INT UNSIGNED  NULL,
  data_prevista     DATE          NOT NULL,
  tipo              ENUM('partenza','riassetto','profonda','ispezione') NOT NULL DEFAULT 'riassetto',
  priorita          ENUM('bassa','normale','alta','urgente') NOT NULL DEFAULT 'normale',
  stato             ENUM('da_fare','in_corso','completata','verificata') NOT NULL DEFAULT 'da_fare',
  checklist         JSON          NULL,     -- [{ "voce": "...", "fatto": false }]
  note              TEXT          NULL,
  iniziata_il       DATETIME      NULL,
  completata_il     DATETIME      NULL,
  rinviata_il       DATETIME      NULL,     -- "non disturbare": torna in fondo alla coda del giorno
  verificata_il     DATETIME      NULL,
  verificata_da     INT UNSIGNED  NULL,
  creato_da         INT UNSIGNED  NULL,
  creato_il         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attivita_pulizia (camera_id, data_prevista, tipo),
  KEY idx_attivita_pulizia_data (data_prevista, stato),
  KEY idx_attivita_pulizia_assegnata (assegnata_a, data_prevista),
  FOREIGN KEY (camera_id)       REFERENCES camere(id) ON DELETE CASCADE,
  FOREIGN KEY (prenotazione_id) REFERENCES prenotazioni(id) ON DELETE SET NULL,
  FOREIGN KEY (assegnata_a)     REFERENCES utenti(id) ON DELETE SET NULL,
  FOREIGN KEY (verificata_da)   REFERENCES utenti(id) ON DELETE SET NULL,
  FOREIGN KEY (creato_da)       REFERENCES utenti(id) ON DELETE SET NULL
);

CREATE TABLE segnalazioni_manutenzione (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  camera_id           INT UNSIGNED  NULL,       -- NULL = aree comuni
  titolo              VARCHAR(150)  NOT NULL,
  descrizione         TEXT          NULL,
  priorita            ENUM('bassa','normale','alta','urgente') NOT NULL DEFAULT 'normale',
  stato               ENUM('aperta','in_corso','risolta','annullata') NOT NULL DEFAULT 'aperta',
  segnalata_da        INT UNSIGNED  NULL,
  assegnata_a         INT UNSIGNED  NULL,
  risolta_il          DATETIME      NULL,
  note_risoluzione    TEXT          NULL,
  creato_il           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_segnalazioni_stato (stato, priorita),
  FOREIGN KEY (camera_id)    REFERENCES camere(id) ON DELETE SET NULL,
  FOREIGN KEY (segnalata_da) REFERENCES utenti(id) ON DELETE SET NULL,
  FOREIGN KEY (assegnata_a)  REFERENCES utenti(id) ON DELETE SET NULL
);


-- =============================================================================
-- 11. RECENSIONI
-- =============================================================================

-- Una recensione per prenotazione, solo a soggiorno concluso (trigger).
-- ospite_id viene copiato dalla prenotazione dal trigger.
CREATE TABLE recensioni (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  prenotazione_id     INT UNSIGNED  NOT NULL,
  ospite_id           INT UNSIGNED  NOT NULL DEFAULT 0,
  utente_id           INT UNSIGNED  NULL,
  voto                TINYINT UNSIGNED NOT NULL,
  voto_pulizia        TINYINT UNSIGNED NULL,
  voto_personale      TINYINT UNSIGNED NULL,
  voto_posizione      TINYINT UNSIGNED NULL,
  voto_comfort        TINYINT UNSIGNED NULL,
  voto_qualita_prezzo TINYINT UNSIGNED NULL,
  titolo              VARCHAR(150)  NULL,
  commento            TEXT          NULL,
  lingua              CHAR(2)       NOT NULL DEFAULT 'it',
  anonima             BOOLEAN       NOT NULL DEFAULT FALSE,
  stato               ENUM('in_attesa','pubblicata','rifiutata') NOT NULL DEFAULT 'in_attesa',
  moderata_da         INT UNSIGNED  NULL,
  moderata_il         DATETIME      NULL,
  risposta            TEXT          NULL,     -- risposta pubblica della struttura
  risposta_da         INT UNSIGNED  NULL,
  risposta_il         DATETIME      NULL,
  creato_il           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recensioni_prenotazione (prenotazione_id),
  KEY idx_recensioni_stato (stato, creato_il),
  CONSTRAINT chk_recensioni_voti CHECK (
        voto BETWEEN 1 AND 5
    AND (voto_pulizia        IS NULL OR voto_pulizia        BETWEEN 1 AND 5)
    AND (voto_personale      IS NULL OR voto_personale      BETWEEN 1 AND 5)
    AND (voto_posizione      IS NULL OR voto_posizione      BETWEEN 1 AND 5)
    AND (voto_comfort        IS NULL OR voto_comfort        BETWEEN 1 AND 5)
    AND (voto_qualita_prezzo IS NULL OR voto_qualita_prezzo BETWEEN 1 AND 5)),
  FOREIGN KEY (prenotazione_id) REFERENCES prenotazioni(id) ON DELETE CASCADE,
  FOREIGN KEY (ospite_id)       REFERENCES ospiti(id),
  FOREIGN KEY (utente_id)       REFERENCES utenti(id) ON DELETE SET NULL,
  FOREIGN KEY (moderata_da)     REFERENCES utenti(id) ON DELETE SET NULL,
  FOREIGN KEY (risposta_da)     REFERENCES utenti(id) ON DELETE SET NULL
);


-- =============================================================================
-- 12. CHAT
-- -----------------------------------------------------------------------------
-- assistenza : un cliente (registrato) o un visitatore (anonimo) scrive alla
--              struttura; risponde lo staff con permesso chat.assistenza.
-- staff      : chat interna. Chi può parlare con chi è definito in regole_chat
--              (admin con tutti, colleghi della stessa squadra tra loro).
-- =============================================================================

CREATE TABLE conversazioni (
  id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  uuid                  CHAR(36)      NOT NULL DEFAULT (UUID()),
  tipo                  ENUM('assistenza','staff') NOT NULL,
  titolo                VARCHAR(150)  NULL,
  cliente_id            INT UNSIGNED  NULL,
  visitatore_id         INT UNSIGNED  NULL,
  prenotazione_id       INT UNSIGNED  NULL,
  assegnata_a           INT UNSIGNED  NULL,
  stato                 ENUM('aperta','chiusa') NOT NULL DEFAULT 'aperta',
  letto_cliente_il      DATETIME      NULL,     -- ultima lettura del cliente/visitatore
  ultimo_messaggio_il   DATETIME      NULL,
  creata_da             INT UNSIGNED  NULL,
  creato_il             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conversazioni_uuid (uuid),
  KEY idx_conversazioni_lista (tipo, stato, ultimo_messaggio_il),
  KEY idx_conversazioni_cliente (cliente_id),
  KEY idx_conversazioni_visitatore (visitatore_id),
  KEY idx_conversazioni_assegnata (assegnata_a),
  CONSTRAINT chk_conversazioni_interlocutore CHECK (
       (tipo = 'assistenza' AND (cliente_id IS NULL) <> (visitatore_id IS NULL))
    OR (tipo = 'staff' AND cliente_id IS NULL AND visitatore_id IS NULL)),
  FOREIGN KEY (cliente_id)      REFERENCES utenti(id),
  FOREIGN KEY (visitatore_id)   REFERENCES visitatori(id),
  FOREIGN KEY (prenotazione_id) REFERENCES prenotazioni(id) ON DELETE SET NULL,
  FOREIGN KEY (assegnata_a)     REFERENCES utenti(id) ON DELETE SET NULL,
  FOREIGN KEY (creata_da)       REFERENCES utenti(id) ON DELETE SET NULL
);

-- Membri dello staff nella conversazione (anche per lo stato di lettura).
CREATE TABLE conversazioni_partecipanti (
  conversazione_id  INT UNSIGNED  NOT NULL,
  utente_id         INT UNSIGNED  NOT NULL,
  entrato_il        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  uscito_il         DATETIME      NULL,
  letto_fino_al     DATETIME      NULL,
  PRIMARY KEY (conversazione_id, utente_id),
  KEY idx_partecipanti_utente (utente_id),
  FOREIGN KEY (conversazione_id) REFERENCES conversazioni(id) ON DELETE CASCADE,
  FOREIGN KEY (utente_id)        REFERENCES utenti(id) ON DELETE CASCADE
);

CREATE TABLE messaggi (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversazione_id        INT UNSIGNED  NOT NULL,
  mittente_utente_id      INT UNSIGNED  NULL,
  mittente_visitatore_id  INT UNSIGNED  NULL,
  di_sistema              BOOLEAN       NOT NULL DEFAULT FALSE,
  risposta_a_id           BIGINT UNSIGNED NULL,
  testo                   TEXT          NOT NULL,
  inviato_il              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modificato_il           DATETIME      NULL,
  eliminato_il            DATETIME      NULL,
  PRIMARY KEY (id),
  KEY idx_messaggi_conversazione (conversazione_id, inviato_il),
  CONSTRAINT chk_messaggi_mittente CHECK (
       (di_sistema AND mittente_utente_id IS NULL AND mittente_visitatore_id IS NULL)
    OR (NOT di_sistema AND (mittente_utente_id IS NULL) <> (mittente_visitatore_id IS NULL))),
  FOREIGN KEY (conversazione_id)       REFERENCES conversazioni(id) ON DELETE CASCADE,
  FOREIGN KEY (mittente_utente_id)     REFERENCES utenti(id),
  FOREIGN KEY (mittente_visitatore_id) REFERENCES visitatori(id),
  FOREIGN KEY (risposta_a_id)          REFERENCES messaggi(id) ON DELETE SET NULL
);

CREATE TABLE messaggi_allegati (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  messaggio_id    BIGINT UNSIGNED NOT NULL,
  nome_originale  VARCHAR(255)  NOT NULL,
  percorso        VARCHAR(255)  NOT NULL,
  tipo_mime       VARCHAR(100)  NOT NULL,
  dimensione      INT UNSIGNED  NOT NULL,
  creato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_messaggi_allegati_messaggio (messaggio_id),
  FOREIGN KEY (messaggio_id) REFERENCES messaggi(id) ON DELETE CASCADE
);

-- Ultimo riepilogo email inviato per i messaggi non letti.
CREATE TABLE chat_riepiloghi_email (
  conversazione_id  INT UNSIGNED  NOT NULL,
  utente_id         INT UNSIGNED  NOT NULL,
  inviato_il        DATETIME      NOT NULL,
  PRIMARY KEY (conversazione_id, utente_id),
  FOREIGN KEY (conversazione_id) REFERENCES conversazioni(id) ON DELETE CASCADE,
  FOREIGN KEY (utente_id)        REFERENCES utenti(id) ON DELETE CASCADE
);

CREATE TABLE faq (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  domanda         VARCHAR(255)  NOT NULL,
  risposta        TEXT          NOT NULL,
  categoria       VARCHAR(50)   NULL,
  ordine          SMALLINT      NOT NULL DEFAULT 0,
  pubblicata      BOOLEAN       NOT NULL DEFAULT TRUE,
  creato_da       INT UNSIGNED  NULL,
  aggiornato_da   INT UNSIGNED  NULL,
  creato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_faq_categoria (pubblicata, categoria, ordine),
  FOREIGN KEY (creato_da)     REFERENCES utenti(id) ON DELETE SET NULL,
  FOREIGN KEY (aggiornato_da) REFERENCES utenti(id) ON DELETE SET NULL
);


-- =============================================================================
-- 13. NOTIFICHE, EVENTI SPECIALI, REGISTRO ATTIVITÀ
-- =============================================================================

CREATE TABLE notifiche (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  utente_id       INT UNSIGNED  NOT NULL,
  tipo            ENUM('prenotazione','pagamento','pulizia','manutenzione','chat','recensione','promozione','sistema') NOT NULL,
  priorita        ENUM('info','successo','avviso','errore') NOT NULL DEFAULT 'info',
  -- codice e parametri: il gestionale traduce il titolo; titolo resta in italiano
  codice          VARCHAR(60)   NOT NULL,
  parametri       JSON          NULL,
  titolo          VARCHAR(150)  NOT NULL,
  testo           TEXT          NULL,
  link            VARCHAR(255)  NULL,
  letta_il        DATETIME      NULL,
  creato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  eliminato_il    DATETIME      NULL,
  PRIMARY KEY (id),
  KEY idx_notifiche_utente_lettura (utente_id, eliminato_il, letta_il),
  KEY idx_notifiche_utente_data (utente_id, creato_il),
  FOREIGN KEY (utente_id) REFERENCES utenti(id) ON DELETE CASCADE
);

-- Festività ed eventi locali: contesto per analytics e tariffe.
CREATE TABLE eventi_speciali (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  titolo          VARCHAR(150)  NOT NULL,
  tipo            ENUM('festivita','evento_locale','fiera','altro') NOT NULL DEFAULT 'altro',
  data_inizio     DATE          NOT NULL,
  data_fine       DATE          NOT NULL,
  impatto         TINYINT UNSIGNED NOT NULL DEFAULT 5,   -- 1..10
  note            TEXT          NULL,
  creato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aggiornato_il   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eventi_speciali_date (data_inizio, data_fine),
  CONSTRAINT chk_eventi_speciali_date    CHECK (data_fine >= data_inizio),
  CONSTRAINT chk_eventi_speciali_impatto CHECK (impatto BETWEEN 1 AND 10)
);

-- Scritto dai trigger su prenotazioni, pagamenti e fatture.
-- L'utente e l'IP arrivano dalle variabili di sessione @id_utente e @ip,
-- impostate dal backend all'inizio di ogni transazione (config/db.js).
-- Nessuna FK su utente_id: il registro deve sopravvivere alle cancellazioni.
CREATE TABLE registro_attivita (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tabella         VARCHAR(50)   NOT NULL,
  record_id       INT UNSIGNED  NOT NULL,
  azione          ENUM('inserimento','modifica','eliminazione') NOT NULL,
  dati_prima      JSON          NULL,
  dati_dopo       JSON          NULL,
  utente_id       INT UNSIGNED  NULL,
  ip              VARCHAR(45)   NULL,
  creato_il       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_registro_record (tabella, record_id),
  KEY idx_registro_utente (utente_id),
  KEY idx_registro_data (creato_il)
);


-- =============================================================================
-- 14. FUNZIONI
-- =============================================================================

DELIMITER $$

-- Legge un'impostazione numerica, con valore di riserva se manca o è vuota.
CREATE FUNCTION fn_impostazione_numero(p_chiave VARCHAR(60), p_predefinito DECIMAL(12,2))
RETURNS DECIMAL(12,2)
READS SQL DATA
BEGIN
  RETURN COALESCE(
    (SELECT CAST(valore AS DECIMAL(12,2)) FROM impostazioni WHERE chiave = p_chiave AND valore <> ''),
    p_predefinito);
END$$

-- TRUE se la camera è libera nell'intervallo [p_arrivo, p_partenza).
-- Le prenotazioni in_attesa scadute non occupano la camera.
CREATE FUNCTION fn_camera_libera(p_camera_id INT UNSIGNED, p_arrivo DATE, p_partenza DATE, p_escludi_prenotazione INT UNSIGNED)
RETURNS BOOLEAN
READS SQL DATA
BEGIN
  RETURN NOT EXISTS (
      SELECT 1 FROM prenotazioni p
       WHERE p.camera_id = p_camera_id
         AND p.id <> COALESCE(p_escludi_prenotazione, 0)
         AND p.stato IN ('in_attesa','confermata','in_soggiorno')
         AND (p.stato <> 'in_attesa' OR p.scade_il IS NULL OR p.scade_il > UTC_TIMESTAMP())
         AND p.data_arrivo < p_partenza
         AND p.data_partenza > p_arrivo)
    AND NOT EXISTS (
      SELECT 1 FROM date_bloccate b
       WHERE (b.camera_id = p_camera_id OR b.camera_id IS NULL)
         AND b.data_inizio < p_partenza
         AND b.data_fine > p_arrivo);
END$$

-- Dati di una prenotazione per il registro attività.
CREATE FUNCTION fn_json_prenotazione(p_id INT UNSIGNED)
RETURNS JSON
READS SQL DATA
BEGIN
  RETURN (SELECT JSON_OBJECT(
            'codice', codice, 'stato', stato, 'camera_id', camera_id, 'ospite_id', ospite_id,
            'data_arrivo', data_arrivo, 'data_partenza', data_partenza,
            'adulti', adulti, 'bambini', bambini, 'totale', totale, 'penale_applicata', penale_applicata)
            FROM prenotazioni WHERE id = p_id);
END$$


-- =============================================================================
-- 15. TRIGGER
-- =============================================================================

-- ---------------------------------------------------------------- prenotazioni

CREATE TRIGGER trg_prenotazioni_bi BEFORE INSERT ON prenotazioni FOR EACH ROW
BEGIN
  DECLARE v_capienza TINYINT UNSIGNED;

  IF NEW.codice = '' THEN
    SET NEW.codice = UPPER(CONCAT('P', DATE_FORMAT(UTC_DATE(), '%y'), '-', LEFT(MD5(CONCAT(UUID(), RAND())), 6)));
  END IF;

  IF NEW.stato IN ('in_attesa','confermata','in_soggiorno')
     AND NOT fn_camera_libera(NEW.camera_id, NEW.data_arrivo, NEW.data_partenza, NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CAMERA_NON_DISPONIBILE';
  END IF;

  SET v_capienza = (SELECT COALESCE(c.ospiti_max, t.ospiti_max)
                      FROM camere c JOIN tipologie_camera t ON t.id = c.tipologia_id
                     WHERE c.id = NEW.camera_id);
  IF NEW.adulti + NEW.bambini > v_capienza THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CAPIENZA_SUPERATA';
  END IF;

  IF NEW.codice_sconto_id IS NOT NULL AND NEW.utente_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM codici_sconto s
                  WHERE s.id = NEW.codice_sconto_id
                    AND s.utilizzi_per_utente IS NOT NULL
                    AND s.utilizzi_per_utente <= (SELECT COUNT(*) FROM prenotazioni p
                                                   WHERE p.codice_sconto_id = s.id
                                                     AND p.utente_id = NEW.utente_id
                                                     AND p.stato <> 'cancellata')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CODICE_SCONTO_GIA_USATO';
  END IF;
END$$

CREATE TRIGGER trg_prenotazioni_ai AFTER INSERT ON prenotazioni FOR EACH ROW
BEGIN
  -- utilizzo del codice sconto: l'UPDATE condizionato è atomico
  IF NEW.codice_sconto_id IS NOT NULL THEN
    UPDATE codici_sconto
       SET utilizzi = utilizzi + 1
     WHERE id = NEW.codice_sconto_id
       AND (utilizzi_max IS NULL OR utilizzi < utilizzi_max);
    IF ROW_COUNT() = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CODICE_SCONTO_ESAURITO';
    END IF;
  END IF;

  INSERT INTO registro_attivita (tabella, record_id, azione, dati_dopo, utente_id, ip)
  VALUES ('prenotazioni', NEW.id, 'inserimento', fn_json_prenotazione(NEW.id), @id_utente, @ip);
END$$

CREATE TRIGGER trg_prenotazioni_bu BEFORE UPDATE ON prenotazioni FOR EACH ROW
BEGIN
  DECLARE v_capienza TINYINT UNSIGNED;

  -- ricontrolla la disponibilità se cambiano camera/date o si riattiva/conferma
  IF NEW.stato IN ('in_attesa','confermata','in_soggiorno')
     AND (NEW.camera_id <> OLD.camera_id OR NEW.data_arrivo <> OLD.data_arrivo
          OR NEW.data_partenza <> OLD.data_partenza OR NEW.stato <> OLD.stato)
     AND NOT fn_camera_libera(NEW.camera_id, NEW.data_arrivo, NEW.data_partenza, NEW.id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CAMERA_NON_DISPONIBILE';
  END IF;

  IF NEW.camera_id <> OLD.camera_id OR NEW.adulti <> OLD.adulti OR NEW.bambini <> OLD.bambini THEN
    SET v_capienza = (SELECT COALESCE(c.ospiti_max, t.ospiti_max)
                        FROM camere c JOIN tipologie_camera t ON t.id = c.tipologia_id
                       WHERE c.id = NEW.camera_id);
    IF NEW.adulti + NEW.bambini > v_capienza THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CAPIENZA_SUPERATA';
    END IF;
  END IF;

  -- date di avanzamento
  IF NEW.stato <> OLD.stato THEN
    IF NEW.stato = 'in_soggiorno' AND NEW.arrivo_effettivo_il IS NULL THEN
      SET NEW.arrivo_effettivo_il = UTC_TIMESTAMP();
    ELSEIF NEW.stato = 'conclusa' AND NEW.partenza_effettiva_il IS NULL THEN
      SET NEW.partenza_effettiva_il = UTC_TIMESTAMP();
    ELSEIF NEW.stato = 'cancellata' AND NEW.cancellata_il IS NULL THEN
      SET NEW.cancellata_il = UTC_TIMESTAMP();
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_prenotazioni_au AFTER UPDATE ON prenotazioni FOR EACH ROW
BEGIN
  IF NEW.stato <> OLD.stato THEN
    -- partenza: camera da pulire, attività di pulizia, punti fedeltà
    IF NEW.stato = 'conclusa' THEN
      UPDATE camere SET stato_pulizia = 'sporca' WHERE id = NEW.camera_id;

      -- ponytail: UTC_DATE, a mezzanotte italiana può valere il giorno prima
      INSERT INTO attivita_pulizia (camera_id, prenotazione_id, data_prevista, tipo, priorita)
      VALUES (NEW.camera_id, NEW.id, UTC_DATE(), 'partenza', 'alta')
      ON DUPLICATE KEY UPDATE prenotazione_id = NEW.id;

      IF NEW.utente_id IS NOT NULL THEN
        INSERT INTO movimenti_punti (utente_id, prenotazione_id, punti, motivo)
        SELECT NEW.utente_id, NEW.id,
               DATEDIFF(NEW.data_partenza, NEW.data_arrivo) * fn_impostazione_numero('fedelta_punti_per_notte', 10),
               'soggiorno'
         WHERE NOT EXISTS (SELECT 1 FROM movimenti_punti
                            WHERE prenotazione_id = NEW.id AND motivo = 'soggiorno');
      END IF;
    END IF;

    -- cancellazione: libera l'utilizzo del codice sconto
    IF NEW.stato = 'cancellata' AND NEW.codice_sconto_id IS NOT NULL THEN
      UPDATE codici_sconto SET utilizzi = utilizzi - 1
       WHERE id = NEW.codice_sconto_id AND utilizzi > 0;
    END IF;
  END IF;

  IF NOT (NEW.stato <=> OLD.stato AND NEW.camera_id <=> OLD.camera_id
          AND NEW.data_arrivo <=> OLD.data_arrivo AND NEW.data_partenza <=> OLD.data_partenza
          AND NEW.adulti <=> OLD.adulti AND NEW.bambini <=> OLD.bambini
          AND NEW.totale <=> OLD.totale AND NEW.penale_applicata <=> OLD.penale_applicata) THEN
    INSERT INTO registro_attivita (tabella, record_id, azione, dati_prima, dati_dopo, utente_id, ip)
    VALUES ('prenotazioni', NEW.id, 'modifica',
            JSON_OBJECT('stato', OLD.stato, 'camera_id', OLD.camera_id,
                        'data_arrivo', OLD.data_arrivo, 'data_partenza', OLD.data_partenza,
                        'adulti', OLD.adulti, 'bambini', OLD.bambini,
                        'totale', OLD.totale, 'penale_applicata', OLD.penale_applicata),
            fn_json_prenotazione(NEW.id), @id_utente, @ip);
  END IF;
END$$

CREATE TRIGGER trg_prenotazioni_ad AFTER DELETE ON prenotazioni FOR EACH ROW
BEGIN
  INSERT INTO registro_attivita (tabella, record_id, azione, dati_prima, utente_id, ip)
  VALUES ('prenotazioni', OLD.id, 'eliminazione',
          JSON_OBJECT('codice', OLD.codice, 'stato', OLD.stato, 'camera_id', OLD.camera_id,
                      'ospite_id', OLD.ospite_id, 'data_arrivo', OLD.data_arrivo,
                      'data_partenza', OLD.data_partenza, 'totale', OLD.totale),
          @id_utente, @ip);
END$$

-- -------------------------------------------------------- prenotazioni_servizi
-- Mantiene prenotazioni.importo_servizi uguale alla somma dei servizi.

CREATE TRIGGER trg_prenotazioni_servizi_ai AFTER INSERT ON prenotazioni_servizi FOR EACH ROW
  UPDATE prenotazioni
     SET importo_servizi = (SELECT COALESCE(SUM(totale), 0) FROM prenotazioni_servizi WHERE prenotazione_id = NEW.prenotazione_id)
   WHERE id = NEW.prenotazione_id$$

CREATE TRIGGER trg_prenotazioni_servizi_au AFTER UPDATE ON prenotazioni_servizi FOR EACH ROW
  UPDATE prenotazioni
     SET importo_servizi = (SELECT COALESCE(SUM(totale), 0) FROM prenotazioni_servizi WHERE prenotazione_id = NEW.prenotazione_id)
   WHERE id = NEW.prenotazione_id$$

CREATE TRIGGER trg_prenotazioni_servizi_ad AFTER DELETE ON prenotazioni_servizi FOR EACH ROW
  UPDATE prenotazioni
     SET importo_servizi = (SELECT COALESCE(SUM(totale), 0) FROM prenotazioni_servizi WHERE prenotazione_id = OLD.prenotazione_id)
   WHERE id = OLD.prenotazione_id$$

-- ---------------------------------------------------------- blocchi_temporanei

CREATE TRIGGER trg_blocchi_temporanei_bi BEFORE INSERT ON blocchi_temporanei FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM blocchi_temporanei b
              WHERE b.camera_id = NEW.camera_id
                AND b.sessione <> NEW.sessione
                AND b.scade_il > UTC_TIMESTAMP()
                AND b.data_arrivo < NEW.data_partenza
                AND b.data_partenza > NEW.data_arrivo) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CAMERA_IN_PRENOTAZIONE';
  END IF;

  IF NOT fn_camera_libera(NEW.camera_id, NEW.data_arrivo, NEW.data_partenza, NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CAMERA_NON_DISPONIBILE';
  END IF;
END$$

-- ------------------------------------------------------------------- pagamenti

CREATE TRIGGER trg_pagamenti_bi BEFORE INSERT ON pagamenti FOR EACH ROW
BEGIN
  IF NEW.stato = 'completato' AND NEW.pagato_il IS NULL THEN
    SET NEW.pagato_il = UTC_TIMESTAMP();
  END IF;

  -- limite di legge sui contanti, cumulato sulla stessa prenotazione
  -- (i contanti si registrano in struttura, già completati)
  IF NEW.metodo = 'contanti' AND NEW.tipo <> 'rimborso' AND NEW.stato = 'completato'
     AND NEW.importo + (SELECT COALESCE(SUM(importo), 0) FROM pagamenti
                         WHERE prenotazione_id = NEW.prenotazione_id AND metodo = 'contanti'
                           AND tipo <> 'rimborso' AND stato = 'completato')
         >= fn_impostazione_numero('limite_contanti', 5000) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'LIMITE_CONTANTI_SUPERATO';
  END IF;
END$$

CREATE TRIGGER trg_pagamenti_bu BEFORE UPDATE ON pagamenti FOR EACH ROW
BEGIN
  IF NEW.stato = 'completato' AND OLD.stato <> 'completato' AND NEW.pagato_il IS NULL THEN
    SET NEW.pagato_il = UTC_TIMESTAMP();
  END IF;
END$$

CREATE TRIGGER trg_pagamenti_ai AFTER INSERT ON pagamenti FOR EACH ROW
  INSERT INTO registro_attivita (tabella, record_id, azione, dati_dopo, utente_id, ip)
  VALUES ('pagamenti', NEW.id, 'inserimento',
          JSON_OBJECT('prenotazione_id', NEW.prenotazione_id, 'tipo', NEW.tipo, 'metodo', NEW.metodo,
                      'stato', NEW.stato, 'importo', NEW.importo, 'id_transazione', NEW.id_transazione),
          @id_utente, @ip)$$

CREATE TRIGGER trg_pagamenti_au AFTER UPDATE ON pagamenti FOR EACH ROW
  INSERT INTO registro_attivita (tabella, record_id, azione, dati_prima, dati_dopo, utente_id, ip)
  VALUES ('pagamenti', NEW.id, 'modifica',
          JSON_OBJECT('stato', OLD.stato, 'importo', OLD.importo, 'metodo', OLD.metodo),
          JSON_OBJECT('stato', NEW.stato, 'importo', NEW.importo, 'metodo', NEW.metodo),
          @id_utente, @ip)$$

-- --------------------------------------------------------------------- fatture

-- Numero progressivo per anno e sezionale, senza buchi. L'upsert blocca la
-- riga del contatore fino al commit, quindi due emissioni non si sovrappongono.
CREATE FUNCTION fn_prossimo_numero_fattura(p_anno SMALLINT UNSIGNED, p_sezionale VARCHAR(10))
RETURNS INT UNSIGNED
MODIFIES SQL DATA
BEGIN
  INSERT INTO contatori_fatture (anno, sezionale, ultimo_numero)
  VALUES (p_anno, p_sezionale, 1)
  ON DUPLICATE KEY UPDATE ultimo_numero = ultimo_numero + 1;
  RETURN (SELECT ultimo_numero FROM contatori_fatture WHERE anno = p_anno AND sezionale = p_sezionale);
END$$

CREATE TRIGGER trg_fatture_bi BEFORE INSERT ON fatture FOR EACH ROW
BEGIN
  IF NEW.stato_sdi <> 'bozza' THEN
    SET NEW.anno = YEAR(NEW.data_emissione);
    SET NEW.numero = fn_prossimo_numero_fattura(NEW.anno, NEW.sezionale);
  END IF;
END$$

CREATE TRIGGER trg_fatture_bu BEFORE UPDATE ON fatture FOR EACH ROW
BEGIN
  IF OLD.stato_sdi <> 'bozza' THEN
    -- dopo l'emissione cambiano solo i dati di trasmissione SDI
    IF NOT (NEW.numero <=> OLD.numero AND NEW.anno <=> OLD.anno AND NEW.sezionale <=> OLD.sezionale
            AND NEW.data_emissione <=> OLD.data_emissione AND NEW.totale <=> OLD.totale
            AND NEW.imponibile <=> OLD.imponibile AND NEW.imposta <=> OLD.imposta
            AND NEW.importo_esente <=> OLD.importo_esente AND NEW.tipo_documento <=> OLD.tipo_documento
            AND NEW.cliente_codice_fiscale <=> OLD.cliente_codice_fiscale
            AND NEW.cliente_partita_iva <=> OLD.cliente_partita_iva
            AND NEW.cliente_denominazione <=> OLD.cliente_denominazione
            AND NEW.cliente_nome <=> OLD.cliente_nome AND NEW.cliente_cognome <=> OLD.cliente_cognome)
       OR NEW.stato_sdi = 'bozza' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FATTURA_NON_MODIFICABILE';
    END IF;
  ELSEIF NEW.stato_sdi <> 'bozza' THEN
    -- emissione
    SET NEW.anno = YEAR(NEW.data_emissione);
    SET NEW.numero = fn_prossimo_numero_fattura(NEW.anno, NEW.sezionale);
  END IF;
END$$

CREATE TRIGGER trg_fatture_bd BEFORE DELETE ON fatture FOR EACH ROW
BEGIN
  IF OLD.stato_sdi <> 'bozza' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FATTURA_NON_ELIMINABILE';
  END IF;
END$$

CREATE TRIGGER trg_fatture_au AFTER UPDATE ON fatture FOR EACH ROW
BEGIN
  IF NOT (NEW.stato_sdi <=> OLD.stato_sdi AND NEW.numero <=> OLD.numero AND NEW.totale <=> OLD.totale) THEN
    INSERT INTO registro_attivita (tabella, record_id, azione, dati_prima, dati_dopo, utente_id, ip)
    VALUES ('fatture', NEW.id, 'modifica',
            JSON_OBJECT('stato_sdi', OLD.stato_sdi, 'numero', OLD.numero, 'totale', OLD.totale),
            JSON_OBJECT('stato_sdi', NEW.stato_sdi, 'numero', NEW.numero, 'totale', NEW.totale),
            @id_utente, @ip);
  END IF;
END$$

-- Le righe si possono toccare solo finché la fattura è in bozza.
CREATE TRIGGER trg_fatture_righe_bi BEFORE INSERT ON fatture_righe FOR EACH ROW
BEGIN
  IF (SELECT stato_sdi FROM fatture WHERE id = NEW.fattura_id) <> 'bozza' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FATTURA_NON_MODIFICABILE';
  END IF;
END$$

CREATE TRIGGER trg_fatture_righe_bu BEFORE UPDATE ON fatture_righe FOR EACH ROW
BEGIN
  IF (SELECT stato_sdi FROM fatture WHERE id = OLD.fattura_id) <> 'bozza' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FATTURA_NON_MODIFICABILE';
  END IF;
END$$

CREATE TRIGGER trg_fatture_righe_bd BEFORE DELETE ON fatture_righe FOR EACH ROW
BEGIN
  IF (SELECT stato_sdi FROM fatture WHERE id = OLD.fattura_id) <> 'bozza' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FATTURA_NON_MODIFICABILE';
  END IF;
END$$

-- ------------------------------------------------------------- movimenti_punti

CREATE TRIGGER trg_movimenti_punti_ai AFTER INSERT ON movimenti_punti FOR EACH ROW
  UPDATE utenti SET punti_fedelta = punti_fedelta + NEW.punti WHERE id = NEW.utente_id$$

-- ------------------------------------------------------------ attivita_pulizia

CREATE TRIGGER trg_attivita_pulizia_bu BEFORE UPDATE ON attivita_pulizia FOR EACH ROW
BEGIN
  IF NEW.stato <> OLD.stato THEN
    IF NEW.stato = 'in_corso' AND NEW.iniziata_il IS NULL THEN
      SET NEW.iniziata_il = UTC_TIMESTAMP();
    ELSEIF NEW.stato = 'completata' AND NEW.completata_il IS NULL THEN
      SET NEW.completata_il = UTC_TIMESTAMP();
    ELSEIF NEW.stato = 'verificata' AND NEW.verificata_il IS NULL THEN
      SET NEW.verificata_il = UTC_TIMESTAMP();
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_attivita_pulizia_au AFTER UPDATE ON attivita_pulizia FOR EACH ROW
BEGIN
  IF NEW.stato <> OLD.stato THEN
    UPDATE camere
       SET stato_pulizia = CASE NEW.stato
             WHEN 'da_fare'    THEN 'sporca'  -- lasciata a metà (rinvio)
             WHEN 'in_corso'   THEN 'in_pulizia'
             WHEN 'completata' THEN IF(fn_impostazione_numero('pulizie_richiedi_ispezione', 1) = 1, 'da_ispezionare', 'pulita')
             WHEN 'verificata' THEN 'pulita'
             ELSE stato_pulizia
           END
     WHERE id = NEW.camera_id;
  END IF;
END$$

-- ------------------------------------------------------------------ recensioni

CREATE TRIGGER trg_recensioni_bi BEFORE INSERT ON recensioni FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM prenotazioni WHERE id = NEW.prenotazione_id AND stato = 'conclusa') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'RECENSIONE_NON_CONSENTITA';
  END IF;
  SET NEW.ospite_id = (SELECT ospite_id FROM prenotazioni WHERE id = NEW.prenotazione_id);
END$$

CREATE TRIGGER trg_recensioni_bu BEFORE UPDATE ON recensioni FOR EACH ROW
BEGIN
  IF NEW.stato <> OLD.stato AND NEW.moderata_il <=> OLD.moderata_il THEN
    SET NEW.moderata_il = UTC_TIMESTAMP();
  END IF;
  IF NOT (NEW.risposta <=> OLD.risposta) AND NEW.risposta_il <=> OLD.risposta_il THEN
    SET NEW.risposta_il = UTC_TIMESTAMP();
  END IF;
END$$

-- ------------------------------------------------------------------------ chat

CREATE TRIGGER trg_regole_chat_bi BEFORE INSERT ON regole_chat FOR EACH ROW
BEGIN
  DECLARE v_a VARCHAR(30) DEFAULT LEAST(NEW.ruolo_a, NEW.ruolo_b);
  SET NEW.ruolo_b = GREATEST(NEW.ruolo_a, NEW.ruolo_b);
  SET NEW.ruolo_a = v_a;
END$$

-- Chat interna: il nuovo partecipante deve poter parlare con tutti i
-- presenti (regole_chat). Assistenza: solo staff con permesso chat.assistenza.
CREATE TRIGGER trg_partecipanti_bi BEFORE INSERT ON conversazioni_partecipanti FOR EACH ROW
BEGIN
  DECLARE v_tipo VARCHAR(20);
  DECLARE v_ruolo VARCHAR(30);

  SET v_tipo  = (SELECT tipo  FROM conversazioni WHERE id = NEW.conversazione_id);
  SET v_ruolo = (SELECT ruolo FROM utenti WHERE id = NEW.utente_id);

  IF v_tipo = 'assistenza' THEN
    IF NOT EXISTS (SELECT 1 FROM ruoli_permessi WHERE ruolo = v_ruolo AND permesso = 'chat.assistenza') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CHAT_NON_CONSENTITA';
    END IF;
  ELSEIF EXISTS (
      SELECT 1 FROM conversazioni_partecipanti p
        JOIN utenti u ON u.id = p.utente_id
       WHERE p.conversazione_id = NEW.conversazione_id
         AND p.utente_id <> NEW.utente_id
         AND p.uscito_il IS NULL
         AND NOT EXISTS (SELECT 1 FROM regole_chat r
                          WHERE r.ruolo_a = LEAST(u.ruolo, v_ruolo)
                            AND r.ruolo_b = GREATEST(u.ruolo, v_ruolo))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CHAT_NON_CONSENTITA';
  END IF;
END$$

-- Un nuovo messaggio aggiorna la conversazione e la riapre se era chiusa.
CREATE TRIGGER trg_messaggi_ai AFTER INSERT ON messaggi FOR EACH ROW
  UPDATE conversazioni
     SET ultimo_messaggio_il = NEW.inviato_il, stato = 'aperta'
   WHERE id = NEW.conversazione_id$$


-- =============================================================================
-- 16. PROCEDURE
-- =============================================================================

-- Camere prenotabili per un soggiorno. p_sessione (facoltativa) ignora il
-- blocco temporaneo della stessa sessione di checkout.
CREATE PROCEDURE sp_disponibilita(IN p_arrivo DATE, IN p_partenza DATE, IN p_ospiti TINYINT UNSIGNED, IN p_sessione CHAR(36))
READS SQL DATA
BEGIN
  IF p_partenza <= p_arrivo THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INTERVALLO_DATE_NON_VALIDO';
  END IF;

  SELECT c.id AS camera_id, c.numero, c.nome, c.piano,
         t.id AS tipologia_id, t.nome AS tipologia, t.prezzo_base,
         COALESCE(c.ospiti_max, t.ospiti_max) AS ospiti_max
    FROM camere c
    JOIN tipologie_camera t ON t.id = c.tipologia_id
   WHERE c.eliminato_il IS NULL
     AND t.eliminato_il IS NULL
     AND t.attiva
     AND (c.stato = 'attiva' OR (c.stato = 'manutenzione' AND p_arrivo > UTC_DATE()))
     AND COALESCE(c.ospiti_max, t.ospiti_max) >= p_ospiti
     AND fn_camera_libera(c.id, p_arrivo, p_partenza, NULL)
     AND NOT EXISTS (SELECT 1 FROM blocchi_temporanei b
                      WHERE b.camera_id = c.id
                        AND b.scade_il > UTC_TIMESTAMP()
                        AND b.sessione <> COALESCE(p_sessione, '')
                        AND b.data_arrivo < p_partenza
                        AND b.data_partenza > p_arrivo)
   ORDER BY t.ordine, t.prezzo_base, c.numero;
END$$

-- Occupazione e ricavi camere giorno per giorno nell'intervallo [p_dal, p_al).
CREATE PROCEDURE sp_report_occupazione(IN p_dal DATE, IN p_al DATE)
READS SQL DATA
BEGIN
  DECLARE v_camere INT;

  IF p_al <= p_dal THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INTERVALLO_DATE_NON_VALIDO';
  END IF;

  SET v_camere = (SELECT COUNT(*) FROM camere WHERE eliminato_il IS NULL AND stato <> 'fuori_servizio');

  WITH RECURSIVE giorni (giorno) AS (
    SELECT p_dal
    UNION ALL
    SELECT giorno + INTERVAL 1 DAY FROM giorni WHERE giorno + INTERVAL 1 DAY < p_al
  )
  SELECT g.giorno,
         v_camere AS camere_disponibili,
         COUNT(p.id) AS camere_occupate,
         ROUND(IF(v_camere = 0, 0, COUNT(p.id) * 100 / v_camere), 2) AS occupazione_percentuale,
         ROUND(COALESCE(SUM((p.importo_soggiorno - p.sconto_promozione - p.sconto_codice - p.sconto_fedelta) / p.notti), 0), 2) AS ricavo_camere,
         ROUND(COALESCE(AVG((p.importo_soggiorno - p.sconto_promozione - p.sconto_codice - p.sconto_fedelta) / p.notti), 0), 2) AS prezzo_medio
    FROM giorni g
    LEFT JOIN prenotazioni p
           ON p.stato IN ('confermata','in_soggiorno','conclusa')
          AND p.data_arrivo <= g.giorno
          AND p.data_partenza > g.giorno
   GROUP BY g.giorno
   ORDER BY g.giorno;
END$$

DELIMITER ;


-- =============================================================================
-- 17. VISTE
-- =============================================================================

-- Dovuto, incassato e saldo di ogni prenotazione. Saldo negativo = da rimborsare.
CREATE VIEW v_saldo_prenotazioni AS
SELECT p.id AS prenotazione_id,
       p.codice,
       p.stato,
       CASE WHEN p.stato = 'cancellata' THEN p.penale_applicata ELSE p.totale END AS dovuto,
       COALESCE(SUM(CASE WHEN pg.stato = 'completato' AND pg.tipo <> 'rimborso' THEN pg.importo END), 0) AS incassato,
       COALESCE(SUM(CASE WHEN pg.stato = 'completato' AND pg.tipo =  'rimborso' THEN pg.importo END), 0) AS rimborsato,
       (CASE WHEN p.stato = 'cancellata' THEN p.penale_applicata ELSE p.totale END)
         - COALESCE(SUM(CASE WHEN pg.stato = 'completato' THEN IF(pg.tipo = 'rimborso', -pg.importo, pg.importo) END), 0) AS saldo
  FROM prenotazioni p
  LEFT JOIN pagamenti pg ON pg.prenotazione_id = p.id
 GROUP BY p.id, p.codice, p.stato, p.totale, p.penale_applicata;

-- Medie pubbliche: solo recensioni pubblicate.
CREATE VIEW v_valutazioni AS
SELECT COUNT(*) AS numero_recensioni,
       ROUND(AVG(voto), 2)                AS media,
       ROUND(AVG(voto_pulizia), 2)        AS media_pulizia,
       ROUND(AVG(voto_personale), 2)      AS media_personale,
       ROUND(AVG(voto_posizione), 2)      AS media_posizione,
       ROUND(AVG(voto_comfort), 2)        AS media_comfort,
       ROUND(AVG(voto_qualita_prezzo), 2) AS media_qualita_prezzo
  FROM recensioni
 WHERE stato = 'pubblicata';

-- Livello fedeltà e sconto di ogni cliente.
CREATE VIEW v_fedelta_utenti AS
SELECT u.id AS utente_id,
       u.punti_fedelta,
       l.id AS livello_id,
       l.codice AS livello,
       l.nome AS livello_nome,
       COALESCE(l.sconto_percentuale, 0) AS sconto_percentuale,
       (SELECT MIN(l2.punti_minimi) FROM livelli_fedelta l2 WHERE l2.punti_minimi > u.punti_fedelta) AS punti_prossimo_livello
  FROM utenti u
  LEFT JOIN livelli_fedelta l
         ON l.punti_minimi = (SELECT MAX(l3.punti_minimi) FROM livelli_fedelta l3 WHERE l3.punti_minimi <= u.punti_fedelta)
 WHERE u.ruolo = 'cliente'
   AND u.eliminato_il IS NULL;

-- Situazione delle camere oggi (cruscotto reception e pulizie).
CREATE VIEW v_stato_camere AS
SELECT c.id AS camera_id,
       c.numero,
       c.nome,
       c.tipologia_id,
       c.stato,
       c.stato_pulizia,
       (SELECT p.id FROM prenotazioni p
         WHERE p.camera_id = c.id AND p.stato = 'in_soggiorno' LIMIT 1) AS prenotazione_in_corso_id,
       EXISTS (SELECT 1 FROM prenotazioni p
                WHERE p.camera_id = c.id AND p.stato = 'confermata' AND p.data_arrivo = UTC_DATE()) AS arrivo_oggi,
       EXISTS (SELECT 1 FROM prenotazioni p
                WHERE p.camera_id = c.id AND p.stato = 'in_soggiorno' AND p.data_partenza = UTC_DATE()) AS partenza_oggi
  FROM camere c
 WHERE c.eliminato_il IS NULL;

-- Incassi netti per mese e metodo (cassa).
CREATE VIEW v_incassi_mensili AS
SELECT DATE_FORMAT(pagato_il, '%Y-%m') AS mese,
       metodo,
       COUNT(*) AS movimenti,
       SUM(IF(tipo = 'rimborso', -importo, importo)) AS netto
  FROM pagamenti
 WHERE stato = 'completato'
 GROUP BY DATE_FORMAT(pagato_il, '%Y-%m'), metodo;

-- Riepilogo mensile per la dichiarazione dell'imposta di soggiorno.
CREATE VIEW v_tassa_soggiorno_mensile AS
SELECT DATE_FORMAT(data_arrivo, '%Y-%m') AS mese,
       COUNT(*) AS prenotazioni,
       SUM(adulti + bambini) AS ospiti,
       SUM(DATEDIFF(data_partenza, data_arrivo)) AS notti,
       SUM(tassa_soggiorno) AS tassa
  FROM prenotazioni
 WHERE stato IN ('in_soggiorno','conclusa')
 GROUP BY DATE_FORMAT(data_arrivo, '%Y-%m');


-- =============================================================================
-- 18. DATI DI SISTEMA
-- -----------------------------------------------------------------------------
-- Solo i dati senza cui l'applicazione non funziona. I dati di prova vanno
-- nel seed separato.
-- =============================================================================

INSERT INTO ruoli (codice, nome, descrizione, staff) VALUES
  ('admin',              'Amministratore',      'Gestisce tutta la struttura',                  TRUE),
  ('receptionist',       'Receptionist',        'Prenotazioni, check-in, incassi, assistenza',  TRUE),
  ('housekeeper_senior', 'Housekeeper senior',  'Responsabile di turno delle pulizie',          TRUE),
  ('housekeeper',        'Housekeeper',         'Esegue le pulizie assegnate',                  TRUE),
  ('cliente',            'Cliente',             'Utente registrato del sito',                   FALSE);

INSERT INTO permessi (codice, modulo, descrizione) VALUES
  ('camere.gestisci',        'camere',        'Gestire camere, tipologie e servizi'),
  ('tariffe.gestisci',       'tariffe',       'Gestire periodi, piani, promozioni, codici sconto, pacchetti e tassa di soggiorno'),
  ('calendari.gestisci',     'tariffe',       'Gestire date bloccate e calendari esterni (iCal)'),
  ('prenotazioni.leggi',     'prenotazioni',  'Vedere tutte le prenotazioni'),
  ('prenotazioni.gestisci',  'prenotazioni',  'Creare, modificare e cancellare prenotazioni'),
  ('checkin.gestisci',       'prenotazioni',  'Registrare arrivi e partenze, dati e documenti ospiti'),
  ('ospiti.gestisci',        'ospiti',        'Gestire l''anagrafica ospiti'),
  ('alloggiati.invia',       'ospiti',        'Inviare le schedine ad Alloggiati Web'),
  ('pagamenti.leggi',        'pagamenti',     'Vedere i pagamenti'),
  ('pagamenti.registra',     'pagamenti',     'Registrare incassi in struttura e rimborsi'),
  ('fatture.gestisci',       'pagamenti',     'Emettere fatture e note di credito'),
  ('pulizie.leggi',          'pulizie',       'Vedere le attività di pulizia'),
  ('pulizie.esegui',         'pulizie',       'Aggiornare le proprie attività di pulizia'),
  ('pulizie.gestisci',       'pulizie',       'Assegnare e verificare le attività di pulizia'),
  ('manutenzione.segnala',   'pulizie',       'Segnalare guasti e problemi'),
  ('manutenzione.gestisci',  'pulizie',       'Gestire le segnalazioni di manutenzione'),
  ('recensioni.modera',      'recensioni',    'Pubblicare, rifiutare e rispondere alle recensioni'),
  ('chat.assistenza',        'chat',          'Rispondere a clienti e visitatori in chat'),
  ('faq.gestisci',           'chat',          'Gestire le FAQ'),
  ('contenuti.gestisci',     'contenuti',     'Gestire immagini, testi, traduzioni e documenti legali'),
  ('utenti.gestisci',        'utenti',        'Gestire utenti, ruoli e permessi'),
  ('impostazioni.gestisci',  'impostazioni',  'Modificare le impostazioni della struttura'),
  ('analytics.leggi',        'analytics',     'Vedere statistiche e report');

-- L'admin ha sempre tutti i permessi.
INSERT INTO ruoli_permessi (ruolo, permesso)
SELECT 'admin', codice FROM permessi;

INSERT INTO ruoli_permessi (ruolo, permesso) VALUES
  ('receptionist', 'prenotazioni.leggi'),
  ('receptionist', 'prenotazioni.gestisci'),
  ('receptionist', 'checkin.gestisci'),
  ('receptionist', 'ospiti.gestisci'),
  ('receptionist', 'alloggiati.invia'),
  ('receptionist', 'pagamenti.leggi'),
  ('receptionist', 'pagamenti.registra'),
  ('receptionist', 'fatture.gestisci'),
  ('receptionist', 'pulizie.leggi'),
  ('receptionist', 'manutenzione.segnala'),
  ('receptionist', 'chat.assistenza'),
  ('housekeeper_senior', 'pulizie.leggi'),
  ('housekeeper_senior', 'pulizie.esegui'),
  ('housekeeper_senior', 'pulizie.gestisci'),
  ('housekeeper_senior', 'manutenzione.segnala'),
  ('housekeeper_senior', 'manutenzione.gestisci'),
  ('housekeeper', 'pulizie.leggi'),
  ('housekeeper', 'pulizie.esegui'),
  ('housekeeper', 'manutenzione.segnala');

-- Admin con tutti; colleghi dello stesso ruolo tra loro (gruppi di squadra);
-- housekeeper con il proprio senior. Receptionist e housekeeping non si parlano.
INSERT INTO regole_chat (ruolo_a, ruolo_b) VALUES
  ('admin', 'admin'),
  ('admin', 'receptionist'),
  ('admin', 'housekeeper'),
  ('admin', 'housekeeper_senior'),
  ('housekeeper', 'housekeeper_senior'),
  ('receptionist', 'receptionist'),
  ('housekeeper', 'housekeeper'),
  ('housekeeper_senior', 'housekeeper_senior');

INSERT INTO livelli_fedelta (codice, nome, punti_minimi, sconto_percentuale, colore) VALUES
  ('bronze',   'Bronze',   0,    0,  '#CD7F32'),
  ('silver',   'Silver',   100,  3,  '#C0C0C0'),
  ('gold',     'Gold',     300,  5,  '#D4AF37'),
  ('platinum', 'Platinum', 600,  8,  '#E5E4E2'),
  ('diamond',  'Diamond',  1000, 10, '#B9F2FF');

INSERT INTO impostazioni (chiave, valore, tipo, gruppo, descrizione, pubblica) VALUES
  -- struttura (dati anche per fatture e Alloggiati)
  ('struttura_nome',              '',          'testo',    'struttura',     'Nome commerciale della struttura', TRUE),
  ('struttura_ragione_sociale',   '',          'testo',    'struttura',     'Ragione sociale per le fatture', FALSE),
  ('struttura_partita_iva',       '',          'testo',    'struttura',     'Partita IVA', FALSE),
  ('struttura_codice_fiscale',    '',          'testo',    'struttura',     'Codice fiscale', FALSE),
  ('struttura_regime_fiscale',    'RF01',      'testo',    'struttura',     'Regime fiscale SDI (RF01 = ordinario)', FALSE),
  ('struttura_indirizzo',         '',          'testo',    'struttura',     'Indirizzo', TRUE),
  ('struttura_cap',               '',          'testo',    'struttura',     'CAP', TRUE),
  ('struttura_comune',            '',          'testo',    'struttura',     'Comune', TRUE),
  ('struttura_provincia',         '',          'testo',    'struttura',     'Sigla provincia', TRUE),
  ('struttura_email',             '',          'testo',    'struttura',     'Email di contatto', TRUE),
  ('struttura_telefono',          '',          'testo',    'struttura',     'Telefono di contatto', TRUE),
  ('struttura_cin',               '',          'testo',    'struttura',     'Codice Identificativo Nazionale (obbligatorio negli annunci)', TRUE),
  ('struttura_iban',              '',          'testo',    'struttura',     'IBAN per i bonifici (mostrato al cliente)', TRUE),
  ('struttura_intestatario_conto', '',          'testo',    'struttura',     'Intestatario del conto per i bonifici', TRUE),
  -- soggiorno e prenotazioni
  ('orario_checkin',              '15:00',     'testo',    'soggiorno',     'Orario di inizio check-in', TRUE),
  ('orario_checkout',             '10:00',     'testo',    'soggiorno',     'Orario limite check-out', TRUE),
  ('prenotazioni_scadenza_ore',   '24',        'numero',   'prenotazioni',  'Ore dopo cui una prenotazione in attesa di pagamento scade', FALSE),
  ('blocco_checkout_minuti',      '15',        'numero',   'prenotazioni',  'Durata del blocco temporaneo della camera durante il pagamento online', FALSE),
  -- fiscale
  ('valuta',                      'EUR',       'testo',    'fiscale',       'Valuta (ISO 4217)', TRUE),
  ('iva_soggiorno',               '10',        'numero',   'fiscale',       'Aliquota IVA sul pernottamento (%)', FALSE),
  ('iva_servizi',                 '22',        'numero',   'fiscale',       'Aliquota IVA predefinita dei servizi extra (%)', FALSE),
  ('limite_contanti',             '5000',      'numero',   'fiscale',       'Limite di legge per i pagamenti in contanti (importo non raggiungibile)', FALSE),
  -- fedeltà e pulizie
  ('fedelta_punti_per_notte',     '10',        'numero',   'fedelta',       'Punti fedeltà assegnati per ogni notte di soggiorno concluso', TRUE),
  ('pulizie_richiedi_ispezione',  '1',         'booleano', 'pulizie',       'Le camere pulite restano da ispezionare finché il responsabile non verifica', TRUE),
  ('pulizie_autoassegna',         '0',         'booleano', 'pulizie',       'Pulizie a turno: ogni mattina una camera a ogni addetto, a chi finisce la successiva sullo stesso piano o il più vicino', FALSE),
  -- localizzazione
  ('fuso_orario',                 'Europe/Rome', 'testo',  'localizzazione','Fuso orario della struttura', TRUE),
  ('lingua_predefinita',          'it',        'testo',    'localizzazione','Lingua predefinita del sito', TRUE),
  ('lingue_attive',               '["it","en","fr","de","es"]', 'json', 'localizzazione','Lingue disponibili sul sito', TRUE),
  -- chat
  ('chat_conservazione_giorni',   '365',       'numero',   'chat',          'Giorni dopo cui le conversazioni chiuse vengono eliminate', FALSE),
  ('chat_riepilogo_email_minuti', '60',        'numero',   'chat',          'Intervallo minimo tra due riepiloghi email dei messaggi non letti', FALSE),
  -- aspetto (il logo è la prima immagine dei media con entita 'logo')
  ('aspetto_colore',              '#5e6b3a',   'testo',    'aspetto',       'Colore principale del sito (esadecimale)', TRUE),
  ('aspetto_tema',                'sistema',   'testo',    'aspetto',       'Tema predefinito: sistema, chiaro o scuro (ognuno può cambiarlo sul suo dispositivo)', TRUE);
