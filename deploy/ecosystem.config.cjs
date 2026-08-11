/**
 * pm2 process definition for THE DRAGON JOB.
 *
 * Run it from the repo root on the server:
 *   pm2 start deploy/ecosystem.config.cjs
 *
 * `next start` is invoked through the workspace's own binary rather than
 * `pnpm start`, so pm2 supervises node directly instead of a pnpm wrapper it
 * would have to kill twice.
 */
module.exports = {
  apps: [
    {
      name: 'dragonjob',
      cwd: `${__dirname}/../apps/web`,
      script: './node_modules/.bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      error_file: '/var/log/dragonjob/err.log',
      out_file: '/var/log/dragonjob/out.log',
      time: true,
    },
  ],
};
