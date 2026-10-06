# Bundle literie — ILV matelas + sommier (à développer)

> Préparé le 06/10/2026. Décisions validées par Nicolas, prêtes à implémenter.
> Rien n'est encore codé : ce document est le cahier des charges.

## Objectif

Pouvoir générer **une seule ILV pour deux produits** : un matelas et un sommier, vendus séparément (deux EAN), financés ensemble.

**Contrainte de périmètre :** on ajoute un **onglet dédié**. Les onglets existants (Sélection EAN, Saisie manuelle, Scan, Impression en série, Impression dépliant) ne changent pas.

## Décisions validées

| # | Question | Décision |
|---|---|---|
| 1 | Bundle sous 400 € | **Refus avec message.** Pas de bascule en 5×. |
| 2 | 10× : IR ou sans frais ? | **Même règle que l'outil général** : 10× IR, remplacé par le 10× SF pendant la promo (`is10xsfActif()`). |
| 3 | Choix du crédit | **Automatique selon le prix total uniquement.** Pas de choix manuel. |
| 4 | Les 28 « ENSEMBLE MATELAS ET SOMMIER » (un seul EAN) | Restent dans les onglets classiques. Le bundle ne concerne que les produits vendus séparément. |
| 5 | Exemple chiffré des mentions sur le total | Pas de validation Cetelem nécessaire. |

## Règles fonctionnelles

### Produits éligibles

- **Produit 1** : famille `MATELAS` (champ `famille` de la base, rayon `LITERIE`)
- **Produit 2** : famille `SOMMIERS`
- Exclus : famille `ENSEMBLE MATELAS ET SOMMIER` (décision 4)
- Exactement **un matelas + un sommier**, deux EAN distincts.

Base actuelle (prod) : 542 matelas (50 € → 3 600 €, médiane 570 €), 642 sommiers (13 € → 1 830 €, médiane 570 €). Un bundle typique tourne autour de 1 100 € → 20×.

### Crédit (automatique, selon le total)

Total = prix matelas + prix sommier. Le crédit est celui de la stratégie générale (`STRATEGIE_ILV`, univers `LITERIE`) :

| Total du bundle | Crédit |
|---|---|
| < 400 € | **Refus** : « Bundle inférieur à 400 € : aucune durée de financement disponible (10×, 20×, 36×, 48×). » |
| 400 € → 900 € | 10× Intérêts Remboursés (→ **10× Sans Frais** pendant la promo) |
| 900 € → 1 500 € | 20× Intérêts Remboursés |
| 1 500 € → 4 000 € | 36× Services Inclus |
| > 4 000 € | 48× Services Inclus |

⚠️ **Piège des bornes :** dans `STRATEGIE_ILV`, 400 € appartient aux deux tranches (5× : 80-400, 10× : 400-900) et `determine_credit` prend la première, donc **400 € → 5×**. Ne pas coder « refus si total < 400 » tout seul. Règle robuste :

> crédit = stratégie générale (avec substitution 10× SF) ; **si le crédit obtenu n'est pas dans {10x_ir, 10x_sf, 20x_ir, 36x_si, 48x_si} → refus.**

Ça couvre aussi le cas exact de 400 €, et tout futur changement de la stratégie.

La règle légale de la mensualité minimale (16 €) continue de s'appliquer, elle est déjà gérée côté serveur.

### Services

