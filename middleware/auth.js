import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'tic-projects-platform-secret-key-2025';

console.log('Using JWT_SECRET length:', JWT_SECRET.length);

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('[AUTH] Path:', req.path);
  console.log('[AUTH] Authorization Header Present:', !!authHeader);
  
  if (!token) {
    console.error('[AUTH] No token provided');
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('[AUTH] Token verified for user:', decoded.username);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('[AUTH] Token verification failed:', error.message);
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
