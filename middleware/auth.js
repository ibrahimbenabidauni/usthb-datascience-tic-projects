import jwt from 'jsonwebtoken';

// Use environment secret if set, else fallback to old secret
export const JWT_SECRET = process.env.JWT_SECRET || 'tic-projects-platform-secret-key-2025';

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
  for (const secret of [JWT_SECRET]) { // only one secret now
    try {
      decoded = jwt.verify(token, secret);
      break;
    } catch (err) {
      // ignore
    }
  }

  if (!decoded) {
    console.error('[FLOW] Auth Failed: Invalid or expired token');
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }

  req.user = decoded;
  next();
};
