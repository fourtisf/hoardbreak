# Deploying THE DRAGON JOB

Target: a fresh Ubuntu/Debian VPS, nginx in front of `next start` on port 3000,
supervised by pm2. Domain `thedragonjob.com` already has an A record pointing at
the box.

---

## 0. Look before you delete

Run these first. Every one is read-only — nothing here changes the server.

```bash
# what is running, and out of which directory
pm2 list
pm2 describe tare | sed -n '1,40p'
pm2 jlist | grep -E '"name"|"pm_cwd"|"pm_exec_path"'

# where the disk is actually going
du -h -d 1 /root /home /var/www /opt /srv 2>/dev/null | sort -h | tail -30
df -h /

# what else is listening, and what nginx is serving
ss -tlnp
ls -la /etc/nginx/sites-enabled/ 2>/dev/null
grep -rl "root\|proxy_pass" /etc/nginx/sites-enabled/ 2>/dev/null | xargs -r grep -H "server_name\|root\|proxy_pass"

# databases that would go with the old app
systemctl list-units --type=service --state=running | grep -Ei 'mysql|mariadb|postgres|mongo|redis'
```

**Read the output before running anything in step 1.** The delete commands below
name paths; substitute the ones your own output shows, don't assume mine.

---

## 1. Back up, then remove the old app

Deleting is not reversible. Take the archive even if you are sure — it costs one
command and thirty seconds, and it is the only way back if the old app turns out
to hold something you needed.

```bash
# adjust APP_DIR to the pm_cwd that `pm2 describe` printed
APP_DIR=/root/tare

mkdir -p /root/backup
tar czf /root/backup/tare-$(date +%F).tar.gz "$APP_DIR"
ls -lh /root/backup/                      # confirm the archive is a sane size

# databases, if step 0 found any running
# mysqldump --all-databases | gzip > /root/backup/mysql-$(date +%F).sql.gz
# sudo -u postgres pg_dumpall | gzip > /root/backup/pg-$(date +%F).sql.gz
```

Copy that archive **off the server** if you want a real backup:

```bash
# from your own machine, not the server
scp root@31.97.57.242:/root/backup/tare-*.tar.gz .
```

Now stop and remove the old process and its files:

```bash
pm2 stop tare
pm2 delete tare
pm2 save                                  # so it does not come back on reboot

ls -la "$APP_DIR"                         # LOOK at it one more time
rm -rf "$APP_DIR"

pm2 list                                  # should be empty
```

`rm -rf` on ext4 unlinks the file; it does not scrub the blocks. If "permanent"
means *unrecoverable by forensics* rather than *gone from the filesystem*, the
disk on a VPS is virtualised and you cannot guarantee that from inside the guest
— destroy and reprovision the VPS instead.

---

## 2. Install what the app needs

Check before installing — a box that already served something may have most of
this, and re-running the NodeSource script on a *newer* Node downgrades it.

```bash
node -v; pnpm -v; git --version; nginx -v; certbot --version
```

Install only what's missing. Node must be >= 20.11:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -   # only if Node < 20
apt-get install -y nodejs nginx git
corepack enable && corepack prepare pnpm@10.33.0 --activate
```

## 3. Get the code

The repository is public and `claude/new-session-74mwt7` is its default branch,
so this needs no credentials and no explicit checkout.

```bash
mkdir -p /srv
git clone https://github.com/fourtisf/hoardbreak.git /srv/dragonjob
cd /srv/dragonjob && git branch --show-current    # expect claude/new-session-74mwt7
```

If the repo is ever made private, add a read-only deploy key instead and clone
over SSH:

```bash
ssh-keygen -t ed25519 -C "srv1879549" -f /root/.ssh/id_ed25519 -N ""
cat /root/.ssh/id_ed25519.pub    # GitHub -> repo -> Settings -> Deploy keys
git clone git@github.com:fourtisf/hoardbreak.git /srv/dragonjob
```

## 4. Build and start

```bash
cd /srv/dragonjob
pnpm install --frozen-lockfile
pnpm build                                # ~1 min; fails loudly if anything is wrong

mkdir -p /var/log/dragonjob
mkdir -p /var/lib/dragonjob               # the board's database lives here
pm2 start deploy/ecosystem.config.cjs     # starts the site AND the board
pm2 save
pm2 startup systemd -u root --hp /root    # run the line it prints back

