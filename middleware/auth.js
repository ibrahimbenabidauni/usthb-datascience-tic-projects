import jwt from 'jsonwebtoken';

const NEW_SECRET = process.env.JWT_SECRET || null;
const OLD_SECRET = 'tic-projects-platform-secret-key-2025'; // fallback

if (!NEW_SECRET) {
  console.warn('[WARNING] NEW_SECRET is undefined. Make sure JWT_SECRET is set in Vercel Environment Variables.');
}

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('--- BACKEND AUTH START ---');
  console.log('[FLOW] Auth Header:', authHeader ? 'Present' : 'Missing');

  if (!token) {
    console.error('[FLOW] Auth Failed: No token provided');
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  let decoded = null;
  let lastError = null;

  for (const secret of [NEW_SECRET, OLD_SECRET]) {
    if (!secret) continue; // skip undefined secrets
    try {
      decoded = jwt.verify(token, secret);
      console.log(`[FLOW] Token verified with secret: ${secret === NEW_SECRET ? 'NEW_SECRET' : 'OLD_SECRET'}`);
      break;
    } catch (err) {
      console.warn(`[FLOW] Token verification failed with secret ${secret === NEW_SECRET ? 'NEW_SECRET' : 'OLD_SECRET'}: ${err.message}`);
      lastError = err;
    }
  }

  if (!decoded) {
    console.error('[FLOW] Auth Failed: Invalid or expired token');
    return res.status(403).json({ error: 'Invalid or expired token.', details: lastError?.message });
  }

  req.user = decoded;
  console.log('[FLOW] Auth Success:', decoded);
  next();
};
