# EN ATTENTE — Hausse des taux BNP (à appliquer à la date d'effet)

> STATUT : **préparé, NON appliqué.** Périmètre figé = §A uniquement (sans frais).
> Seul élément encore manquant : **la date d'effet (§C)**. Dès qu'elle est connue,
> la mise à jour est turnkey.
> Procédure générale : voir `MAJ_TAUX_RUNBOOK.md`. Toute application passe par
> l'accord explicite de Nicolas (diff + vérifs avant commit).
>
> Source : mail BNP « nouvelles retenues vendeurs à mettre en place » (barème
> par tranche, version corrigée avec 5× surligné). Valeurs retenues = **DTS**
> (« la plus forte » entre DTS et VAT).

---

## A. SANS FRAIS — CONFIRMÉ, prêt à appliquer

Fichier : `generate_ilv_depliant.py`. Ces constantes ne changent QUE l'exemple
« coût du crédit » des mentions légales ; le TAEG affiché reste 0 %.

| Constante (ligne actuelle) | Valeur actuelle | → Nouvelle valeur |
|---|---|---|
| `TAUX_DEBITEUR_3XSF` (l.225) | 12.20 | **12.76** |
| `TAEG_FICTIF_3XSF`   (l.224) | 12.91 | **13.61** |
| `TAUX_DEBITEUR_5X`   (l.220) | 8.13  | **8.13**  *(inchangé)* |
| `TAEG_FICTIF_5X`     (l.219) | 8.44  | **8.47**  *(+0,03)* |
| `TAUX_DEBITEUR_10XSF`(l.231) | 4.43  | **4.99** |
| `TAEG_FICTIF_10XSF`  (l.230) | 4.52  | **5.12** |

Notes :
- Le **3×** est masqué dans l'outil (hors STRATEGIE + case filtrée) mais on met
  quand même sa constante à jour pour cohérence.
- Le **5×** ne bouge quasiment pas (TNC identique ; TAEG +0,03 en prenant le DTS).
- Le **10×** est identique sur les 3 tranches → la constante unique suffit.
- Pas de miroir frontend pour ces constantes (elles n'existent que côté backend ;
  le TAEG affiché 0 % du front n'est pas concerné).
- Après édition, mettre à jour le commentaire de date sur les lignes 219-220
  (« # Mis à jour JJ/MM/AAAA »).

## B. TAUX CLIENT (offres payantes / IR) — RÉSOLU : AUCUNE MODIFICATION

Confirmé par Nicolas (retour d'Aurélien) : **les taux client ne changent pas.**
La hausse ne concerne QUE le barème « gratuit » (coût absorbé par BUT).

Conséquences — NE PAS toucher :
- tables `TAEG` et `TAUX_DEBITEUR` (10× IR 18,63 %, 20× IR 17,40 %,
  36/48/60× 15,05 %) → inchangées ;
- fourchettes figées des intros de `generer_ml_text()`
  (« compris entre 8,60 % et 18,63 % » etc.) → inchangées (pas de §D-bis ici).

→ La hausse se limite donc STRICTEMENT aux 6 constantes du §A.

## C. DATE D'EFFET — À RENSEIGNER

- Inconnue à ce jour. À la réception :
  - `DATE_CONDITIONS` (l.302) → « JJ/MM/AAAA » de la nouvelle grille.
  - Vérifier si `DATE_CONDITIONS_3XSF` / `DATE_CONDITIONS_10XSF` sont aussi
    concernées.

---

## Procédure d'application (le jour J)

```bash
cd /home/ubuntu/ilvcredit-vector-v2   # (ou le dépôt local)
git pull
```
1. Éditer les 6 constantes du §A + `DATE_CONDITIONS` (§C). Ne PAS toucher au §B.
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
- Sort des taux client (§B) : **inchangés** (confirmé Aurélien) → seul le §A s'applique.
- (à compléter) Date d'effet reçue : …
- (à compléter) Appliqué le … , commit … , vérifié …
