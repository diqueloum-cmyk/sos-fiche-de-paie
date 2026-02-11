/**
 * reference-data.js — Donnees de reference pour l'analyse de bulletins de paie
 * Port de paie_detect_v6/seed.py + database.py en JavaScript
 */

// ──────────────────────────────────────────────────
// DONNEES DE REFERENCE STATIQUES
// ──────────────────────────────────────────────────

const SMIC = [
  { date_debut: "2026-01-01", date_fin: null, horaire_brut: 12.02, mensuel_brut_35h: 1823.03, annuel_brut_35h: 21876.36, decret: "Decret 2025-1228 du 17/12/2025" },
  { date_debut: "2024-11-01", date_fin: "2025-12-31", horaire_brut: 11.88, mensuel_brut_35h: 1801.80, annuel_brut_35h: 21621.60, decret: "Decret 2024-951 du 23/10/2024" },
  { date_debut: "2024-01-01", date_fin: "2024-10-31", horaire_brut: 11.65, mensuel_brut_35h: 1766.92, annuel_brut_35h: 21203.04, decret: "Decret 2023-1216 du 20/12/2023" },
  { date_debut: "2023-05-01", date_fin: "2023-12-31", horaire_brut: 11.52, mensuel_brut_35h: 1747.20, annuel_brut_35h: 20966.40, decret: null },
  { date_debut: "2023-01-01", date_fin: "2023-04-30", horaire_brut: 11.27, mensuel_brut_35h: 1709.28, annuel_brut_35h: 20511.36, decret: null },
  { date_debut: "2022-08-01", date_fin: "2022-12-31", horaire_brut: 11.07, mensuel_brut_35h: 1678.95, annuel_brut_35h: 20147.40, decret: null },
  { date_debut: "2022-05-01", date_fin: "2022-07-31", horaire_brut: 10.85, mensuel_brut_35h: 1645.58, annuel_brut_35h: 19746.96, decret: null },
  { date_debut: "2022-01-01", date_fin: "2022-04-30", horaire_brut: 10.57, mensuel_brut_35h: 1603.12, annuel_brut_35h: 19237.44, decret: null },
];

const PLAFOND_SS = [
  { annee: 2026, mensuel: 4005, annuel: 48060, journalier: 220, horaire: 29 },
  { annee: 2025, mensuel: 3925, annuel: 47100, journalier: 216, horaire: 29 },
  { annee: 2024, mensuel: 3864, annuel: 46368, journalier: 213, horaire: 29 },
  { annee: 2023, mensuel: 3666, annuel: 43992, journalier: 202, horaire: 27 },
  { annee: 2022, mensuel: 3428, annuel: 41136, journalier: 189, horaire: 26 },
];

