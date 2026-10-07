// ============================================================
// ONGLET « ILV Bundle Matelas/Sommier » — module autonome
// ------------------------------------------------------------
// Une seule ILV pour un matelas + un sommier vendus séparément (2 EAN).
// - crédit automatique selon le TOTAL : 10× (IR, ou SF pendant la promo),
//   20×, 36×, 48× ; refus sous 400 € (cf. BUNDLE_LITERIE.md) ;
// - aucun service (variante « sans » imposée côté serveur).
// Ce fichier injecte lui-même son bouton et son contenu : la page principale
// n'est modifiée que par la balise <script> qui le charge. Il réutilise les
// globales existantes : products, CREDIT_TYPES, determineDefaultCredit,
// is10xsfActif, PROMO_10XSF, calculerCredit, formatMontant, escH, ilvQuery,
// ilvExtResp, ilvModeResp.
// ============================================================
(function () {
  'use strict';

  const BUNDLE_CREDITS = ['10x_ir', '10x_sf', '20x_ir', '36x_si', '48x_si'];
  const UNIVERS = 'LITERIE';
  const MAX_OPTIONS = 300;
  const sel = { mat: null, som: null };

  const famille = (p) => String(p.famille || '').trim().toUpperCase();
  const catalogue = (fam) =>
    (typeof products !== 'undefined' && Array.isArray(products) ? products : [])
      .filter(p => famille(p) === fam && Number(p.prix) > 0);

  // Même règle que l'outil général : stratégie par prix + substitution 10× SF
  function creditBundle(total) {
    let ck = determineDefaultCredit(total, UNIVERS);
    if (ck === '10x_ir' && is10xsfActif()) ck = '10x_sf';
    return BUNDLE_CREDITS.includes(ck) ? ck : null;
  }

  // ── Injection de l'onglet ──────────────────────────────────
  function inject() {
    const firstBtn = document.querySelector('.tab-btn');
    const anchor = document.getElementById('tab-depliant');
    if (!firstBtn || !anchor || document.getElementById('tab-bundle')) return;

    const btn = document.createElement('div');
    btn.className = 'tab-btn';
    btn.id = 'tab-btn-bundle';
    btn.innerHTML = '&#128719; ILV Bundle Matelas/Sommier';
    btn.addEventListener('click', show);
    firstBtn.parentElement.appendChild(btn);

    const pane = document.createElement('div');
    pane.className = 'tab-content';
    pane.id = 'tab-bundle';
    pane.innerHTML =
      '<p style="font-size:13px;color:#9aa3ab;line-height:1.6;margin:2px 0 14px;">' +
        'Une <b style="color:#ddd;">seule ILV pour un matelas + un sommier</b> vendus s&eacute;par&eacute;ment (2 EAN).<br>' +
        'Cr&eacute;dit automatique selon le <b style="color:#ddd;">total</b> : 10&times; <span style="color:#e67e22;">(10&times; Sans Frais quand actif)</span>, 20&times;, 36&times; ou 48&times;. ' +
        '<b style="color:#ddd;">Aucun service</b> (ni garantie, ni livraison). Bundle minimum : 400&nbsp;&euro;.' +
      '</p>' +
      '<div class="form-row">' + pickerHtml('mat', 'Matelas') + pickerHtml('som', 'Sommier') + '</div>' +
      '<div id="bdl-summary" style="background:#16213e;border-radius:8px;padding:12px 16px;margin:4px 0 12px;font-size:13px;color:#9aa3ab;">' +
        'S&eacute;lectionnez un matelas et un sommier.' +
      '</div>' +
      '<button class="btn btn-primary" id="bdl-btn" disabled style="background:#c0392b;">&#11015; G&eacute;n&eacute;rer l\'ILV bundle</button>' +
      '<div id="bdl-status" style="font-size:13px;margin-top:10px;min-height:18px;"></div>';
    anchor.parentNode.insertBefore(pane, anchor.nextSibling);

    ['mat', 'som'].forEach(k => {
      document.getElementById('bdl-q-' + k).addEventListener('input', () => fillList(k));
      document.getElementById('bdl-list-' + k).addEventListener('change', () => pick(k));
    });
    document.getElementById('bdl-btn').addEventListener('click', generate);

    // Revenir sur un onglet existant doit masquer celui-ci : on enveloppe
    // switchTab (appelée par les autres boutons) sans la modifier.
    const orig = window.switchTab;
    if (typeof orig === 'function') {
      window.switchTab = function () {
        pane.classList.remove('active');
        return orig.apply(this, arguments);
      };
    }
  }

  function pickerHtml(k, label) {
    return '<div>' +
      '<label>' + label + '</label>' +
      '<input type="text" id="bdl-q-' + k + '" placeholder="Rechercher par EAN ou nom&hellip;" autocomplete="off" style="margin-bottom:6px;">' +
      '<select id="bdl-list-' + k + '" size="8" style="width:100%;"></select>' +
      '<div id="bdl-info-' + k + '" style="font-size:12px;color:#9aa3ab;margin-top:6px;min-height:16px;"></div>' +
    '</div>';
  }

  function show() {
    const pane = document.getElementById('tab-bundle');
    const btn = document.getElementById('tab-btn-bundle');
    btn.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pane.parentElement.querySelectorAll(':scope > .tab-content').forEach(c => c.classList.remove('active'));
    pane.classList.add('active');
    fillList('mat');
    fillList('som');
  }

  // ── Listes de produits ─────────────────────────────────────
  function fillList(k) {
    const fam = k === 'mat' ? 'MATELAS' : 'SOMMIERS';
    const q = document.getElementById('bdl-q-' + k).value.trim().toLowerCase();
    const list = document.getElementById('bdl-list-' + k);
    const items = catalogue(fam)
      .filter(p => !q || String(p.ean || '').includes(q) || String(p.designation || '').toLowerCase().includes(q))
      .sort((a, b) => String(a.designation).localeCompare(String(b.designation)));
    const shown = items.slice(0, MAX_OPTIONS);
    list.innerHTML = shown.map((p, i) =>
      '<option value="' + i + '">' + escH(String(p.ean || '')) + ' — ' + escH(String(p.designation || '')) +
      ' — ' + formatMontant(Number(p.prix)) + '</option>').join('');
    list._items = shown;
    const info = document.getElementById('bdl-info-' + k);
    if (!catalogue(fam).length) {
      info.innerHTML = '<span style="color:#e67e22;">Aucun produit de la famille ' + fam + ' dans la base chargée.</span>';
    } else if (!sel[k]) {
      info.textContent = items.length > MAX_OPTIONS
        ? items.length + ' résultats (300 premiers affichés) — affinez la recherche'
        : items.length + ' résultat(s)';
    }
  }

  function pick(k) {
    const list = document.getElementById('bdl-list-' + k);
    const p = (list._items || [])[Number(list.value)];
    if (!p) return;
    sel[k] = p;
    document.getElementById('bdl-info-' + k).innerHTML =
      '<span style="color:#27ae60;">&#10003;</span> <b style="color:#ddd;">' + escH(String(p.designation)) + '</b>' +
      ' &middot; EAN ' + escH(String(p.ean || '—')) + ' &middot; ' + formatMontant(Number(p.prix));
    refreshSummary();
  }

  // ── Récapitulatif : total, crédit, mensualité ──────────────
  function refreshSummary() {
    const box = document.getElementById('bdl-summary');
    const btn = document.getElementById('bdl-btn');
    btn.disabled = true;
    if (!sel.mat || !sel.som) {
      box.innerHTML = 'Sélectionnez un matelas <b>et</b> un sommier.';
      return;
    }
    const total = Math.round((Number(sel.mat.prix) + Number(sel.som.prix)) * 100) / 100;
    const ck = creditBundle(total);
    const totalHtml = '<div style="font-size:11px;color:#8a9199;">Total du bundle</div>' +
      '<div style="font-size:20px;font-weight:700;color:#fff;">' + formatMontant(total) +
      ' <span style="font-size:12px;color:#9aa3ab;font-weight:400;">(' + formatMontant(Number(sel.mat.prix)) +
      ' + ' + formatMontant(Number(sel.som.prix)) + ')</span></div>';
    if (!ck) {
      box.innerHTML = totalHtml + '<div style="color:#e74c3c;margin-top:6px;">&#9888; Aucune durée de financement disponible ' +
        '(10×, 20×, 36×, 48×) : le bundle doit atteindre 400&nbsp;&euro;.</div>';
      return;
    }
    const ct = CREDIT_TYPES[ck];
    const calc = calculerCredit(ct.duree, ct.famille, total);
    const promo = ck === '10x_sf'
      ? ' <span style="font-size:11px;color:#e67e22;">⚠ valable du ' + PROMO_10XSF.labelCourt + '</span>' : '';
    box.innerHTML = totalHtml +
      '<div style="margin-top:6px;color:#ddd;">Crédit retenu : <b>' + escH(ct.label) + '</b>' + promo +
      ' &middot; ' + formatMontant(calc.mensualite) + ' × ' + ct.duree + ' mois</div>';
    btn.disabled = calc.mensualite < 16;
    if (btn.disabled) box.innerHTML += '<div style="color:#e74c3c;">Mensualité inférieure à 16 € : ILV impossible.</div>';
  }

  // ── Génération ─────────────────────────────────────────────
  async function generate() {
    const btn = document.getElementById('bdl-btn');
    const status = document.getElementById('bdl-status');
    if (!sel.mat || !sel.som) return;
    const total = Number(sel.mat.prix) + Number(sel.som.prix);
    const prod = (p) => ({ designation: p.designation, ean: p.ean || '', prix: Number(p.prix) });
    btn.disabled = true;
    status.innerHTML = '<span style="color:#9aa3ab;">Génération…</span>';
    try {
      const resp = await fetch('api/generate-ilv-bundle?' + ilvQuery(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matelas: prod(sel.mat), sommier: prod(sel.som), credit_key: creditBundle(total) || '' })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        status.innerHTML = '<span style="color:#e74c3c;">❌ ' + escH(err.error || resp.statusText) + '</span>';
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safe = (s) => String(s || 'produit').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
      a.href = url;
      a.download = 'ILV_bundle_' + safe(sel.mat.ean) + '_' + safe(sel.som.ean) + ilvExtResp(resp);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      status.innerHTML = '<span style="color:#27ae60;">✓ ILV bundle téléchargée (' + ilvModeResp(resp) + ')</span>';
    } catch (e) {
      status.innerHTML = '<span style="color:#e74c3c;">❌ ' + escH(e.message) + '</span>';
    } finally {
      refreshSummary();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
