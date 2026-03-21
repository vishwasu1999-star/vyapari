'use strict';
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { query }        = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');

// ============================================================
// HELPERS
// ============================================================
const signAccessToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });

const signRefreshToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });

const saveRefreshToken = async (userId, token, req) => {
  const ms      = parseDuration(process.env.JWT_REFRESH_EXPIRES_IN || '7d');
  const expires = new Date(Date.now() + ms);
  await query(
    `INSERT INTO refresh_tokens (user_id, token, device_info, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      token,
      req.headers['user-agent']?.substring(0, 200) || null,
      req.ip || null,
      expires,
    ]
  );
};

// Parse "7d", "15m" etc. to milliseconds
const parseDuration = (str) => {
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const m   = str.match(/^(\d+)([smhd])$/);
  if (!m) return 7 * 86400000;
  return parseInt(m[1]) * map[m[2]];
};

// ============================================================
// POST /api/auth/register
// ============================================================
const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  // Validate input
  if (!name?.trim())  throw new AppError('Name is required', 400);
  if (!email?.trim()) throw new AppError('Email is required', 400);
  if (!password)      throw new AppError('Password is required', 400);
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) throw new AppError('Invalid email format', 400);
  if (password.length < 8) throw new AppError('Password must be at least 8 characters', 400);
  if (!/[A-Z]/.test(password)) throw new AppError('Password must contain at least one uppercase letter', 400);
  if (!/[0-9]/.test(password)) throw new AppError('Password must contain at least one digit', 400);

  const normalizedEmail = email.toLowerCase().trim();

  // Check duplicate
  const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length) throw new AppError('Email is already registered', 409);

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Insert user
  const result = await query(
    `INSERT INTO users (name, email, phone, password_hash, is_verified)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, phone, created_at`,
    [name.trim(), normalizedEmail, phone || null, passwordHash, true]
  );

  const user = result.rows[0];
  const accessToken  = signAccessToken(user.id);
  const refreshToken = signRefreshToken(user.id);
  await saveRefreshToken(user.id, refreshToken, req);

  // Log
  await query(
    'INSERT INTO audit_logs (user_id, action, entity, entity_id, ip_address) VALUES ($1,$2,$3,$4,$5)',
    [user.id, 'REGISTER', 'user', user.id, req.ip]
  );

  logger.info('User registered', { email: normalizedEmail });

  res.status(201).json({
    user:         { id: user.id, name: user.name, email: user.email },
    accessToken,
    refreshToken,
  });
});

// ============================================================
// POST /api/auth/login
// ============================================================
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) throw new AppError('Email and password are required', 400);

  const result = await query(
    'SELECT id, name, email, phone, password_hash, is_active FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );

  if (!result.rows.length) {
    // Consistent timing to prevent user enumeration
    await bcrypt.hash('dummy', 12);
    throw new AppError('Invalid email or password', 401);
  }

  const user = result.rows[0];

  if (!user.is_active) throw new AppError('Account has been deactivated', 401);

  const passwordValid = await bcrypt.compare(password, user.password_hash);
  if (!passwordValid) throw new AppError('Invalid email or password', 401);

  // Update last login
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const accessToken  = signAccessToken(user.id);
  const refreshToken = signRefreshToken(user.id);
  await saveRefreshToken(user.id, refreshToken, req);

  await query(
    'INSERT INTO audit_logs (user_id, action, entity, entity_id, ip_address) VALUES ($1,$2,$3,$4,$5)',
    [user.id, 'LOGIN', 'user', user.id, req.ip]
  );

  logger.info('User logged in', { email: user.email });

  res.json({
    user:  { id: user.id, name: user.name, email: user.email, phone: user.phone },
    accessToken,
    refreshToken,
  });
});

// ============================================================
// POST /api/auth/refresh
// ============================================================
const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new AppError('Refresh token is required', 400);

  // Verify signature
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  // Check in DB (not revoked, not expired)
  const result = await query(
    `SELECT id, user_id FROM refresh_tokens
     WHERE token = $1 AND user_id = $2 AND revoked = FALSE AND expires_at > NOW()`,
    [refreshToken, decoded.userId]
  );

  if (!result.rows.length) throw new AppError('Refresh token revoked or expired', 401);

  // Rotate: revoke old, issue new
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [result.rows[0].id]);

  const newAccessToken  = signAccessToken(decoded.userId);
  const newRefreshToken = signRefreshToken(decoded.userId);
  await saveRefreshToken(decoded.userId, newRefreshToken, req);

  res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

// ============================================================
// POST /api/auth/logout
// ============================================================
const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1', [refreshToken]);
  }

  if (req.user) {
    await query(
      'INSERT INTO audit_logs (user_id, action, entity, entity_id, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'LOGOUT', 'user', req.user.id, req.ip]
    );
  }

  res.json({ message: 'Logged out successfully' });
});

// ============================================================
// GET /api/auth/me
// ============================================================
const me = asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.created_at,
            json_agg(json_build_object(
              'id',    b.id,
              'name',  b.name,
              'gst',   b.gst_number,
              'state', b.state
            )) FILTER (WHERE b.id IS NOT NULL) AS businesses
     FROM users u
     LEFT JOIN businesses b ON b.owner_id = u.id AND b.is_active = TRUE
     WHERE u.id = $1
     GROUP BY u.id`,
    [req.user.id]
  );

  res.json({ user: result.rows[0] });
});

// ============================================================
// PUT /api/auth/change-password
// ============================================================
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) throw new AppError('Both current and new password are required', 400);
  if (newPassword.length < 8) throw new AppError('New password must be at least 8 characters', 400);

  const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const valid  = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!valid) throw new AppError('Current password is incorrect', 401);

  const newHash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user.id]);

  // Revoke all refresh tokens on password change
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [req.user.id]);

  res.json({ message: 'Password changed successfully. Please log in again.' });
});

module.exports = { register, login, refresh, logout, me, changePassword };
