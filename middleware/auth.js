import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'tic-projects-platform-secret-key-2025';

console.log('Using JWT_SECRET length:', JWT_SECRET.length);

export const authenticateToken = (req, res, next) => {
  console.log(`[FLOW] 1. Auth Middleware Start: ${req.method} ${req.path}`);
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('[FLOW] Auth Header Status:', authHeader ? 'Present' : 'Missing');
  console.log('[FLOW] Token Length:', token ? token.length : 0);

  if (!token) {
    console.error('[FLOW] Auth Failed: No token');
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('[FLOW] Auth Success: User ID', decoded.id);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('[FLOW] Auth Failed:', error.message);
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
};

export { JWT_SECRET };
