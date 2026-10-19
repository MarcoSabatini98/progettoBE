// Movimento di denaro di una prenotazione: acconto, saldo, extra, penale o
// rimborso (sempre con importo positivo: il tipo dice il verso).
// Il trigger imposta pagato_il quando diventa 'completato' e rifiuta i
// contanti oltre il limite di legge.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const {
  TIPI_PAGAMENTO,
  METODI_PAGAMENTO,
  STATI_PAGAMENTO,
} = require('../constants/pagamenti.constants');

const Pagamento = sequelize.define(
  'Pagamento',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    uuid: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    prenotazione_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    tipo: {
      type: DataTypes.ENUM(...TIPI_PAGAMENTO),
      allowNull: false,
    },
    metodo: {
      type: DataTypes.ENUM(...METODI_PAGAMENTO),
      allowNull: false,
    },
    stato: {
      type: DataTypes.ENUM(...STATI_PAGAMENTO),
      allowNull: false,
      defaultValue: 'in_attesa',
    },
    importo: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { min: 0.01 },
    },
    valuta: {
      type: DataTypes.CHAR(3),
      allowNull: false,
      defaultValue: 'EUR',
    },
    // id del pagamento su Stripe/PayPal
    id_transazione: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    // es. CRO del bonifico
    riferimento: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    // numero dello scontrino o della ricevuta
    documento_fiscale: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    link_pagamento: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
    pagato_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    registrato_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'pagamenti',
  },
);

module.exports = Pagamento;
