# RUNBOOK — Mise à jour des taux & mentions légales (outil ILV Crédit BUT)

> Destinataire : agent d'exploitation sur le VPS (shell + git).
> Dépôt : `/home/ubuntu/ilvcredit-vector-v2` (remote `origin` = github.com/NicolasTardy/newilvjuin).
> Service : `ilvcredit-vector-v2` (gunicorn, port `3023`). App : https://ilvcredit.triangleoffensif.fr/vector/

---

## 0. Règles d'or (à lire avant toute action)

1. **Deux fichiers en miroir.** Les taux existent EN DOUBLE et doivent rester cohérents :
   - `generate_ilv_depliant.py` (backend — fait foi pour les PDF générés)
   - `webapp-ilv.html` (frontend — affichage/aperçu)
   Toute mise à jour de taux modifie **les deux fichiers dans le même commit**.
2. **Périmètre autorisé** : uniquement les valeurs listées dans ce document (tables de taux,
   constantes fictives, dates, textes de mentions, tarifs services).
   **INTERDIT** sans instruction explicite de Nicolas :
   - les masques PDF (`PDF_MODIFIABLES_CREDIT/`), `champs_all.json`
   - la stratégie de prix (`STRATEGIE_ILV`), `CREDIT_TYPES`, les slugs
   - `serve_local.py`, les fichiers `data/` (products.json, depliant.json)
   - tout fichier non mentionné ici
3. **Avant chaque commit** : envoyer à Nicolas (Telegram) le `git diff` complet + le résultat
   des vérifications (§4). Attendre son OK.
4. **Jamais de `git push --force`, jamais de `reset` sur origin.** Rollback = §6.
5. Un changement = un commit ciblé, message clair en français.

---

## 1. Cartographie — OÙ modifier quoi

### A. Taux par durée/tranche (crédits payants et IR : 10x, 20x, 36x, 48x, 60x)

Tranches de montant : 1 = ≤ 3000,99 € · 2 = ≤ 6000,99 € · 3 = > 6000,99 €.

| Donnée | Backend `generate_ilv_depliant.py` | Frontend `webapp-ilv.html` |
|---|---|---|
| TAEG affichés | table `TAEG = {` (~l.195) — format `"17,40 %"` | `const TAEG = {` (~l.638) — même format |
| Taux débiteurs (calcul mensualité + ML) | table `TAUX_DEBITEUR = {` (~l.209) — format `17.21` (nombre, point) | *(pas de miroir : le front utilise COEFF_MENSUELS)* |
| Coefficients mensuels | `COEFF_MENSUELS = {` (~l.185) | `const COEFF_MENSUELS = {` (~l.628) |
| Exemples affichés (tooltips) | — | `exampleByKey = {` (~l.3336) — recalculer les mensualités d'exemple si les taux changent |

⚠️ La mensualité des PDF est calculée par **TAUX_DEBITEUR** (formule PMT), pas par la table TAEG.
Si l'organisme communique un nouveau TAEG **et** un nouveau taux débiteur : mettre à jour les deux.

### B. Sans frais — taux « fictifs » des mentions légales (le TAEG affiché reste 0 %)

Backend uniquement (~l.219-234) :
```
TAEG_FICTIF_5X / TAUX_DEBITEUR_5X          (5× sans frais)
TAEG_FICTIF_3XSF / TAUX_DEBITEUR_3XSF      (3× — actuellement MASQUÉ dans l'outil, garder à jour quand même)
TAEG_FICTIF_10XSF / TAUX_DEBITEUR_10XSF    (10× sans frais promo)
```
Format : nombre avec point (`8.44`). L'affichage en virgule est automatique.

### C. Dates

| Constante (backend) | Rôle |
|---|---|
| `DATE_CONDITIONS` (~l.302) | « Conditions au JJ/MM/AAAA » — mentions 5x/10x/20x/36x/48x/60x |
| `DATE_CONDITIONS_3XSF` / `DATE_CONDITIONS_10XSF` | idem pour 3× / 10× SF |
| `DATE_OFFRE_10XSF` + `DATE_OFFRE_10XSF_HAUT` | période promo 10× SF (mentions + bandeau imprimé) |

