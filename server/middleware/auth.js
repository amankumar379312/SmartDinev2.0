// middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = function auth(req, res, next) {
  try {
    let token;

    // From Authorization header: "Bearer <token>"
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // If you later use cookies, you can also read from req.cookies.token

    if (!token) {
      return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // decoded already has { id, name, phone, email, role }
    req.user = decoded;

    next();
  } catch (err) {
    console.error('AUTH middleware error:', err);
    return res.status(401).json({ msg: 'Token invalid' });
  }
};