// Cotisations stables (memes taux toutes les annees sauf vieillesse deplafonnee employeur)
function getCotisationsForYear(annee) {
  let ve; // taux employeur vieillesse deplafonnee
  if (annee <= 2023) ve = 1.60;
  else if (annee <= 2025) ve = 2.02;
  else ve = 2.11;

  const dd = `${annee}-01-01`;
  const df = `${annee}-12-31`;

  const stable = [
    { code: "MALADIE_REDUIT", libelle: "Maladie maternite (taux reduit)", base: "totalite", taux_salarie: 0, taux_employeur: 7.00, conditions: "Remuneration <= 2.5 SMIC" },
    { code: "MALADIE_PLEIN", libelle: "Maladie maternite (taux plein)", base: "totalite", taux_salarie: 0, taux_employeur: 13.00, conditions: "Remuneration > 2.5 SMIC" },
    { code: "VIEILLESSE_DEPL", libelle: "Vieillesse deplafonnee", base: "totalite", taux_salarie: 0.40, taux_employeur: ve, conditions: null },
    { code: "VIEILLESSE_PLAF", libelle: "Vieillesse plafonnee", base: "tranche 1 (PMSS)", taux_salarie: 6.90, taux_employeur: 8.55, conditions: null },
    { code: "AF_REDUIT", libelle: "Allocations familiales (taux reduit)", base: "totalite", taux_salarie: 0, taux_employeur: 3.45, conditions: "Remuneration <= 3.5 SMIC" },
    { code: "AF_PLEIN", libelle: "Allocations familiales (taux plein)", base: "totalite", taux_salarie: 0, taux_employeur: 5.25, conditions: "Remuneration > 3.5 SMIC" },
    { code: "CSA", libelle: "Contribution solidarite autonomie", base: "totalite", taux_salarie: 0, taux_employeur: 0.30, conditions: null },
    { code: "FNAL_PETIT", libelle: "FNAL (< 50 salaries)", base: "tranche 1 (PMSS)", taux_salarie: 0, taux_employeur: 0.10, conditions: "Entreprise < 50 salaries" },
    { code: "FNAL_GRAND", libelle: "FNAL (>= 50 salaries)", base: "totalite", taux_salarie: 0, taux_employeur: 0.50, conditions: "Entreprise >= 50 salaries" },
    { code: "CSG_DED", libelle: "CSG deductible", base: "98.25% du brut", taux_salarie: 6.80, taux_employeur: 0, conditions: "Abattement 1.75% sur brut" },
    { code: "CSG_NDED", libelle: "CSG non deductible", base: "98.25% du brut", taux_salarie: 2.40, taux_employeur: 0, conditions: null },
    { code: "CRDS", libelle: "CRDS", base: "98.25% du brut", taux_salarie: 0.50, taux_employeur: 0, conditions: null },
    { code: "RC_T1", libelle: "Retraite complementaire T1", base: "tranche 1 (PMSS)", taux_salarie: 3.15, taux_employeur: 4.72, conditions: null },
    { code: "RC_T2", libelle: "Retraite complementaire T2", base: "tranche 2 (1-8 PMSS)", taux_salarie: 8.64, taux_employeur: 12.95, conditions: null },
    { code: "CEG_T1", libelle: "CEG tranche 1", base: "tranche 1 (PMSS)", taux_salarie: 0.86, taux_employeur: 1.29, conditions: null },
    { code: "CEG_T2", libelle: "CEG tranche 2", base: "tranche 2 (1-8 PMSS)", taux_salarie: 1.08, taux_employeur: 1.62, conditions: null },
    { code: "CET", libelle: "Contribution equilibre technique", base: "totalite (des 1er euro)", taux_salarie: 0.14, taux_employeur: 0.21, conditions: "Remuneration > 1 PMSS" },
  ];

  // Chomage et AGS (varient par annee)
  const chomage = [];
  if (annee === 2022) {
    chomage.push({ code: "CHOMAGE", libelle: "Assurance chomage", base: "tranche A (4 PMSS)", taux_salarie: 0, taux_employeur: 4.05, conditions: null });
    chomage.push({ code: "AGS", libelle: "AGS", base: "tranche A (4 PMSS)", taux_salarie: 0, taux_employeur: 0.15, conditions: null });
  } else if (annee === 2023) {
    chomage.push({ code: "CHOMAGE", libelle: "Assurance chomage", base: "tranche A (4 PMSS)", taux_salarie: 0, taux_employeur: 4.05, conditions: null });
    chomage.push({ code: "AGS", libelle: "AGS", base: "tranche A (4 PMSS)", taux_salarie: 0, taux_employeur: 0.15, conditions: null });
  } else if (annee === 2024) {
    chomage.push({ code: "CHOMAGE", libelle: "Assurance chomage", base: "tranche A (4 PMSS)", taux_salarie: 0, taux_employeur: 4.05, conditions: null });
    chomage.push({ code: "AGS", libelle: "AGS", base: "tranche A (4 PMSS)", taux_salarie: 0, taux_employeur: 0.20, conditions: null });
  } else if (annee === 2025) {
    chomage.push({ code: "CHOMAGE", libelle: "Assurance chomage (avant mai 2025)", base: "tranche A (4 PMSS)", taux_salarie: 0, taux_employeur: 4.05, conditions: "Avant 1er mai 2025", date_debut: `${annee}-01-01`, date_fin: `${annee}-04-30` });
    chomage.push({ code: "CHOMAGE", libelle: "Assurance chomage (apres mai 2025)", base: "tranche A (4 PMSS)", taux_salarie: 0, taux_employeur: 4.00, conditions: "Apres 1er mai 2025", date_debut: `${annee}-05-01`, date_fin: `${annee}-12-31` });
    chomage.push({ code: "AGS", libelle: "AGS", base: "tranche A (4 PMSS)", taux_salarie: 0, taux_employeur: 0.25, conditions: null });
  } else {
    chomage.push({ code: "CHOMAGE", libelle: "Assurance chomage", base: "tranche A (4 PMSS)", taux_salarie: 0, taux_employeur: 4.05, conditions: null });
    chomage.push({ code: "AGS", libelle: "AGS", base: "tranche A (4 PMSS)", taux_salarie: 0, taux_employeur: 0.25, conditions: null });
  }

  return [...stable, ...chomage].map(c => ({ ...c, annee, date_debut: c.date_debut || dd, date_fin: c.date_fin || df }));
}

