# EN ATTENTE — Hausse des taux BNP (à appliquer à la date d'effet)

> STATUT : **préparé, NON appliqué.** Périmètre figé = §A uniquement (sans frais).
> Seul élément encore manquant : **la date d'effet (§C)**. Dès qu'elle est connue,
> la mise à jour est turnkey.
> Procédure générale : voir `MAJ_TAUX_RUNBOOK.md`. Toute application passe par
> l'accord explicite de Nicolas (diff + vérifs avant commit).
>
> Source définitive : `Mobilux_T3_2026.xlsx`, feuille « Tarification T3 2026 »
> (fournie par Aurélien). Valeurs retenues = **DTS** (« la plus forte »).
> Application EN DEUX TEMPS : 3×/10× à la date T3, 5× au 30/09/2026.

---

## A. SANS FRAIS — CONFIRMÉ, prêt à appliquer

Fichier : `generate_ilv_depliant.py`. Ces constantes ne changent QUE l'exemple
« coût du crédit » des mentions légales ; le TAEG affiché reste 0 %.

Source définitive : `Mobilux_T3_2026.xlsx`, feuille « Tarification T3 2026 »,
valeurs **DTS** (les plus fortes). Application EN DEUX TEMPS (cf. Aurélien).

**PHASE 1 — à la date d'effet T3 (§C) : 3× et 10× SEULEMENT**

| Constante (ligne) | Actuel | → Nouveau |
|---|---|---|
| `TAUX_DEBITEUR_3XSF` (l.225) | 12.20 | **12.76** |
| `TAEG_FICTIF_3XSF`   (l.224) | 12.91 | **13.61** |
| `TAUX_DEBITEUR_10XSF`(l.231) | 4.43  | **4.99** |
| `TAEG_FICTIF_10XSF`  (l.230) | 4.52  | **5.12** |

**PHASE 2 — au 30/09/2026 : le 5× SEULEMENT**

| Constante (ligne) | Actuel | → Nouveau |
|---|---|---|
| `TAUX_DEBITEUR_5X` (l.220) | 8.13 | **8.71** |
| `TAEG_FICTIF_5X`   (l.219) | 8.44 | **9.10** |

⚠️ Le 5× **reste à sa valeur actuelle jusqu'au 30/09/2026** (RV 2,00 %). Ne PAS
l'inclure en phase 1, même si l'Excel l'affiche déjà haussé.

Notes :
- Le **3×** est masqué dans l'outil (hors STRATEGIE + case filtrée) mais on met
  quand même sa constante à jour pour cohérence.
- Le **10×** est identique sur les 3 tranches → la constante unique suffit.
- Ces constantes ne changent QUE l'exemple « coût du crédit » des mentions ;
  le TAEG affiché au client reste 0 %.
- Pas de miroir frontend (elles n'existent que côté backend).
- Après édition, mettre à jour le commentaire de date sur les lignes 219-220.

## B. TAUX CLIENT (offres payantes / IR) — RÉSOLU : AUCUNE MODIFICATION

Confirmé par Nicolas (retour d'Aurélien) : **les taux client ne changent pas.**
La hausse ne concerne QUE le barème « gratuit » (coût absorbé par BUT).

Conséquences — NE PAS toucher :
- tables `TAEG` et `TAUX_DEBITEUR` (10× IR 18,63 %, 20× IR 17,40 %,
  36/48/60× 15,05 %) → inchangées ;
- fourchettes figées des intros de `generer_ml_text()`
  (« compris entre 8,60 % et 18,63 % » etc.) → inchangées (pas de §D-bis ici).

→ La hausse se limite donc STRICTEMENT aux 6 constantes du §A.

## C. DATES D'EFFET

- **Phase 2 (5×) : 30/09/2026** — confirmé par Aurélien.
- **Phase 1 (3× / 10×) : date T3 à confirmer** (grille « Tarification T3 2026 »,
  vraisemblablement début juillet 2026). SEULE info encore à obtenir d'Aurélien.
- À l'application : mettre `DATE_CONDITIONS` (l.302) à la date de la grille
  appliquée, et vérifier `DATE_CONDITIONS_3XSF` / `DATE_CONDITIONS_10XSF`.

---

## Procédure d'application (le jour J)

```bash
cd /home/ubuntu/ilvcredit-vector-v2   # (ou le dépôt local)
git pull
```
1. Éditer les constantes de la PHASE concernée (§A : 4 constantes 3×/10× en
   phase 1 ; 2 constantes 5× en phase 2) + `DATE_CONDITIONS` (§C). Jamais le §B.
2. Vérifications (venv) :
   ```bash
   ./venv/bin/python -c "import ast; ast.parse(open('generate_ilv_depliant.py').read()); print('PY OK')"
   ./venv/bin/python - <<'PY'
   import importlib.util
   s=importlib.util.spec_from_file_location("g","generate_ilv_depliant.py")
   g=importlib.util.module_from_spec(s); s.loader.exec_module(g)
   for slug,dur,fam,m in [("3xsf",3,"gratuit",150.0),("5x",5,"gratuit",250.0),("10xsf",10,"gratuit",500.0)]:
       print(slug, g.generer_ml_text(slug,dur,fam,m,g.calculer_credit(dur,fam,m))[:200])
   PY
   ```
   → relire que les nouvelles valeurs (12,76 / 13,61 / 4,99 / 5,12 …) apparaissent.
3. Montrer le `git diff` + les vérifs à Nicolas → **attendre OK**.
4. Commit + push :
   ```bash
   git -c commit.gpgsign=false commit -am "MAJ taux : hausse BNP du JJ/MM/AAAA (sans frais)"
   git push origin main
   sudo systemctl restart ilvcredit-vector-v2
   ```
5. Contrôle post-déploiement :
   ```bash
   curl -s -o /tmp/t.pdf -w "HTTP %{http_code} — %{content_type}\n" -X POST "http://127.0.0.1:3023/api/generate-ilv-batch?fmt=A5&merge=1" -H "Content-Type: application/json" -d '[{"designation":"TEST","prix":500,"rayon_ilv":"TELEVISEUR","univers_ilv":"GEM/TV","ean":"3700000000001"}]'
   ```
   → attendu `HTTP 200 — application/pdf`.

## Rollback
```bash
git revert <hash>  && git push origin main && sudo systemctl restart ilvcredit-vector-v2
# urgence : git reset --hard stable-avant-conges-2026-07 && restart
```

---

### Journal
- Sort des taux client (§B) : **inchangés** (confirmé Aurélien + Excel).
- Valeurs gratuit : figées depuis `Mobilux_T3_2026.xlsx` (DTS).
- Calendrier : 3×/10× à la date T3 (à confirmer) · 5× au 30/09/2026.
- (à compléter) Date T3 reçue : …
- (à compléter) Phase 1 appliquée le … , commit … · Phase 2 (5×) le 30/09 : …
