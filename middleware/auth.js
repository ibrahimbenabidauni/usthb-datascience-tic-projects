import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'tic-projects-platform-secret-key-2025';

console.log('Using JWT_SECRET length:', JWT_SECRET.length);

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  // TRACING: Captured headers for production verification
  if (process.env.NODE_ENV === 'production' || true) {
    console.log(`[VERIFY] Auth Header: ${authHeader ? 'PRESENT' : 'MISSING'}`);
    console.log(`[VERIFY] Token length: ${token ? token.length : 0}`);
  }

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error(`[VERIFY] JWT Error: ${error.message}`);
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