// Grilles SYNTEC cadres
const CCN_GRILLES = [
  // 2025+
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "1.1", coefficient: 95, minimum_brut_mensuel: 2135, date_debut: "2025-01-01", date_fin: null, accord_source: "Accord du 26 juin 2024" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "1.2", coefficient: 100, minimum_brut_mensuel: 2240, date_debut: "2025-01-01", date_fin: null, accord_source: "Accord du 26 juin 2024" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "2.1", coefficient: 105, minimum_brut_mensuel: 2315, date_debut: "2025-01-01", date_fin: null, accord_source: "Accord du 26 juin 2024" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "2.1", coefficient: 115, minimum_brut_mensuel: 2530, date_debut: "2025-01-01", date_fin: null, accord_source: "Accord du 26 juin 2024" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "2.2", coefficient: 130, minimum_brut_mensuel: 2850, date_debut: "2025-01-01", date_fin: null, accord_source: "Accord du 26 juin 2024" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "2.3", coefficient: 150, minimum_brut_mensuel: 3275, date_debut: "2025-01-01", date_fin: null, accord_source: "Accord du 26 juin 2024" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "3.1", coefficient: 170, minimum_brut_mensuel: 3650, date_debut: "2025-01-01", date_fin: null, accord_source: "Accord du 26 juin 2024" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "3.2", coefficient: 210, minimum_brut_mensuel: 4495, date_debut: "2025-01-01", date_fin: null, accord_source: "Accord du 26 juin 2024" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "3.3", coefficient: 270, minimum_brut_mensuel: 5755, date_debut: "2025-01-01", date_fin: null, accord_source: "Accord du 26 juin 2024" },
  // 2023-2024
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "1.1", coefficient: 95, minimum_brut_mensuel: 2035, date_debut: "2023-01-01", date_fin: "2024-12-31", accord_source: "Avenant 47 du 31 mars 2022" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "1.2", coefficient: 100, minimum_brut_mensuel: 2140, date_debut: "2023-01-01", date_fin: "2024-12-31", accord_source: "Avenant 47 du 31 mars 2022" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "2.1", coefficient: 105, minimum_brut_mensuel: 2240, date_debut: "2023-01-01", date_fin: "2024-12-31", accord_source: "Avenant 47 du 31 mars 2022" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "2.1", coefficient: 115, minimum_brut_mensuel: 2455, date_debut: "2023-01-01", date_fin: "2024-12-31", accord_source: "Avenant 47 du 31 mars 2022" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "2.2", coefficient: 130, minimum_brut_mensuel: 2775, date_debut: "2023-01-01", date_fin: "2024-12-31", accord_source: "Avenant 47 du 31 mars 2022" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "2.3", coefficient: 150, minimum_brut_mensuel: 3200, date_debut: "2023-01-01", date_fin: "2024-12-31", accord_source: "Avenant 47 du 31 mars 2022" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "3.1", coefficient: 170, minimum_brut_mensuel: 3575, date_debut: "2023-01-01", date_fin: "2024-12-31", accord_source: "Avenant 47 du 31 mars 2022" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "3.2", coefficient: 210, minimum_brut_mensuel: 4420, date_debut: "2023-01-01", date_fin: "2024-12-31", accord_source: "Avenant 47 du 31 mars 2022" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "3.3", coefficient: 270, minimum_brut_mensuel: 5680, date_debut: "2023-01-01", date_fin: "2024-12-31", accord_source: "Avenant 47 du 31 mars 2022" },
  // 2022
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "1.1", coefficient: 95, minimum_brut_mensuel: 1900, date_debut: "2022-01-01", date_fin: "2022-12-31", accord_source: "Avenant 46" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "1.2", coefficient: 100, minimum_brut_mensuel: 2000, date_debut: "2022-01-01", date_fin: "2022-12-31", accord_source: "Avenant 46" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "2.1", coefficient: 105, minimum_brut_mensuel: 2100, date_debut: "2022-01-01", date_fin: "2022-12-31", accord_source: "Avenant 46" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "2.1", coefficient: 115, minimum_brut_mensuel: 2300, date_debut: "2022-01-01", date_fin: "2022-12-31", accord_source: "Avenant 46" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "2.2", coefficient: 130, minimum_brut_mensuel: 2600, date_debut: "2022-01-01", date_fin: "2022-12-31", accord_source: "Avenant 46" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "2.3", coefficient: 150, minimum_brut_mensuel: 3000, date_debut: "2022-01-01", date_fin: "2022-12-31", accord_source: "Avenant 46" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "3.1", coefficient: 170, minimum_brut_mensuel: 3400, date_debut: "2022-01-01", date_fin: "2022-12-31", accord_source: "Avenant 46" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "3.2", coefficient: 210, minimum_brut_mensuel: 4200, date_debut: "2022-01-01", date_fin: "2022-12-31", accord_source: "Avenant 46" },
  { idcc: 1486, nom_ccn: "SYNTEC (BETIC)", categorie: "cadres", position: "3.3", coefficient: 270, minimum_brut_mensuel: 5400, date_debut: "2022-01-01", date_fin: "2022-12-31", accord_source: "Avenant 46" },
];

