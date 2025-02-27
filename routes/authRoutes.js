const express = require('express');
const passport = require('passport');
const catchAsync = require('../utils/catchAsync');
const pool = require('./../db/db');
const { createSendToken } = require('./../controller/authController');
const { findOrCreateUser } = require('./../model/userModel');

const router = express.Router();

router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

// Google OAuth Redirect
router.get(
  '/google/redirect',
  passport.authenticate('google', { session: false }),
  (req, res) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ status: 'fail', message: 'Authentication failed' });
    }

    createSendToken(req.user, 200, req, res, false);
  }
);

router.get(
  '/facebook',
  passport.authenticate('facebook', { scope: ['email'] })
);

// Facebook OAuth Redirect
router.get(
  '/facebook/redirect',
  passport.authenticate('facebook', { session: false }),
  (req, res) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ status: 'fail', message: 'Authentication failed' });
    }
    createSendToken(req.user, 200, req, res, false);
  }
);

// 🔥 New Route for Postman Testing (Token-based Google Login)
router.post(
  '/google/token',
  catchAsync(async (req, res) => {
    const { access_token } = req.body;

    if (!access_token) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide an access_token',
      });
    }

    const response = await fetch(
      `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${access_token}`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    let userData = await response.json();
    // console.log('UserData:', userData);

    if (userData.error) {
      return res.status(400).json({
        status: 'fail',
        message: `Google API Error: ${userData.error.message}`,
      });
    }

    if (!userData.email) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid access_token',
      });
    }

    const existingUserQuery = `
      SELECT * FROM users
      WHERE email = $1;
    `;
    const existingUserResult = await pool.query(existingUserQuery, [
      userData.email.trim(),
    ]);

    let existingUser = existingUserResult.rows;

    if (existingUser.length === 0) {
      const insertUserQuery = `
        INSERT INTO users (email, name, photo, auth_provider, auth_provider_id, role)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
      `;
      const insertUserValues = [
        userData.email,
        userData.name,
        userData.picture,
        'google',
        userData.id,
        'consumer',
      ];

      const insertedUserResult = await pool.query(
        insertUserQuery,
        insertUserValues
      );
      existingUser = insertedUserResult.rows;
    }

    createSendToken(existingUser[0], 200, req, res, false);
  })
);

// 🔥 Postman Testing - Facebook Token
router.post(
  '/facebook/token',
  catchAsync(async (req, res) => {
    const { access_token } = req.body;
    if (!access_token)
      return res
        .status(400)
        .json({ status: 'fail', message: 'Provide access_token' });

    const response = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${access_token}`
    );
    const userData = await response.json();
    if (userData.error)
      return res.status(400).json({
        status: 'fail',
        message: `Facebook API Error: ${userData.error.message}`,
      });

    const existingUserQuery = `SELECT * FROM users WHERE email = $1;`;
    const existingUserResult = await pool.query(existingUserQuery, [
      userData.email,
    ]);

    let user =
      existingUserResult.rows[0] ||
      (await findOrCreateUser(userData, 'facebook'));
    createSendToken(user, 200, req, res, false);
  })
);

module.exports = router;
