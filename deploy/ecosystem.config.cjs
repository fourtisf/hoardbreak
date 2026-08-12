/**
 * pm2 process definition for THE DRAGON JOB.
 *
 * Run it from the repo root on the server:
 *   pm2 start deploy/ecosystem.config.cjs
 *
 * `next start` is invoked through the workspace's own binary rather than
 * `pnpm start`, so pm2 supervises node directly instead of a pnpm wrapper it
 * would have to kill twice.
 *
 * `interpreter` is NOT optional here. Under pnpm, `node_modules/.bin/next` is a
 * /bin/sh shim that exports the NODE_PATH pnpm's isolated store needs before it
 * execs node — it is not a JavaScript file. pm2 defaults to running scripts
 * with the node interpreter, which hands that shell script to node and dies on
 * the first line. The shim's `exec` replaces the shell with node, so pm2 still
 * ends up supervising the node process directly.
 */
module.exports = {
  apps: [
    {
      name: 'dragonjob',
      cwd: `${__dirname}/../apps/web`,
      script: './node_modules/.bin/next',
      interpreter: '/bin/sh',
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
    /*
     * The daily board.
     *
     * Its own process on purpose: the game is written to work with the board
     * unreachable, so a crash here must not take the site down with it. Run
     * through `tsx` for the same reason the web app is not pre-compiled — the
     * engine ships TypeScript, and the board validates scores by generating the
     * same lair the player raided. One source of truth beats a build step.
     */
    {
      name: 'dragonjob-board',
      cwd: `${__dirname}/../services/api`,
      script: './node_modules/.bin/tsx',
      interpreter: '/bin/sh',
      args: 'src/server.ts',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT: '3100',
        DJ_DB: '/var/lib/dragonjob/board.db',
      },
      error_file: '/var/log/dragonjob/board-err.log',
      out_file: '/var/log/dragonjob/board-out.log',
      time: true,
    },
  ],
};