const TRANSPORT = [
  { type: "navigo", date_debut: "2025-01-01", date_fin: null, montant_mensuel: 88.80, remboursement_pct: 50, remboursement_montant: 44.40 },
  { type: "navigo", date_debut: "2024-01-01", date_fin: "2024-12-31", montant_mensuel: 86.40, remboursement_pct: 50, remboursement_montant: 43.20 },
  { type: "navigo", date_debut: "2023-01-01", date_fin: "2023-12-31", montant_mensuel: 84.10, remboursement_pct: 50, remboursement_montant: 42.05 },
  { type: "navigo", date_debut: "2022-01-01", date_fin: "2022-12-31", montant_mensuel: 75.20, remboursement_pct: 50, remboursement_montant: 37.60 },
];

const HEURES_SUP = [
  { rang: "36e a 43e heure (8 premieres HS)", heures_hebdo_min: 36, heures_hebdo_max: 43, majoration_pct: 25, reference_legale: "Art. L3121-36 Code du travail" },
  { rang: "A partir de la 44e heure", heures_hebdo_min: 44, heures_hebdo_max: null, majoration_pct: 50, reference_legale: "Art. L3121-36 Code du travail" },
];

const REGLES_CONTROLE = [
  { code: "ARITH_01", categorie: "arithmetique", nom: "Salaire de base", regle: "salaire_base == heures x taux_horaire", severite: "C1" },
  { code: "ARITH_02", categorie: "arithmetique", nom: "Heures supplementaires", regle: "montant_HS == nb_HS x taux x (1 + majoration/100)", severite: "C1" },
  { code: "ARITH_03", categorie: "arithmetique", nom: "Brut total", regle: "brut == base + HS + primes + avantages", severite: "C1" },
  { code: "ARITH_04", categorie: "arithmetique", nom: "Cotisations", regle: "montant_cotis == assiette x taux", severite: "C2" },
  { code: "ARITH_05", categorie: "arithmetique", nom: "Net a payer", regle: "net == brut - cotisations_salariales + remboursements", severite: "C2" },
  { code: "LEGAL_01", categorie: "legal", nom: "SMIC", regle: "taux_horaire >= smic_horaire", severite: "C1" },
  { code: "LEGAL_02", categorie: "legal", nom: "Majoration HS", regle: "majoration >= 25% (8 premieres) ou 50% (suivantes)", severite: "C1" },
  { code: "LEGAL_03", categorie: "legal", nom: "Transport 50%", regle: "remboursement >= 50% x abonnement", severite: "C1" },
  { code: "LEGAL_04", categorie: "legal", nom: "Assiette CSG/CRDS", regle: "assiette == 98.25% du brut", severite: "C2" },
  { code: "LEGAL_05", categorie: "legal", nom: "Taux CSG/CRDS total", regle: "CSG 9.20% + CRDS 0.50% = 9.70%", severite: "C2" },
  { code: "CCN_01", categorie: "conventionnel", nom: "Minimum conventionnel", regle: "brut >= minimum_grille[position][coefficient]", severite: "C1" },
  { code: "CCN_02", categorie: "conventionnel", nom: "Classification sur bulletin", regle: "position et coefficient sur le bulletin", severite: "C3" },
  { code: "CCN_03", categorie: "conventionnel", nom: "Prime de vacances", regle: "10% masse CP (verif collective)", severite: "C4" },
  { code: "CCN_04", categorie: "conventionnel", nom: "Modalite 2 SYNTEC", regle: "salaire >= 115% minimum conventionnel", severite: "C1" },
  { code: "CCN_05", categorie: "conventionnel", nom: "Modalite 3 SYNTEC", regle: "salaire >= 120% minimum conventionnel", severite: "C1" },
];


