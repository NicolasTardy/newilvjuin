# EN ATTENTE — Hausse des taux BNP (à appliquer à la date d'effet)

> STATUT : **Phase 1 (3× / 10×) APPLIQUÉE dans le code** (commit du 27/07/2026),
> **à déployer sur le VPS le 29/07/2026** (`git pull` + `restart`). Reste ensuite
> **Phase 2 (5×) au 01/10/2026**.
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

**PHASE 1 — effet 29/07/2026 : 3× et 10× — ✅ APPLIQUÉE (commit 27/07)**

| Constante | Avant | → Après | Fait |
|---|---|---|---|
| `TAUX_DEBITEUR_3XSF` | 12.20 | **12.76** | ✅ |
| `TAEG_FICTIF_3XSF`   | 12.91 | **13.61** | ✅ |
| `TAUX_DEBITEUR_10XSF`| 4.43  | **4.99**  | ✅ |
| `TAEG_FICTIF_10XSF`  | 4.52  | **5.12**  | ✅ |
| `DATE_CONDITIONS_3XSF` | 01/04/2026 | **29/07/2026** | ✅ |
| `DATE_CONDITIONS_10XSF`| 01/01/2026 | **29/07/2026** | ✅ |

**PHASE 2 — effet 01/10/2026 : le 5× SEULEMENT — ⏳ À FAIRE**

| Constante (ligne) | Actuel | → Nouveau |
|---|---|---|
| `TAUX_DEBITEUR_5X` (l.220) | 8.13 | **8.71** |
| `TAEG_FICTIF_5X`   (l.219) | 8.44 | **9.10** |
| `DATE_CONDITIONS` (l.302, si concerné) | 01/04/2026 | à décider |

⚠️ Le 5× **reste à sa valeur actuelle jusqu'au 30/09/2026 inclus** (RV 2,00 %) ;
il change **au 01/10/2026**. Ne PAS l'appliquer avant.

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

## C. DATES D'EFFET — confirmées (Mobilux_T3_2026, colonne « Date de mise en place »)

- **Phase 1 (3× / 10×) : 29/07/2026** — appliquée. `DATE_CONDITIONS_3XSF` et
  `DATE_CONDITIONS_10XSF` passées à 29/07/2026.
- **Phase 2 (5×) : 01/10/2026** — à faire ce jour-là.
- `DATE_CONDITIONS` (l.302 — offres payantes/IR + 5×) laissée à 01/04/2026 :
  ces offres ne changent pas au 29/07. À revoir au 01/10 pour le 5× si besoin.

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
- Dates reçues (Mobilux) : Phase 1 = 29/07/2026 · Phase 2 (5×) = 01/10/2026.
- Phase 1 (3×/10×) appliquée dans le code le 27/07/2026 → à déployer VPS le 29/07.
- (à compléter) Phase 2 (5×) au 01/10/2026 : 8.13→8.71 / 8.44→9.10.
