"""ILV Bundle Matelas/Sommier — module autonome (onglet dédié).

Une seule ILV pour deux produits vendus séparément : un matelas + un sommier.
Règles (cf. BUNDLE_LITERIE.md) :
  - crédit automatique selon le TOTAL, via la stratégie générale (univers LITERIE) ;
  - seuls 10× (IR, ou SF pendant la promo), 20×, 36× et 48× sont autorisés :
    tout autre résultat (5×, aucun crédit) est refusé ;
  - aucun service : variante « sans » imposée ici, côté serveur.

Le module ne modifie rien du générateur : il appelle generate_a3_pdf() tel quel
(désignation vide, ligne prix masquée), puis surimprime la désignation sur deux
lignes et la ligne prix détaillée avec les helpers de rendu existants.
Branché sur l'app Flask par register() depuis serve_local.py.
"""
import io
import re
import tempfile
from pathlib import Path

import fitz
from flask import jsonify, request, send_file

BUNDLE_CREDITS = ("10x_ir", "10x_sf", "20x_ir", "36x_si", "48x_si")
UNIVERS_ILV = "LITERIE"
VARIANT = "sans"

# Mise en page propre au bundle (coordonnées PDF du masque A3)
PASTILLE_TXT = "MATELAS + SOMMIER"
PASTILLE_SIZE = 19
PASTILLE_X, PASTILLE_Y, PASTILLE_H = 92, 226, 28   # au-dessus de la bulle (y 264)
PRIX_X_MAX = 410                                    # ligne prix élargie (zone d'origine : 360)


def _produit(data, libelle):
    data = data or {}
    designation = str(data.get("designation", "")).strip()
    ean = str(data.get("ean", "")).strip()
    try:
        prix = float(data.get("prix") or 0)
    except (TypeError, ValueError):
        prix = 0.0
    if not designation or prix <= 0:
        raise ValueError(f"{libelle} : désignation et prix requis")
    return designation, ean, prix


def choisir_credit(gen, total, credit_demande=""):
    """Crédit du bundle, décidé par le prix total uniquement.

    La fenêtre promo du 10× Sans Frais est connue de l'interface
    (is10xsfActif) : on accepte donc « 10x_sf » uniquement à la place du
    10× IR que donne la stratégie, jamais pour une autre tranche.
    """
    credit = gen.determine_credit(total, UNIVERS_ILV)
    if credit == "10x_ir" and credit_demande == "10x_sf":
        credit = "10x_sf"
    if credit not in BUNDLE_CREDITS:
        raise ValueError(
            f"Bundle de {gen.fmt_ml(total)} € : aucune durée de financement "
            "disponible (10×, 20×, 36×, 48×). Le bundle doit atteindre 400 €."
        )
    return credit


def build_bundle_pdf(gen, payload):
    """Construit l'ILV A3 du bundle. Retourne (nom_fichier, octets_pdf)."""
    d1, e1, p1 = _produit(payload.get("matelas"), "Matelas")
    d2, e2, p2 = _produit(payload.get("sommier"), "Sommier")
    total = round(p1 + p2, 2)

    credit = choisir_credit(gen, total, str(payload.get("credit_key") or ""))
    ct = gen.CREDIT_TYPES[credit]
    duree, famille = ct["duree"], ct["famille"]
    slug = gen.CREDITKEY_TO_SLUG[credit]

    calc = gen.calculer_credit(duree, famille, total)
    if calc["mensualite"] < 16:
        raise ValueError(f"Mensualité {calc['mensualite']:.2f} € < 16 € minimum légal")

    tpl_file = gen.A3_TEMPLATE_FILES.get(slug)
    if not tpl_file:
        raise ValueError(f"Pas de template A3 pour le crédit {credit}")
    tpl = gen.A3_TEMPLATES_DIR / (tpl_file + gen.A3_VARIANT_TO_SUFFIX[VARIANT] + ".pdf")
    if not tpl.exists():
        raise ValueError(f"Fichier template introuvable : {tpl.name}")

    ean_txt = " + ".join(e for e in (e1, e2) if e)
    prix_detail = (f"Matelas {gen.fmt_ml(p1)} € + Sommier {gen.fmt_ml(p2)} € "
                   f"= {gen.fmt_ml(total)} €")

    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "bundle.pdf"
        # 1) Rendu standard, sans service : désignation vide et prix=0 pour que
        #    ces deux zones restent libres (surimprimées juste après).
        gen.generate_a3_pdf(slug, VARIANT, "", calc, total, 0, 0, duree, famille,
                            tpl, out, ean=ean_txt, prix=0)
        # 2) Désignation sur deux lignes (une par produit) + prix détaillé.
        doc = fitz.open(str(out))
        try:
            page = doc[0]
            font = gen._a3_font()
            x0, y0, x1, y1 = gen._A3_ZONES["designation"]
            mid = (y0 + y1) / 2
            for texte, zone in ((d1, (x0, y0, x1, mid)), (d2, (x0, mid, x1, y1))):
                gen._draw_fitted(page, font, texte, zone, gen._COL_DARK,
                                 max_size=20, align="center", fill_h=0.95)
            # Ligne prix étiquetée : zone élargie vers la droite (libre jusqu'au
            # grand « € » de la mensualité) car le texte est plus long.
            px0, py0, _, py1 = gen._A3_ZONES["prix_produit"]
            gen._draw_fitted(page, font, prix_detail, (px0, py0, PRIX_X_MAX, py1),
                             gen._COL_WHITE, max_size=17, align="left")
            # Pastille « MATELAS + SOMMIER » dans la bande rouge libre entre le
            # titre du masque et la bulle (vérifié sur les 5 masques autorisés).
            tw = font.text_length(PASTILLE_TXT, PASTILLE_SIZE)
            pill = fitz.Rect(PASTILLE_X, PASTILLE_Y, PASTILLE_X + tw + 28, PASTILLE_Y + PASTILLE_H)
            page.draw_rect(pill, color=None, fill=gen._COL_WHITE, radius=0.5)
            gen._draw_fitted(page, font, PASTILLE_TXT, (pill.x0, pill.y0, pill.x1, pill.y1),
                             gen._COL_RED, max_size=PASTILLE_SIZE, align="center", fill_h=0.95)
            data = doc.tobytes(garbage=3, deflate=True)
        finally:
            doc.close()

    def _safe(s):
        return re.sub(r"[^A-Za-z0-9]", "_", s or "sans-ean")

    fname = f"LITERIE_BUNDLE_{_safe(e1)}_{_safe(e2)}_{credit}_a3_sans.pdf"
    return fname, data


def register(app, gen, rescale_pdf):
    """Ajoute l'endpoint POST /api/generate-ilv-bundle à l'app Flask."""

    @app.post("/api/generate-ilv-bundle")
    def generate_ilv_bundle():
        if gen is None:
            return jsonify(error="Module de génération non disponible"), 503
        payload = request.get_json(silent=True) or {}
        try:
            fname, data = build_bundle_pdf(gen, payload)
        except ValueError as e:
            return jsonify(error=str(e)), 400
        except Exception as e:
            return jsonify(error=f"Erreur génération : {e}"), 500
        fmt = (request.args.get("fmt") or "A3").upper()
        data = rescale_pdf(data, fmt)
        return send_file(io.BytesIO(data), mimetype="application/pdf",
                         as_attachment=True, download_name=fname)
