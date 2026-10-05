// src/controllers/auth.controller.js
//
// Registrazione, accesso, rinnovo della sessione, verifica email e password.
// Il refresh token viaggia solo in un cookie httpOnly: il JavaScript del sito
// non lo vede mai, il frontend riceve solo l'access token.

const authService = require('../services/auth.service');
const utentiService = require('../services/utenti.service');
const config = require('../config/env');
const { inviaSuccesso } = require('../utils/risposta');
const { nonAutenticato } = require('../utils/errori');

const COOKIE_REFRESH = 'refresh_token';

// Frontend (Vercel) e API (Render) sono su domini diversi: in produzione il
// cookie deve essere SameSite=None + Secure, altrimenti il browser non lo invia.
// Il path lo limita alle rotte di autenticazione.
const opzioniCookie = {
  httpOnly: true,
  secure: config.produzione,
  sameSite: config.produzione ? 'none' : 'lax',
  path: '/api/auth',
};

const impostaCookie = (res, refreshToken) => {
  res.cookie(COOKIE_REFRESH, refreshToken, {
    ...opzioniCookie,
    maxAge: config.jwt.durataRefreshGiorni * 24 * 60 * 60 * 1000,
  });
};

const cancellaCookie = (res) => {
  res.clearCookie(COOKIE_REFRESH, opzioniCookie);
};

const refreshDalCookie = (req) => {
  const token = req.cookies?.[COOKIE_REFRESH];
  if (!token) {
    throw nonAutenticato('SESSIONE_SCADUTA', 'Sessione scaduta: accedi di nuovo');
  }
  return token;
};

// La sessione esce senza refresh token: quello resta nel cookie.
const inviaSessione = (res, status, { refreshToken, ...sessione }) => {
  impostaCookie(res, refreshToken);
  return inviaSuccesso(res, status, sessione);
};

// ─────────────────────────────────────
// Sessione
// ─────────────────────────────────────

const registra = async (req, res) => {
  const sessione = await authService.registra(req.body, req.contesto);
  return inviaSessione(res, 201, sessione);
};

const accedi = async (req, res) => {
  const sessione = await authService.accedi(req.body.email, req.body.password, req.contesto);
  return inviaSessione(res, 200, sessione);
};

const rinnova = async (req, res) => {
  const sessione = await authService.rinnova(refreshDalCookie(req), req.contesto);
  return inviaSessione(res, 200, sessione);
};

const esci = async (req, res) => {
  await authService.esci(req.cookies?.[COOKIE_REFRESH]);
  cancellaCookie(res);
  return inviaSuccesso(res, 200, null);
};

const esciOvunque = async (req, res) => {
  await authService.esciOvunque(req.contesto.utenteId);
  cancellaCookie(res);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// Verifica email
// ─────────────────────────────────────

const reinviaCodiceVerifica = async (req, res) => {
  await authService.reinviaCodiceVerifica(req.contesto.utenteId);
  return inviaSuccesso(res, 200, null);
};

const verificaEmail = async (req, res) => {
  await authService.verificaEmail(req.contesto.utenteId, req.body.codice);
  return inviaSuccesso(res, 200, null);
};

// ─────────────────────────────────────
// Password
// ─────────────────────────────────────

const richiediResetPassword = async (req, res) => {
  await authService.richiediResetPassword(req.body.email);
  return inviaSuccesso(res, 200, null);
};

const reimpostaPassword = async (req, res) => {
  await authService.reimpostaPassword(req.body.token, req.body.password);
  return inviaSuccesso(res, 200, null);
};

// Il cambio chiude tutte le sessioni: il frontend manda di nuovo al login.
const cambiaPassword = async (req, res) => {
  await authService.cambiaPassword(
    req.contesto.utenteId,
    req.body.password_attuale,
    req.body.nuova_password,
  );
  cancellaCookie(res);
  return inviaSuccesso(res, 200, null);
};

// Cancellazione dell'account chiesta dal cliente (GDPR): serve la password.
const eliminaAccount = async (req, res) => {
  await utentiService.eliminaAccount(req.contesto.utenteId, req.body.password);
  cancellaCookie(res);
  return inviaSuccesso(res, 200, null);
};

const disiscrivi = async (req, res) => {
  await authService.disiscrivi(req.body.token, req.contesto);
  return inviaSuccesso(res, 200, null);
};

module.exports = {
  registra,
  accedi,
  rinnova,
  esci,
  esciOvunque,
  reinviaCodiceVerifica,
  verificaEmail,
  richiediResetPassword,
  reimpostaPassword,
  cambiaPassword,
  eliminaAccount,
  disiscrivi,
};