curl -sI http://127.0.0.1:3000 | head -1  # the site  — expect: HTTP/1.1 200 OK
curl -s  http://127.0.0.1:3100/health     # the board — expect: {"ok":true,...}
curl -s "http://127.0.0.1:3100/intel?depth=1"   # the whispers — expect: {"players":0,...} on a fresh box
```

The board answers three doors: `/health`, `/board` (GET the standing, POST a
score) and `/intel` (GET the night's aggregate — how many came back, average and
best haul, and the verdicts they earned). nginx maps `/api/` to all of them, so
adding `/intel` needed no nginx change.

Two processes, on purpose. The game is written to work with the board
unreachable, so a board that falls over must not take the site down with it.
`pm2 list` should show both `dragonjob` and `dragonjob-board` online.

## 5. Put nginx in front of it

```bash
cp /srv/dragonjob/deploy/nginx.conf /etc/nginx/sites-available/thedragonjob
ln -sfn /etc/nginx/sites-available/thedragonjob /etc/nginx/sites-enabled/thedragonjob
rm -f /etc/nginx/sites-enabled/default     # only if step 0 showed nothing else needs it

nginx -t && systemctl reload nginx
curl -sI http://thedragonjob.com | head -1
```

## 6. TLS

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d thedragonjob.com -d www.thedragonjob.com --agree-tos -m you@example.com
systemctl status certbot.timer             # renewal is automatic
```

---

## The invitation gate

Every route sits behind a code screen. The default word is `1998`. To change it,
set the variable **before building** — it is baked into the client bundle at
build time, not read at runtime:

```bash
cd /srv/dragonjob
echo 'NEXT_PUBLIC_ACCESS_CODE=yourword' > apps/web/.env.production.local
pnpm build && pm2 reload dragonjob
```

This is a doorman, not a lock. The code ships in the JavaScript the browser
downloads, so anyone who opens devtools can read it, and anyone who sets one
localStorage key walks past it. It keeps a closed beta closed and nothing more —
never put anything behind it that would actually hurt to lose.

---

## The daily board

`services/api` — one number per player, per night, per depth. It knows nothing
about the hideout, the crew or the gold; those never leave the player's machine.

No runtime dependencies: `node:http` and `node:sqlite` both ship with Node 22.
The database is a single file, `/var/lib/dragonjob/board.db`, holding thirty
nights and pruning itself.

**What it refuses.** The lair is a pure function of `date:depth`, so the server
generates the same one the player raided and checks the claim against what that
lair actually contains:

```bash
curl -s -X POST http://127.0.0.1:3100/board -H 'content-type: application/json' \
  -d '{"pid":"aaaaaaaa1111","name":"Test","date":"'"$(date -u +%F)"'","depth":1,"loot":999999999,"verdict":"CLEAN"}'
# {"error":"that lair holds 5701"}
```

That is not anti-cheat and is not called it — anyone who reads the client can
submit the ceiling exactly. It stops the top of the board being nonsense inside
a day, which is what an unchecked endpoint gets. Replay verification is the real
answer and the engine already records the log for it.

Back it up like anything else you would miss:

```bash
sqlite3 /var/lib/dragonjob/board.db ".backup '/root/board-$(date -u +%F).db'"
```

If the board is misbehaving, restarting it cannot hurt the site:

```bash
pm2 restart dragonjob-board
pm2 logs dragonjob-board --lines 40 --nostream
```

## Updating later

```bash
cd /srv/dragonjob
git pull
pnpm install --frozen-lockfile
pnpm build
pm2 reload dragonjob dragonjob-board
```

If the update touched `deploy/nginx.conf` — the `/api` route did — put the new
one in place too:

```bash
cp /srv/dragonjob/deploy/nginx.conf /etc/nginx/sites-available/thedragonjob
nginx -t && systemctl reload nginx
```

Careful: certbot rewrote that file with the TLS block when you ran step 6.
Copying the repo's version over it drops those lines, so re-run certbot after —
it is idempotent and will put them back without reissuing the certificate:

```bash
certbot --nginx -d thedragonjob.com -d www.thedragonjob.com
```

## When something is wrong

```bash
pm2 logs dragonjob --lines 100 --nostream
tail -50 /var/log/nginx/error.log
ss -tlnp | grep 3000                       # is next actually listening?
```

**502 from nginx** means nginx is fine and the app is not answering on 3000.
Do not debug nginx — check the app:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000
pm2 list                                   # a climbing ↺ count means a crash loop
```

**pm2 says `online` but nothing listens.** pm2 reports a process it has spawned
as online even when that process dies immediately and is being restarted, so
`online` is not proof the app works — the port check is. The known cause here is
a missing `interpreter` in the pm2 config: under pnpm, `node_modules/.bin/next`
is a `/bin/sh` shim, and pm2's default node interpreter cannot parse it.
