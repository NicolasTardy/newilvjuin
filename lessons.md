# Lessons — ilvcredit-vector-app

## 2026-05-04 — 500 Internal Server Error sur /vector/ (htpasswd introuvable dans le container Docker)

**Root cause:**
Le nginx systemd (host) a été arrêté le 2026-05-03 à 12:42. Le nginx Docker (`challengebut-nginx-1`, `challengeBut/docker-compose.yml`) a pris le relais sur les ports 80/443. La config Docker (`challengeBut/nginx/conf/ilvcredit.conf`) référençait `auth_basic_user_file /etc/nginx/conf.d/.htpasswd-vector` — chemin à l'intérieur du container. Ce chemin correspond à `/home/ubuntu/challengeBut/nginx/conf/.htpasswd-vector` sur le host (via le volume `./nginx/conf:/etc/nginx/conf.d`). Le fichier htpasswd n'avait été créé que sur le host (`/etc/nginx/.htpasswd-vector`) et jamais synchronisé dans le répertoire de la config Docker. Nginx ne pouvant pas ouvrir le fichier htpasswd → `[crit] Permission denied` → 500 pour tout visiteur.

**Fix:**
```bash
cp /etc/nginx/.htpasswd-vector /home/ubuntu/challengeBut/nginx/conf/.htpasswd-vector
chmod 644 /home/ubuntu/challengeBut/nginx/conf/.htpasswd-vector
```
Aucun rechargement nécessaire — nginx lit le fichier htpasswd à chaque requête. Le endpoint est repassé de 500 à 401 (auth requise).

**Prevention:**
- Le nginx **host** (`systemctl`) est `inactive` depuis le 2026-05-03. Toute modification de config nginx doit désormais cibler `challengeBut/nginx/conf/` (Docker), pas `/etc/nginx/conf.d/`.
- Tout fichier `auth_basic_user_file` créé sur le host doit être copié dans `challengeBut/nginx/conf/` pour être accessible au container.
- Avant toute maintenance nginx, vérifier lequel des deux (host ou Docker) tient réellement les ports 80/443 : `ss -tlnp | grep -E ':80|:443'` + `systemctl is-active nginx`.