- **Aucun service** : ni garantie, ni livraison, ni montage. Pas de cases dans l'onglet.
- Variante **« sans »** imposée **côté serveur** (pas seulement dans l'interface), comme pour le 5×.

### Ce que montre l'ILV

Même masque A3 que les ILV classiques (variante « sans »), avec :

- **Bulle de désignation sur deux lignes**, une par produit :
  `MATELAS DUNLOPILLO HOTEL 140X190`
  `SOMMIER TAPISSIER 140X190`
- **Ligne EAN** : `EAN : 3760123456781 + 3760123456798`
- **Ligne prix détaillée** : `689,00 € + 449,00 € = 1 138,00 €`
- Mensualité, TAEG, montant total dû, badge intérêts remboursés et mentions légales : **calculés sur le total**, comme une ILV normale.

À vérifier visuellement : le bandeau imprimé « Demandez nos services complémentaires » reste sur le masque. Il reste cohérent (services vendus à part), mais à regarder sur le rendu final.

## Plan technique

### 1. Backend — `generate_ilv_depliant.py`

`generate_a3_pdf()` dessine aujourd'hui une seule ligne de désignation, un EAN et un prix. Ajouter des paramètres **optionnels** (valeurs par défaut = comportement actuel inchangé) :

- `designation2` : si présent, la bulle est découpée en deux lignes (chaque ligne auto-ajustée dans sa moitié de la zone `designation`, 90,264 → 487,306) ;
- `prix_detail` : texte libre qui remplace la ligne prix (`fmt_ml(p1) € + fmt_ml(p2) € = fmt_ml(total) €`).

⚠️ La fonction est enrobée dans un `try/finally` (fermeture du PDF, cf. incident fds du 09/09). Garder ce bloc intact et ajouter le code **à l'intérieur** du `try`.

### 2. Backend — `serve_local.py`

Nouvel endpoint **`POST /api/generate-ilv-bundle`** (ou extension de `_generate_one`), qui reçoit :

```json
{
  "matelas": {"ean": "...", "designation": "...", "prix": 689.0},
  "sommier": {"ean": "...", "designation": "...", "prix": 449.0}
}
```

Il doit :
1. vérifier les deux produits (désignation, prix > 0) ;
2. calculer le total et le crédit (stratégie + substitution 10× SF, cf. règle robuste ci-dessus) → `ValueError` si non éligible (**renvoyée en 400**, comme le reste) ;
3. forcer la variante `"sans"`, garantie et livraison à 0 ;
4. appeler `generate_a3_pdf` avec `designation2` et `prix_detail` ;
5. appliquer `fmt` (A5 par défaut) et `merge`, comme `/api/generate-ilv`.

⚠️ La substitution 10× IR → 10× SF est aujourd'hui faite **côté frontend** (`is10xsfActif()`). Pour l'appliquer aussi côté serveur, soit le frontend envoie le `credit_key` final, soit on reproduit la fenêtre de dates côté backend. **Recommandation : le frontend envoie le `credit_key` calculé, le serveur revérifie qu'il est dans la liste autorisée.**

### 3. Frontend — `webapp-ilv.html`

Nouvel onglet **« Bundle literie »**, à côté des onglets existants :

- deux sélecteurs avec recherche (EAN ou nom) : un filtré sur `famille = MATELAS`, un sur `famille = SOMMIERS` ;
- affichage du **total** et du **crédit retenu** (avec le libellé promo du 10× SF quand elle est active) ;
- message de refus visible si le total est sous le seuil ;
- bouton « Générer l'ILV », qui utilise les réglages **Format / Sortie** de la barre d'impression (`ilvQuery()`, extension selon le type renvoyé : `ilvExtResp(resp)`).

Pas d'ajout au panier : le bundle se génère directement depuis son onglet.

### 4. Tutoriel — `tuto.html`

Ajouter une courte section « Bundle literie » : à quoi ça sert, éligibilité (un matelas + un sommier vendus séparément), crédit automatique selon le total, pas de services, refus sous 400 €.

## Tests à faire avant déploiement

- [ ] Total 650 € → 10× (vérifier 10× SF si la promo est active, 10× IR sinon)
- [ ] Total 1 138 € → 20×, badge intérêts remboursés correct
- [ ] Total 2 500 € → 36×
- [ ] Total 4 500 € → 48×
- [ ] Total 350 € → refus avec message (400)
- [ ] Total **exactement 400 €** → refus (piège des bornes)
- [ ] Requête bundle avec garantie ou livraison forcée → ignorées, variante « sans »
- [ ] Rendu A3 et A5 : désignation sur deux lignes lisible, ligne prix détaillée qui tient, rien ne chevauche la mensualité
- [ ] Désignations longues (40+ caractères) : l'ajustement automatique reste lisible
- [ ] Les onglets existants génèrent toujours comme avant (non-régression)
- [ ] Syntaxe : `python3 -c "import ast; ..."` + `node --check` sur les scripts extraits

## Déploiement

```bash
ssh vps 'cd /home/ubuntu/ilvcredit-vector-v2 && git pull && sudo -n systemctl restart ilvcredit-vector-v2'
```

Puis contrôle : service actif, page en 200, un bundle généré en 200 depuis le VPS (`curl` sur le nouvel endpoint).

## Repères

- Projet : `/Users/nicolas/dossiers chantiers pro/VECTORILV copie` (remote `newilvjuin`)
- Prod : `https://ilvcredit.triangleoffensif.fr/vector/` — VPS 92.222.80.99 (alias SSH `vps`), service `ilvcredit-vector-v2`, port 3023
- Un prototype a été rendu le 06/10 **sans modifier le projet** (matelas 689 € + sommier 449 € = 1 138 € → 20×, mensualité 65,28 €) : tout tenait sur le masque, seule la désignation sur une ligne était trop petite. D'où les deux lignes et la ligne prix détaillée ci-dessus.

## Effort estimé

| Tâche | Durée |
|---|---|
| Onglet + sélecteurs + appel génération | ½ journée |
| Désignation deux lignes + prix détaillé (backend) | 1 à 2 h |
| Endpoint bundle + garde-fous serveur | 1 h |
| Tests + tuto + déploiement | 1 h 30 |
