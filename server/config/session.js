const session = require('express-session');
const MongoStore = require('connect-mongo');

module.exports = function buildSession({ mongoUrl, secret, isProd }) {
  return session({
    name: 'sid',
    secret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd
    }
  });
};