// ──────────────────────────────────────────────────
// FONCTIONS DE LOOKUP
// ──────────────────────────────────────────────────

export function getSmicAt(dateStr) {
  for (const s of SMIC) {
    if (dateStr >= s.date_debut && (s.date_fin === null || dateStr <= s.date_fin)) {
      return s;
    }
  }
  return SMIC[0]; // fallback: SMIC le plus recent
}

export function getPlafondSS(annee) {
  return PLAFOND_SS.find(p => p.annee === annee) || PLAFOND_SS[0];
}

export function getCotisations(annee) {
  return getCotisationsForYear(annee);
}

export function getGrilleCCN(idcc, categorie, dateStr) {
  return CCN_GRILLES.filter(g =>
    g.idcc === idcc &&
    g.categorie === categorie &&
    g.date_debut <= dateStr &&
    (g.date_fin === null || g.date_fin >= dateStr)
  ).sort((a, b) => a.coefficient - b.coefficient);
}

export function getMinimumCCN(idcc, categorie, position, coefficient, dateStr) {
  return CCN_GRILLES.find(g =>
    g.idcc === idcc &&
    g.categorie === categorie &&
    g.position === position &&
    g.coefficient === coefficient &&
    g.date_debut <= dateStr &&
    (g.date_fin === null || g.date_fin >= dateStr)
  ) || null;
}

export function getTransport(type, dateStr) {
  return TRANSPORT.find(t =>
    t.type === type &&
    t.date_debut <= dateStr &&
    (t.date_fin === null || t.date_fin >= dateStr)
  ) || TRANSPORT[0];
}

export function getHeuresSup() {
  return HEURES_SUP;
}

export function getReglesControle() {
  return REGLES_CONTROLE;
}


// ──────────────────────────────────────────────────
// CONSTRUCTION DU CONTEXTE RAG
// ──────────────────────────────────────────────────

/**
 * Construit le contexte de reference textuel pour l'analyse.
 * En mode includeAll, inclut les donnees multi-annees pour que Claude
 * identifie lui-meme la date du bulletin et utilise les taux corrects.
 */
