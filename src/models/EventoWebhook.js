// Webhook ricevuti da Stripe/PayPal. La chiave (provider, id_evento) rende
// l'elaborazione idempotente: lo stesso evento consegnato due volte viene
// elaborato una sola volta.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { PROVIDER_WEBHOOK } = require('../constants/pagamenti.constants');

const EventoWebhook = sequelize.define(
  'EventoWebhook',
  {
    provider: {
      type: DataTypes.ENUM(...PROVIDER_WEBHOOK),
      primaryKey: true,
    },
    id_evento: {
      type: DataTypes.STRING(255),
      primaryKey: true,
    },
    tipo: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    payload: {
      type: DataTypes.JSON,
      allowNull: true,
      get() {
        const valore = this.getDataValue('payload');
        return typeof valore === 'string' ? JSON.parse(valore) : valore;
      },
    },
    elaborato_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    errore: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'eventi_webhook',
    createdAt: 'ricevuto_il',
    updatedAt: false,
  },
);

module.exports = EventoWebhook;
