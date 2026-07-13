// PM2 process manager config.
//   npm ci --omit=dev && npm run setup
//   pm2 start ecosystem.config.js --env production
//   pm2 save && pm2 startup
//
// Note: SQLite is a single-file database, so run ONE instance (fork mode),
// not a cluster. Scale vertically, or move the data layer to MySQL/Postgres
// (see README) before running multiple instances.
module.exports = {
  apps: [
    {
      name: 'wschools-fees',
      script: 'server.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        TRUST_PROXY: '1',
        // Provide SESSION_SECRET, ADMIN_PASSWORD, BACKUP_ENCRYPTION_KEY via a
        // real environment or an .env file — do not hard-code secrets here.
      },
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      time: true,
    },
  ],
};
