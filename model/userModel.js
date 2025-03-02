const { hash } = require('crypto');
const pool = require('./../db/db');
const AppError = require('./../utils/appError');

exports.findOrCreateUser = async function (profile, provider) {
  console.log('profile', profile);

  if (!profile.emails || !profile.emails[0] || !profile.emails[0].value) {
    throw new AppError('No email found in the profile', 400);
  }

  if (!profile.emails || !profile.emails[0] || !profile.emails[0].value) {
    throw new AppError('No email found in the profile', 400);
  }

  try {
    const email = profile.emails?.[0].value || null;
    const name = profile.displayName;
    const photo = profile.photos?.[0].value || null;
    const provider_id = profile.id;

    if (!email) {
      throw new AppError('No email found in the profile', 400);
    }

    // Checking if the user already exists
    const existingUserQuery = `SELECT * FROM users WHERE email = $1;`;
    const existingUserResult = await pool.query(existingUserQuery, [email]);

    if (existingUserResult.rows.length > 0) {
      const user = existingUserResult.rows[0];

      // Updating the user's auth provider if it's different
      if (user.auth_provider !== provider) {
        await pool.query(
          `UPDATE users SET auth_provider = $1, auth_provider_id = $2 WHERE email = $3;`,
          [provider, provider_id, email]
        );
      }
      return user;
    }

    // Creating a new user if not found
    const insertUserQuery = `
      INSERT INTO users (name, email, photo, auth_provider, auth_provider_id, role)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const insertUserValues = [
      name,
      email,
      photo,
      provider,
      provider_id,
      'consumer',
    ];

    const insertedUserResult = await pool.query(
      insertUserQuery,
      insertUserValues
    );
    return insertedUserResult.rows[0];
  } catch (error) {
    throw error;
  }
};

exports.createUser = async ({ name, email, password, mobile, role }) => {
  const query = `
    INSERT INTO public."users" ("name", "email", "password","mobile", "role")
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, name, email, role;
  `;

  const values = [name, email, password, mobile, role];
  const result = await pool.query(query, values);
  return result.rows[0];
};

exports.findUserByEmail = async (email) => {
  const query = `
      SELECT id, name, email, password,role 
      FROM public."users" 
      WHERE email = $1 AND active = true;
    `;
  const result = await pool.query(query, [email]);
  return result.rows[0];
};

exports.findUserById = async (id) => {
  const query = `SELECT id, name , email, password_changed_at,password,role,photo FROM public."users" WHERE id = $1 AND active = true;`;
  const result = await pool.query(query, [id]);
  return result.rows[0];
};

exports.updatePasswordResetToken = async (
  userID,
  hashedToken,
  expirationTime
) => {
  const query = `
    UPDATE public."users"
    SET password_reset_token = $1, password_reset_expires = $2
    WHERE id = $3 AND active = true
    RETURNING id,email;`;

  const values = [hashedToken, expirationTime, userID];

  const result = await pool.query(query, values);

  if (result.rowCount === 0) {
    throw new Error('Failed to save password reset token.');
  }

  return result.rows[0];
};
