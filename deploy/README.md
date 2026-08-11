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
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root    # run the line it prints back

curl -sI http://127.0.0.1:3000 | head -1  # expect: HTTP/1.1 200 OK
```

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

## Updating later

```bash
cd /srv/dragonjob
git pull
pnpm install --frozen-lockfile
pnpm build
pm2 reload dragonjob
```

## When something is wrong

```bash
pm2 logs dragonjob --lines 100
tail -50 /var/log/nginx/error.log
ss -tlnp | grep 3000                       # is next actually listening?
```