export function buildContext({ includeAll = false, dateBulletin = null, idcc = 0, categorie = 'cadres', position = '', coefficient = 0, region = null } = {}) {
  const ctxParts = [];
  const today = dateBulletin || new Date().toISOString().slice(0, 10);
  const annee = parseInt(today.slice(0, 4), 10);

  if (includeAll) {
    // Mode complet : inclure toutes les annees pour que Claude choisisse
    ctxParts.push('## SMIC historique (2022-2026)');
    for (const s of SMIC) {
      ctxParts.push(`- Du ${s.date_debut} au ${s.date_fin || 'present'} : horaire ${s.horaire_brut} EUR, mensuel 35h ${s.mensuel_brut_35h} EUR${s.decret ? ` (${s.decret})` : ''}`);
    }

    ctxParts.push('\n## Plafond Securite Sociale (2022-2026)');
    for (const p of PLAFOND_SS) {
      ctxParts.push(`- ${p.annee} : PMSS ${p.mensuel} EUR, PASS ${p.annuel} EUR`);
    }

    // Cotisations pour l'annee du bulletin (ou annee courante)
    const cotisAnnee = annee >= 2022 && annee <= 2026 ? annee : 2025;
    const cotis = getCotisationsForYear(cotisAnnee);
    const lines = cotis.map(c => {
      let line = `- ${c.libelle} (${c.code}): salarie ${c.taux_salarie}% / employeur ${c.taux_employeur}% -- base: ${c.base}`;
      if (c.conditions) line += ` -- ${c.conditions}`;
      return line;
    });
    ctxParts.push(`\n## Cotisations URSSAF ${cotisAnnee}\n${lines.join('\n')}`);

    // Grilles SYNTEC completes (toutes les annees)
    ctxParts.push('\n## Grilles SYNTEC cadres (toutes periodes)');
    const periodes = ['2025+', '2023-2024', '2022'];
    const grillePeriodes = [
      { label: '2025+', debut: '2025-01-01' },
      { label: '2023-2024', debut: '2023-06-01' },
      { label: '2022', debut: '2022-06-01' },
    ];
    for (const gp of grillePeriodes) {
      const grille = getGrilleCCN(1486, 'cadres', gp.debut);
      if (grille.length > 0) {
        ctxParts.push(`\n### Periode ${gp.label} (${grille[0].accord_source})`);
        for (const g of grille) {
          ctxParts.push(`- Position ${g.position} coeff ${g.coefficient}: ${g.minimum_brut_mensuel} EUR`);
        }
      }
    }

    // Transport Navigo (toutes periodes)
    ctxParts.push('\n## Transport -- Pass Navigo (historique)');
    for (const t of TRANSPORT) {
      ctxParts.push(`- Du ${t.date_debut} au ${t.date_fin || 'present'} : abonnement ${t.montant_mensuel} EUR, remboursement 50% = ${t.remboursement_montant} EUR`);
    }
  } else {
    // Mode specifique : donnees pour une date precise
    const smic = getSmicAt(today);
    if (smic) {
      ctxParts.push(`## SMIC en vigueur au ${today}\n- Horaire brut : ${smic.horaire_brut} EUR\n- Mensuel brut (35h) : ${smic.mensuel_brut_35h} EUR\n- Decret : ${smic.decret || 'N/A'}`);
    }

    const pss = getPlafondSS(annee);
    if (pss) {
      ctxParts.push(`## Plafond Securite Sociale ${annee}\n- PMSS (mensuel) : ${pss.mensuel} EUR\n- PASS (annuel) : ${pss.annuel} EUR`);
    }

    const cotis = getCotisationsForYear(annee);
    const cotisLines = cotis.map(c => {
      let line = `- ${c.libelle} (${c.code}): salarie ${c.taux_salarie}% / employeur ${c.taux_employeur}% -- base: ${c.base}`;
      if (c.conditions) line += ` -- ${c.conditions}`;
      return line;
    });
    ctxParts.push(`## Cotisations URSSAF ${annee}\n${cotisLines.join('\n')}`);

    if (idcc && categorie) {
      if (position && coefficient) {
        const minimum = getMinimumCCN(idcc, categorie, position, coefficient, today);
        if (minimum) {
          ctxParts.push(`## Minimum conventionnel (IDCC ${idcc})\n- CCN : ${minimum.nom_ccn}\n- Position ${minimum.position} -- Coefficient ${minimum.coefficient}\n- Minimum brut mensuel : ${minimum.minimum_brut_mensuel} EUR\n- Accord : ${minimum.accord_source || 'N/A'}`);
        }
      }
      const grille = getGrilleCCN(idcc, categorie, today);
      if (grille.length > 0) {
        const grilleLines = grille.map(g => `- Position ${g.position} coeff ${g.coefficient}: ${g.minimum_brut_mensuel} EUR`);
        ctxParts.push(`## Grille complete ${grille[0].nom_ccn} -- ${categorie}\n${grilleLines.join('\n')}`);
      }
    }

    if (region && ['idf', 'ile-de-france'].includes(region.toLowerCase())) {
      const nav = getTransport('navigo', today);
      if (nav) {
        ctxParts.push(`## Transport -- Pass Navigo\n- Abonnement mensuel : ${nav.montant_mensuel} EUR\n- Remboursement employeur obligatoire (${nav.remboursement_pct}%) : ${nav.remboursement_montant} EUR`);
      }
    }
  }

  // Toujours inclure heures sup et regles de controle
  const hs = getHeuresSup();
  const hsLines = hs.map(h => `- ${h.rang}: majoration ${h.majoration_pct}%`);
  ctxParts.push(`\n## Heures supplementaires (legal)\n${hsLines.join('\n')}`);

  const regles = getReglesControle();
  const reglesLines = regles.map(r => `- [${r.code}] ${r.nom}: ${r.regle} (severite: ${r.severite})`);
  ctxParts.push(`\n## Regles de controle applicables\n${reglesLines.join('\n')}`);

  return ctxParts.join('\n\n');
}
