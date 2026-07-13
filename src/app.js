'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');
const morgan = require('morgan');

const config = require('./config');
const SqliteStore = require('./middleware/sessionStore')(session);
const flash = require('./middleware/flash');
const csrf = require('./middleware/csrf');
const { loadUser } = require('./middleware/auth');
const Setting = require('./models/setting');
const { icon } = require('./utils/icons');
const constants = require('./config/constants');
const { titleCase, money, formatDate, formatDateTime, numberToWords, today } = require('./utils/helpers');

const app = express();

// ---- View engine -----------------------------------------------------------
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// ---- Core middleware -------------------------------------------------------
if (config.env !== 'test') app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(config.root, 'public')));

// ---- Sessions --------------------------------------------------------------
app.use(
  session({
    store: new SqliteStore(),
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: config.session.maxAge,
      secure: config.env === 'production' && process.env.TRUST_PROXY === '1',
    },
  })
);
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use(flash);

// ---- View helpers available in every template -----------------------------
// Set BEFORE csrf/auth so even error pages rendered from those middlewares have
// icon(), settings and appName available.
app.use((req, res, next) => {
  res.locals.settings = Setting.all();
  res.locals.appName = res.locals.settings.institution_name;
  res.locals.currency = res.locals.settings.currency_symbol || '₹';
  res.locals.currentPath = req.path;
  res.locals.query = req.query;
  res.locals.title = '';
  res.locals.icon = icon;
  res.locals.constants = constants;
  res.locals.labelFor = constants.labelFor;
  res.locals.h = { titleCase, money, formatDate, formatDateTime, numberToWords, today };
  next();
});

app.use(csrf);
app.use(loadUser);

// ---- Routes ----------------------------------------------------------------
require('./routes')(app);

// ---- 404 -------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'Page not found', layout: 'layouts/auth' });
});

// ---- Error handler ---------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).render('errors/500', {
    title: 'Something went wrong',
    layout: 'layouts/auth',
    error: config.env === 'development' ? err : null,
  });
});

module.exports = app;