Frontend : `const PROMO_10XSF = { debut: "AAAA-MM-JJ", fin: "AAAA-MM-JJ", label..., labelCourt... }` (~l.674)
— pilote l'avertissement de dates et la substitution 10x→10x SF côté interface. **Miroir obligatoire** avec les dates backend.

### D. Textes des mentions légales

Backend, fonction `generer_ml_text()` (~l.1014) : une branche par crédit (`5x`, `3xsf`, `10xsf`, `10x`, `20x`, défaut 36/48/60).
Blocs fixes partagés : `_CETELEM_A` (~l.975), `_CETELEM_B` (~l.984), `_BUT_PUB` (~l.993).

**Règles de rédaction impératives** (encodage Helvetica/WinAnsi des PDF) :
- Écrire **sans accents** (`credit`, `duree`, `interets`) — c'est voulu, suivre le style existant.
- Montants : **`EUR`**, jamais `€`, dans ces textes (ex. `150,00 EUR`).
- Décimales avec **virgule** dans les chaînes affichées.
- Ne pas toucher aux variables `{mf_fmt}`, `{mens_fmt}`, `{total_fmt}`, etc.

### D-bis. ⚠️ Impact d'un changement de taux sur les mentions de bas de page

Les mentions du bas de chaque ILV sont **régénérées à chaque PDF** par `generer_ml_text()`.
Elles mélangent du **dynamique** (suit les tables tout seul) et du **figé** (écrit en dur
dans les phrases — à modifier à la main).

**Dynamique — AUCUNE action après MAJ des tables/constantes :**
- « au TAEG fixe de {taeg} » ← table `TAEG` ; « taux debiteur fixe de {tdb_fmt} % » ← `TAUX_DEBITEUR`
- mensualité / intérêts / montant total dû ← recalculés (PMT) depuis `TAUX_DEBITEUR`
- paragraphe assurance (coût mensuel, coût total, TAEA) ← recalculé
- « Conditions au … » ← `DATE_CONDITIONS*` ; exemples 5x/3xsf/10xsf ← constantes `*_FICTIF_*`

**FIGÉ dans les intros — MAJ MANUELLE OBLIGATOIRE si le TAEG d'une tranche 1 ou 3 change :**
- branche `10x` : « fixe compris entre 8,60 % et 18,63 % » (= TAEG[10][3] et TAEG[10][1])
- branche `20x` : « entre 8,60 % et 17,40 % » (= TAEG[20][3] et TAEG[20][1])
- branches 36/48/60 : « entre 8,60 % et {taeg_max} » + dict `taeg_max = {"36x": "15,05", ...}`
- plages de vente : « de 160EUR a 25 000EUR » (10x), « 320EUR » (20x), `montant_min = {"36x": "580", "48x": "770", "60x": "960"}`

**Contrôle obligatoire après TOUTE MAJ de la table TAEG :**
```bash
grep -n "compris entre" generate_ilv_depliant.py
grep -n 'taeg_max' generate_ilv_depliant.py
```
→ vérifier que chaque fourchette « entre X % et Y % » = (TAEG tranche 3, TAEG tranche 1)
de la durée concernée. Si incohérent : corriger la chaîne en dur, dans le même commit.
La vérification §4.3 (impression du texte ML) doit être relue AUSSI sur l'intro, pas
seulement sur l'exemple.

### E. Tarifs services (garantie / livraison)

Tables `SIM_RAW` — **dans les deux fichiers** : backend ~l.458, frontend ~l.1414.
Format par ligne : `[univers, famille, prixMin, prixMax, gar1, gar2, gar3, livPdP, livDom, montage, livEnsPdP, livEnsDom]`
(`0` = indisponible, `-1` = abonnement exclu). Modifier la même valeur aux deux endroits.

---

## 2. Procédure standard

```bash
cd /home/ubuntu/ilvcredit-vector-v2
git pull                        # partir d'un état propre et à jour
git status --short              # doit être vide avant de commencer
```
1. Faire les modifications (sed/éditeur) **dans les deux fichiers si la donnée est en miroir**.
2. Lancer les vérifications (§4). Toutes doivent passer.
3. Envoyer à Nicolas : `git diff` + sorties des vérifications. **Attendre son OK.**
4. Commit + push + déploiement (§5).

---

## 3. Exemples de demandes types

