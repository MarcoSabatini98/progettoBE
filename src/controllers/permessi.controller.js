// src/controllers/permessi.controller.js
//
// Permessi dei ruoli e regole su chi può scrivere a chi in chat (solo admin).

const permessiService = require('../services/permessi.service');
const { inviaSuccesso } = require('../utils/risposta');

const matrice = async (req, res) => {
  const matriceRuoli = await permessiService.matrice();
  return inviaSuccesso(res, 200, matriceRuoli);
};

const impostaPermessi = async (req, res) => {
  const permessi = await permessiService.impostaPermessi(req.params.ruolo, req.body.permessi);
  return inviaSuccesso(res, 200, permessi);
};

const regoleChat = async (req, res) => {
  const regole = await permessiService.regoleChat();
  return inviaSuccesso(res, 200, regole);
};

const impostaRegoleChat = async (req, res) => {
  await permessiService.impostaRegoleChat(req.body.coppie);
  const regole = await permessiService.regoleChat();
  return inviaSuccesso(res, 200, regole);
};

module.exports = {
  matrice,
  impostaPermessi,
  regoleChat,
  impostaRegoleChat,
};
