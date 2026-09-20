const jwt = require('jsonwebtoken');
const { getOne, getAll } = require('../config/database');

function getJwtSecret() {
    // Bracket access so Next/webpack does not inline an empty build-time value.
    const secret = String(process.env['JWT_SECRET'] || '').trim();
    if (!secret) {
        throw new Error('JWT_SECRET is not set in environment. Add it to server/.env or Vercel env.');
    }
    return secret;
}

function attachUserRoles(decoded) {
    const additionalRoles = getOne(
        'SELECT role FROM user_roles WHERE user_id = ?',
        [decoded.id]
    );
    if (additionalRoles) {
        const roles = getAll(
            'SELECT role FROM user_roles WHERE user_id = ?',
            [decoded.id]
        );
        decoded.additional_roles = roles.map((r) => r.role);
    }
    return decoded;
}

function verifyJwtToken(token) {
    const decoded = attachUserRoles(jwt.verify(token, getJwtSecret()));
    return decoded;
}

function extractBearerToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }
    return null;
}

// Verify JWT token (Authorization: Bearer header only)
const requireAuth = (req, res, next) => {
    const token = extractBearerToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        req.user = verifyJwtToken(token);
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

/** Resume downloads — Bearer header or ?token= for window.open links. */
const requireResumeAuth = (req, res, next) => {
    const token = extractBearerToken(req) || String(req.query?.token || '').trim() || null;
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        req.user = verifyJwtToken(token);
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// Require admin role
const requireAdmin = (req, res, next) => {
    const isAdmin = req.user.role === 'admin' || req.user.additional_roles?.includes('admin');
    if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Require manager role
const requireManager = (req, res, next) => {
    const isManager = req.user.role === 'manager' || req.user.role === 'admin' ||
        req.user.additional_roles?.includes('manager') || req.user.additional_roles?.includes('admin');
    if (!isManager) {
        return res.status(403).json({ error: 'Manager access required' });
    }
    next();
};

// Require caller role
const requireCaller = (req, res, next) => {
    const isCaller = req.user.role === 'caller' || req.user.role === 'admin' ||
        req.user.additional_roles?.includes('caller') || req.user.additional_roles?.includes('admin');
    if (!isCaller) {
        return res.status(403).json({ error: 'Caller access required' });
    }
    next();
};

// Generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        getJwtSecret(),
        { expiresIn: '24h' }
    );
};

module.exports = {
    requireAuth,
    requireResumeAuth,
    requireAdmin,
    requireManager,
    requireCaller,
    generateToken,
    verifyJwtToken,
    extractBearerToken,
    getJwtSecret,
    get JWT_SECRET() {
        return getJwtSecret();
    }
};