- « Nouveau taux débiteur 10× tranche 1 : 17,45 % au lieu de 17,21 %, TAEG 18,90 % »
  → backend `TAUX_DEBITEUR[10][1] = 17.45` + `TAEG[10][1] = "18,90 %"` ; frontend `TAEG[10][1] = "18,90 %"` ;
  **ET** la fourchette figée de l'intro 10x « compris entre 8,60 % et 18,63 % » → « … et 18,90 % » (voir D-bis) ;
  recalculer l'exemple 10x_ir de `exampleByKey` si demandé.
- « Conditions au 01/10/2026 » → `DATE_CONDITIONS = "01/10/2026"` (backend). Vérifier si les
  variantes 3XSF/10XSF sont aussi concernées.
- « Prolongation 10× SF jusqu'au 31/08 » → backend `DATE_OFFRE_10XSF*` + frontend `PROMO_10XSF` (fin + labels).

---

## 4. Vérifications OBLIGATOIRES avant commit

```bash
cd /home/ubuntu/ilvcredit-vector-v2

# 4.1 Syntaxe Python
./venv/bin/python -c "import ast; ast.parse(open('generate_ilv_depliant.py').read()); print('PY OK')"

# 4.2 Syntaxe JS (si node absent sur le VPS, ignorer cette étape)
python3 - <<'PY'
import re
h=open("webapp-ilv.html",encoding="utf-8").read()
open("/tmp/_chk.js","w").write("\n".join(re.findall(r"<script>(.*?)</script>",h,re.S)))
PY
node --check /tmp/_chk.js && echo "JS OK"

# 4.3 Contrôle du texte des mentions (adapter slug/durée/famille au crédit modifié)
./venv/bin/python - <<'PY'
import importlib.util
s=importlib.util.spec_from_file_location("g","generate_ilv_depliant.py")
g=importlib.util.module_from_spec(s); s.loader.exec_module(g)
calc=g.calculer_credit(10,"ir",500.0)
print(g.generer_ml_text("10x",10,"ir",500.0,calc))   # relire : nouveaux taux/dates présents ?
PY
```

## 5. Déploiement + contrôle post-déploiement

```bash
git add generate_ilv_depliant.py webapp-ilv.html      # uniquement les fichiers du périmètre
git -c commit.gpgsign=false commit -m "MAJ taux : <résumé précis>"
git push origin main
sudo systemctl restart ilvcredit-vector-v2

# Contrôle : le service répond et génère un PDF valide
curl -s -o /tmp/t.pdf -w "HTTP %{http_code} — %{content_type}\n" \
  -X POST "http://127.0.0.1:3023/api/generate-ilv-batch?fmt=A5&merge=1" \
  -H "Content-Type: application/json" \
  -d '[{"designation":"TEST","prix":500,"rayon_ilv":"TELEVISEUR","univers_ilv":"GEM/TV","ean":"3700000000001"}]'
file /tmp/t.pdf        # attendu : "PDF document"
```
Attendu : `HTTP 200 — application/pdf`. Sinon → §6 immédiatement.
Envoyer à Nicolas le hash du commit + le résultat du contrôle.

## 6. Rollback

```bash
cd /home/ubuntu/ilvcredit-vector-v2
git log --oneline -5                       # identifier le commit AVANT la MAJ
git revert --no-edit <hash_du_commit_fautif>
git push origin main
sudo systemctl restart ilvcredit-vector-v2
```
(`revert` de préférence à `reset --hard` : l'historique reste propre et le push passe sans force.)

---

## 7. Notes de contexte

- Le **3× Sans Frais** est actuellement **masqué** (pas dans la stratégie, case filtrée dans le
  panier). Sa plomberie existe toujours : ne pas la supprimer, ne pas le réactiver sans instruction.
- La mensualité minimum légale est **16 €** (contrôle automatique côté serveur).
- Le poste de travail de Nicolas a un clone local : après toute MAJ poussée depuis le VPS,
  il fera `git pull` à son retour — ne rien faire de spécial pour ça.
- `tuto.html` (mode d'emploi magasins) : à ne modifier que si la MAJ change une info qui y figure
  (ex. tranches de crédit) — le signaler à Nicolas plutôt que de le modifier d'initiative.
