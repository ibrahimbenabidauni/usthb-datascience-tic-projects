import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'tic-projects-platform-secret-key-2025';

console.log('Using JWT_SECRET length:', JWT_SECRET.length);

export const authenticateToken = (req, res, next) => {
  // STEP 1: HARD INSTRUMENTATION (BACKEND)
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('--- BACKEND AUTH START ---');
  console.log('[FLOW] 1. Auth Middleware Start:', req.method, req.path);
  console.log('[FLOW] Auth Header:', authHeader ? 'Present' : 'Missing');
  console.log('[FLOW] Token Length:', token ? token.length : 0);
  console.log('[FLOW] Server Time:', new Date().toISOString());

  if (!token) {
    console.error('[FLOW] Auth Failed: No token provided');
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('[FLOW] Auth Success: User ID', decoded.id, 'Exp:', new Date(decoded.exp * 1000).toISOString());
    req.user = decoded;
    next();
  } catch (error) {
    console.error('[FLOW] Auth Failed:', error.message);
    return res.status(403).json({ error: 'Invalid or expired token.' });
  } finally {
    console.log('--- BACKEND AUTH END ---');
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
