import jwt from 'jsonwebtoken';

// Lazy load secrets at runtime
function getSecrets() {
  const secrets = [];
  if (process.env.JWT_SECRET) secrets.push(process.env.JWT_SECRET);
  secrets.push('tic-projects-platform-secret-key-2025'); // fallback old secret
  return secrets;
}

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  console.log('--- AUTH CHECK ---');
  console.log('[FLOW] Auth Header:', authHeader ? 'Present' : 'Missing');

  if (!token) {
    console.error('[FLOW] Auth Failed: No token provided');
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const secrets = getSecrets();
  let decoded = null;
  let lastError = null;

  for (const secret of secrets) {
    try {
      decoded = jwt.verify(token, secret);
      console.log(`[FLOW] Token verified using secret: ${secret === process.env.JWT_SECRET ? 'NEW_SECRET' : 'OLD_SECRET'}`);
      break;
    } catch (err) {
      lastError = err;
      console.warn(`[FLOW] Token verification failed with secret ${secret === process.env.JWT_SECRET ? 'NEW_SECRET' : 'OLD_SECRET'}: ${err.message}`);
    }
  }

  if (!decoded) {
    console.error('[FLOW] Auth Failed: Invalid or expired token', lastError?.message);
    return res.status(403).json({ error: 'Invalid or expired token.', details: lastError?.message });
  }

  req.user = decoded;
  console.log('[FLOW] Auth Success:', decoded);
  next();
};
