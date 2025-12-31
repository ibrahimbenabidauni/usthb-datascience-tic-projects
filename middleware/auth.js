import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'tic-projects-platform-secret-key-2025';

console.log('Using JWT_SECRET length:', JWT_SECRET.length);

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  // STEP 1: HARD INSTRUMENTATION (BACKEND)
  console.log('--- BACKEND AUTH START ---');
  console.log('Server Time:', new Date().toISOString());
  console.log('Request Path:', req.path);
  console.log('All Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Authorization Header Value:', authHeader);
  console.log('Parsed Token:', token ? `${token.substring(0, 10)}... [length: ${token.length}]` : 'NULL');

  if (!token) {
    console.error('[AUTH ERROR] No token provided');
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('[AUTH SUCCESS] User:', decoded.username, 'Exp:', new Date(decoded.exp * 1000).toISOString());
    req.user = decoded;
    next();
  } catch (error) {
    console.error('[AUTH ERROR] Verification failed:', error.message);
    if (error.name === 'TokenExpiredError') {
      console.error('[AUTH ERROR] Token expired at:', error.expiredAt);
    }
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
