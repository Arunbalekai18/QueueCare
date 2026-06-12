const crypto = require('crypto');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'queuecare_super_secret_session_key';

/**
 * Generates a signed JWT-like token valid for 2 hours.
 * @param {object} payload - The token data.
 */
function generateToken(payload) {
  const expPayload = {
    ...payload,
    exp: Date.now() + 2 * 60 * 60 * 1000 // 2 hours
  };
  
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(expPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
    
  return `${header}.${body}.${signature}`;
}

/**
 * Verifies a token's integrity and expiration.
 * @param {string} token - The signed token.
 */
function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [header, body, signature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
      
    if (signature !== expectedSignature) return null;
    
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }
    
    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Express middleware to guard routes and ensure valid authentication header.
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Access denied. Authorization token missing.' });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(403).json({ error: 'Access denied. Invalid or expired token.' });
  }

  req.adminUser = decoded;
  next();
}

module.exports = {
  generateToken,
  verifyToken,
  authMiddleware
};
