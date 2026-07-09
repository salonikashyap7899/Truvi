// PM2 process definition for the single-origin Hostinger VPS deploy.
// The Node server serves the API, the built React app (client/dist), and
// uploaded files — so this one process is the whole app. Nginx sits in front
// of it for TLS (see deploy/nginx.conf).
//
//   Start:   pm2 start ecosystem.config.cjs
//   Reload:  pm2 reload truvi
//   Logs:    pm2 logs truvi
//   Persist: pm2 save && pm2 startup
//
// Runtime config (DATABASE_URL, JWT secrets, CLIENT_URL, COOKIE_SAMESITE, …)
// is read from server/.env — see server/.env.production.example.
module.exports = {
  apps: [
    {
      name: "truvi",
      cwd: "./server",
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
