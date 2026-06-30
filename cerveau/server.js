// ───────────────────────────────────────────────────────────────────
// Serveur de DÉMO Creatikk — le "cerveau" pour itérer en local.
//
// But : faire tourner la VRAIE IA (Claude) derrière les prototypes, pour
// qu'on bosse les retours ensemble. La clé reste ICI (lue depuis .env),
// jamais dans le navigateur ni dans le code.
//
// Démarrage :  node server.js     (port 8787)
// Zéro dépendance (http + fetch natifs de Node 18+).
// ───────────────────────────────────────────────────────────────────

const http = require('http');
const fs = require('fs');
const path = require('path');

// --- mini-chargeur .env (pas de dépendance) -----------------------
(function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    const txt = fs.readFileSync(envPath, 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* pas de .env → on préviendra au démarrage */
  }
})();

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const PORT = process.env.PORT || 8787;
const API_URL = 'https://api.anthropic.com/v1/messages';

// --- le "cerveau de marque" (personnalité du coach Creatikk) -------
const BRAND = `Tu es le coach IA de Creatikk (creatikk.io), le bras droit des créateurs de contenu court (TikTok, Reels, Shorts) pour percer ET monétiser. Tu combines trois expertises de très haut niveau :
1) Stratège viral de classe mondiale — tu maîtrises les ressorts qui font scroll-stopper, retenir et partager : hook dans la 1re seconde, boucles ouvertes, rétention, watch-time, replays, partages, saves, commentaires ; et les codes spécifiques de chaque niche et plateforme.
2) Expert de la creator economy — tu connais les vraies façons de gagner sa vie en ligne (fonds de partage des plateformes / Creator Rewards, affiliation, sponsoring de marques, contenu UGC, offres et produits perso) et les ordres de grandeur CRÉDIBLES à chaque palier d'audience.
3) Coach qui donne envie — direct, chaleureux, énergique ; tu tutoies, tu parles cash.

Tes règles, à CHAQUE réponse :
- ULTRA concret et spécifique : exemples, chiffres, tactiques nommées, marques et formats réels de SA niche. Zéro généralité creuse, zéro langue de bois, zéro conseil qu'on lirait n'importe où.
- Ambitieux mais crédible : montre le POTENTIEL HAUT et le chemin pour y arriver. Tu es optimiste, motivant, jamais décourageant ni pessimiste — sans mentir. Le créateur doit finir ta réponse en se disant « c'est jouable, ET ça vaut le coup ».
- Orienté monétisation : il y a presque TOUJOURS un moyen de gagner, même avec une petite audience engagée. Montre la 1re marche, puis l'escalier complet, avec des montants réalistes mais ambitieux (pas misérabilistes).
- Orienté action : chaque réponse débouche sur quelque chose à FAIRE maintenant.
- Tu n'inventes pas les chiffres d'un compte qu'on te fournit : tu les analyses. Mais pour les estimations de potentiel, donne des fourchettes réalistes et motivantes, calées sur ce que font VRAIMENT les bons créateurs de cette niche.
- Honnête mais toujours cadré positivement. Concis et percutant. Reste en français.`;

// --- appel structuré à Claude (JSON forcé + prompt caching) --------
async function callClaude({ system, prompt, schema, maxTokens = 1400 }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: system.map((b) => ({
        type: 'text',
        text: b.text,
        ...(b.cache ? { cache_control: { type: 'ephemeral' } } : {}),
      })),
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: { type: 'json_schema', schema } },
    }),
  });
  if (!res.ok) throw new Error('Anthropic ' + res.status + ': ' + (await res.text()));
  const data = await res.json();
  if (data.stop_reason === 'refusal') throw new Error('REFUSAL');
  const block = (data.content || []).find((b) => b.type === 'text');
  return JSON.parse(block ? block.text : '{}');
}

// ─── SCHÉMA + PROMPT : analyse d'un profil TikTok connecté ──────────
const ACCOUNT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scoreGlobal: { type: 'integer', description: 'note du compte sur 100' },
    nicheDetectee: { type: 'string', description: 'la niche que tu identifies à partir du compte (ex: "Fitness / prise de masse"), ou "Pas de niche claire" si le contenu part dans tous les sens' },
    nicheClaire: { type: 'boolean', description: 'true si le compte a une niche identifiable et cohérente, false si c\'est trop éparpillé' },
    resume: { type: 'string', description: '2-3 phrases : où en est ce compte, son potentiel' },
    pointsForts: { type: 'array', items: { type: 'string' }, description: '3 forces concrètes du compte' },
    aAmeliorer: { type: 'array', items: { type: 'string' }, description: '3 leviers prioritaires' },
    parVideo: {
      type: 'array',
      description: 'analyse rapide de chaque vidéo fournie',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          titre: { type: 'string' },
          score: { type: 'integer' },
          verdict: { type: 'string', description: 'ce qui a marché / coincé en 1 phrase' },
        },
        required: ['titre', 'score', 'verdict'],
      },
    },
    recoPrioritaire: { type: 'string', description: 'LE changement n°1 à faire' },
    plan: { type: 'array', items: { type: 'string' }, description: '3 prochaines actions concrètes' },
    motDuCoach: { type: 'string' },
  },
  required: ['scoreGlobal', 'nicheDetectee', 'nicheClaire', 'resume', 'pointsForts', 'aAmeliorer', 'parVideo', 'recoPrioritaire', 'plan', 'motDuCoach'],
};

function accountPrompt(input) {
  const p = input.profil || {};
  const plat = p.plateforme || 'TikTok';
  const vids = (input.videos || [])
    .map((v, i) => `${i + 1}. "${v.titre}" — ${v.vues} vues, ${v.likes ?? '?'} likes, ${v.duree ?? '?'}s${v.legende ? ' · légende: ' + v.legende : ''}`)
    .join('\n');
  return (
    `Un créateur vient de connecter son compte ${plat}. Analyse-le en profondeur et donne des retours actionnables.\n\n` +
    `PROFIL : @${p.pseudo || '?'} · ${p.abonnes ?? '?'} abonnés · ${p.abonnements ?? '?'} abonnements · ${p.likesTotal ?? '?'} likes · ${p.vuesTotales ?? '?'} vues totales.\n\n` +
    `SES DERNIÈRES VIDÉOS :\n${vids || '(aucune fournie)'}\n\n` +
    `D'ABORD : détecte si ce compte a une NICHE CLAIRE et cohérente, ou s'il part dans tous les sens (renseigne nicheDetectee + nicheClaire). Si la niche est floue, c'est un point central de ton analyse (sans niche claire, l'algo ne sait pas à qui pousser le contenu).\n` +
    `Adapte tous tes conseils aux codes de ${plat} (formats, durées, leviers d'engagement propres à cette plateforme).\n` +
    `Pour chaque vidéo analysée, EXPLIQUE le « pourquoi ces chiffres » : ce que les vues/likes/durée révèlent (accroche, rétention, partage) — pas juste un verdict, le mécanisme. Sois ambitieux sur son potentiel (montre où il peut aller), et glisse, là où c'est pertinent, une piste de monétisation adaptée à son niveau réel.\n` +
    `Puis donne : un score global, un résumé (2 phrases), 3 forces, 3 axes d'amélioration, une analyse COURTE par vidéo (une ligne, avec le pourquoi), LA reco prioritaire, un plan de 3 actions, et un mot du coach motivant. Sois précis et spécifique à CE compte, mais TRÈS CONCIS — phrases courtes, va à l'essentiel, pas de remplissage.`
  );
}

// ─── Profil (dashboard) → texte pour le prompt ─────────────────────
const AVATAR_DESC = {
  jeune: 'jeune créateur débutant, motivé, veut percer vite',
  novice: "adulte novice qui démarre, a besoin d'être rassuré",
  business: 'a un business/une marque, veut du contenu qui vend',
  etabli: 'créateur établi qui veut scaler (batch, multi-compte)',
  interm: 'intermédiaire qui plafonne, veut casser son plateau',
  bloque: 'bloqué, ses vidéos ne décollent pas',
  agence: 'agence qui gère des comptes clients',
  expert: 'expert/autorité, veut des leads/clients high-ticket',
  faceless: 'créateur faceless, ne se montre pas, tout au Studio',
};
const SHOW_TEXT = {
  faceless: 'NE se montre PAS (faceless) : propose des idées et formats SANS visage (voix off, B-roll, mains/plan de travail, captures d\'écran, texte animé, avatar IA). Ne lui dis jamais de se filmer.',
  'non-faceless': 'NE se montre PAS (faceless) : propose des idées et formats SANS visage (voix off, B-roll, mains, texte animé, avatar IA). Ne lui dis jamais de se filmer.',
  camera: 'se montre face caméra : tu peux proposer des formats où il apparaît, parle face cam, se filme.',
  oui: 'se montre face caméra : tu peux proposer des formats où il apparaît, parle face cam.',
  'un-peu': 'se montre un peu : propose un mix, mais privilégie des formats où il peut rester discret (voix off, mains) s\'il préfère.',
};
function profilText(p) {
  p = p || {};
  const l = [];
  if (p.avatar) l.push('Profil : ' + (AVATAR_DESC[p.avatar] || p.avatar));
  if (p.niche && p.niche.nom) l.push('Niche : ' + p.niche.nom);
  if (p.seMontrer && SHOW_TEXT[p.seMontrer]) l.push('Se montrer : il ' + SHOW_TEXT[p.seMontrer]);
  return l.join(' · ') || 'créateur de contenu court (TikTok/Reels/Shorts)';
}

// ─── Idée du jour ──────────────────────────────────────────────────
const DAILY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    badge: { type: 'string', description: 'badge court, ex "🔥 Ton idée du jour"' },
    hook: { type: 'string', description: "l'accroche : la 1re phrase à dire, COURTE et percutante (pas de mode d'emploi dedans)" },
    pourquoiMaintenant: { type: 'string', description: '1 phrase COURTE : pourquoi ça marche pour lui maintenant' },
    format: { type: 'string', description: 'format reco en quelques mots (talking head, voix off + B-roll, faceless…)' },
    deroule: { type: 'array', items: { type: 'string' }, description: '3 à 5 étapes CONCRÈTES : quoi faire / quoi montrer à l\'écran, ADAPTÉ à s\'il se montre ou non (faceless = voix off, B-roll, mains, texte…)' },
    outils: { type: 'array', items: { type: 'string' }, description: '1 à 3 outils à utiliser (ex "Studio Creatikk pour la voix off / l\'avatar", "sous-titres auto", "musique tendance") — seulement si utile' },
    ctaConfiance: { type: 'string', description: 'micro-encouragement du coach' },
  },
  required: ['badge', 'hook', 'pourquoiMaintenant', 'format', 'deroule', 'outils', 'ctaConfiance'],
};

// ─── Finder de niche ───────────────────────────────────────────────
const NICHE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    synthese: { type: 'string', description: "1-2 phrases résumant ce qu'on a compris de lui" },
    niches: {
      type: 'array', description: 'exactement 3 niches sur-mesure, classées par pertinence',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          cle: { type: 'string', description: 'identifiant kebab-case' },
          nom: { type: 'string' },
          pourquoiToi: { type: 'string' },
          audience: { type: 'string' },
          potentielMonetisation: { type: 'string' },
          niveauConcurrence: { type: 'string' },
          concepts: { type: 'array', items: { type: 'string' }, description: "5 angles de contenu" },
          premieresIdees: { type: 'array', items: { type: 'string' }, description: '5 idées de vidéos prêtes' },
          matchScore: { type: 'integer', description: '0-100' },
        },
        required: ['cle', 'nom', 'pourquoiToi', 'audience', 'potentielMonetisation', 'niveauConcurrence', 'concepts', 'premieresIdees', 'matchScore'],
      },
    },
  },
  required: ['synthese', 'niches'],
};
function nichePrompt(input) {
  const r = [
    input.passions && input.passions.length ? 'Passions : ' + input.passions.join(', ') : null,
    input.objectif ? 'Objectif : ' + input.objectif : null,
    input.seMontrer ? 'Se montrer : ' + input.seMontrer : null,
    input.tempsParJour ? 'Temps/jour : ' + input.tempsParJour : null,
    input.style ? 'Style : ' + input.style : null,
  ].filter(Boolean).join('\n');
  return 'Un créateur cherche sa niche. Ses réponses :\n' + r +
    '\n\nPropose 3 niches VRAIMENT adaptées (sous-niches précises, jamais « Fitness » tout court). Pour chacune : pourquoi elle lui colle (cite ses réponses), potentiel de monétisation concret, concurrence, 5 concepts d\'angle, 5 idées de vidéos prêtes à filmer. Adapte les formats à s\'il se montre ou reste faceless. Classe par matchScore décroissant.';
}

// ─── Coach (streaming texte) ───────────────────────────────────────
async function streamCoach(res, input) {
  const system = [
    { type: 'text', text: BRAND, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: 'CE QUE TU SAIS DU CRÉATEUR : ' + profilText(input.profil) + '.\nRéponds COURT (2-5 phrases max), concret et orienté action — chaque réponse doit l\'aider à avancer sur sa prochaine vidéo ou sa monétisation. Donne des exemples précis collés à SA niche, jamais de blabla générique. Pose une question de relance seulement si c\'est utile. Reste motivant et cash.' },
  ];
  const messages = (input.historique || []).map((m) => ({ role: m.role, content: m.contenu }));
  messages.push({ role: 'user', content: input.message || '' });
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system, messages, stream: true }),
  });
  if (!r.ok || !r.body) { res.writeHead(500, CORS); return res.end('error'); }
  res.writeHead(200, { ...CORS, 'content-type': 'text/plain; charset=utf-8' });
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
  while (true) {
    const step = await reader.read(); if (step.done) break;
    buf += dec.decode(step.value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const p = line.slice(5).trim(); if (!p || p === '[DONE]') continue;
      try { const evt = JSON.parse(p); if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') res.write(evt.delta.text); } catch (e) {}
    }
  }
  res.end();
}

// ─── Accroches pour une idée précise ──────────────────────────────
const HOOKS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    hooks: {
      type: 'array', description: 'exactement 3 accroches pour CETTE vidéo',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          texte: { type: 'string', description: "l'accroche, 1re phrase prête à dire (sans guillemets)" },
          formule: { type: 'string', description: 'le principe/la formule en 1 ligne' },
        },
        required: ['texte', 'formule'],
      },
    },
  },
  required: ['hooks'],
};

// ─── Analyse prédictive d'une vidéo (avant publication) ────────────
const VIDEO_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    scoreViral: { type: 'integer', description: 'performance réelle interprétée (vidéo postée) OU potentiel estimé (avant publication), sur 100' },
    verdict: { type: 'string', description: '1 phrase de synthèse' },
    lectureStats: { type: 'string', description: 'UNIQUEMENT si la vidéo est déjà publiée : interprétation des stats (pourquoi ce niveau de vues, bon ou faible, vs son audience). Chaîne vide "" si pas encore postée.' },
    ceQuiMarche: { type: 'array', items: { type: 'string' }, description: 'ce qui A marché (postée) ou DEVRAIT marcher (avant)' },
    aAmeliorer: { type: 'array', items: { type: 'string' }, description: 'ce qui a FREINÉ la portée (postée) ou à corriger AVANT de poster' },
    recoPrioritaire: { type: 'string', description: 'la priorité n°1 (pour la prochaine vidéo si postée, sinon avant de publier)' },
    conseilFormat: { type: 'string', description: 'un conseil de structure/format adapté à sa niche' },
  },
  required: ['scoreViral', 'verdict', 'lectureStats', 'ceQuiMarche', 'aAmeliorer', 'recoPrioritaire', 'conseilFormat'],
};

// ─── Plan de contenu (calendrier adapté à la niche) ────────────────
const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    strategie: { type: 'string', description: 'la stratégie du mois en 1 phrase, pour cette niche' },
    jours: {
      type: 'array', description: 'exactement 30 idées de vidéos (une par jour du mois), TOUTES différentes, avec une vraie progression',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          titre: { type: 'string', description: "l'idée de vidéo, courte et tournable" },
          pourquoi: { type: 'string', description: 'pourquoi cette vidéo, en 1 phrase' },
        },
        required: ['titre', 'pourquoi'],
      },
    },
  },
  required: ['strategie', 'jours'],
};

// ─── Conseils du coach + pistes de monétisation (onglet Coach) ─────
const COACH_TIPS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    conseils: {
      type: 'array', description: '3 conseils du moment, actionnables',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          emoji: { type: 'string', description: '1 emoji' },
          titre: { type: 'string', description: 'titre court' },
          texte: { type: 'string', description: '1-2 phrases concrètes et spécifiques' },
        },
        required: ['emoji', 'titre', 'texte'],
      },
    },
    monetisation: {
      type: 'array', description: '3 pistes de monétisation réalistes pour son niveau',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          titre: { type: 'string' },
          texte: { type: 'string', description: '1 phrase' },
          gain: { type: 'string', description: 'estimation de gain concrète, ex "20–100€/mois"' },
        },
        required: ['titre', 'texte', 'gain'],
      },
    },
  },
  required: ['conseils', 'monetisation'],
};

// ─── Plus de pistes de monétisation (dashboard : "gagner + / d'autres idées") ──
const MONEY_IDEAS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    monetisation: {
      type: 'array', description: '3 NOUVELLES pistes de monétisation, différentes de celles déjà vues',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          titre: { type: 'string' },
          texte: { type: 'string', description: '1 phrase concrète sur comment s\'y prendre' },
          gain: { type: 'string', description: 'estimation de gain ambitieuse, ex "300–800€/mois"' },
        },
        required: ['titre', 'texte', 'gain'],
      },
    },
  },
  required: ['monetisation'],
};

// ─── Potentiel de revenus (échelle de paliers) ─────────────────────
const REVENUE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    head: { type: 'string', description: 'le revenu cible, TRÈS court, 5 mots max, SANS le délai, ex "2 000 – 5 000 €/mois"' },
    headsub: { type: 'string', description: 'sous-titre court (peut contenir le délai, ex "atteignable en ~6 mois avec Creatikk")' },
    rungs: {
      type: 'array', description: '3 paliers de progression',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          etat: { type: 'string', enum: ['done', 'cur', 'lock'], description: 'done=atteint, cur=en cours, lock=à venir' },
          palier: { type: 'string', description: 'le seuil, ex "1 000 abonnés"' },
          apercu: { type: 'string', description: 'aperçu TRÈS court de l\'action (4-7 mots), pour la liste, ex "Affiliation + petite offre PDF"' },
          levier: { type: 'string', description: 'la méthode de monétisation détaillée à ce palier (pour la page détail)' },
          gain: { type: 'string', description: 'estimation €' },
        },
        required: ['etat', 'palier', 'apercu', 'levier', 'gain'],
      },
    },
    projection: { type: 'string', description: '1 phrase de projection chiffrée et motivante' },
  },
  required: ['head', 'headsub', 'rungs', 'projection'],
};

// ─── Monétisation par niche (tunnel : sources de revenus + marques qui démarchent) ──
const NICHE_MONEY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    sources: {
      type: 'array', description: 'exactement 5 sources de revenus, de la plus accessible à la plus rémunératrice',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          label: { type: 'string', description: 'la source, COURTE (3 à 6 mots MAX, jamais une phrase), spécifique à la niche, ex "Sponsoring marques mode" ou "Affiliation ASOS / Zalando"' },
          type: { type: 'string', enum: ['platform', 'brand', 'offer'], description: 'platform=programmes plateforme, brand=marques/sponso/affiliation, offer=ses propres offres/produits' },
          fourchette: { type: 'string', description: 'UNIQUEMENT la fourchette €/mois, ex "300–900€/mois". AUCUN autre texte, PAS de parenthèses, PAS de mention d\'abonnés.' },
        },
        required: ['label', 'type', 'fourchette'],
      },
    },
    brands: {
      type: 'array', description: '2 à 3 marques crédibles de CETTE niche précise qui pourraient le démarcher',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          nom: { type: 'string', description: 'nom de marque crédible dans la niche (réaliste, du secteur)' },
          secteur: { type: 'string', description: 'ce que vend la marque, 1-3 mots' },
          message: { type: 'string', description: 'le DM de proposition, court et concret, chiffré si possible, à la 1re personne de la marque' },
          initiale: { type: 'string', description: '1 lettre majuscule (1re lettre du nom)' },
        },
        required: ['nom', 'secteur', 'message', 'initiale'],
      },
    },
    sell: {
      type: 'object', additionalProperties: false, description: 'ce qu\'IL pourrait vendre lui-même',
      properties: {
        what: { type: 'string', description: 'ce qu\'il peut vendre, collé à sa niche' },
        price: { type: 'string', description: 'format de prix réaliste' },
        audience: { type: 'string', description: 'à qui' },
      },
      required: ['what', 'price', 'audience'],
    },
  },
  required: ['sources', 'brands', 'sell'],
};

// ─── Script vidéo complet (dashboard : "Faire cette vidéo") ──
const SCRIPT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    titre: { type: 'string', description: 'titre court et accrocheur de la vidéo' },
    scoreViral: { type: 'integer', description: 'potentiel viral estimé du script, 0-100, honnête' },
    tags: { type: 'array', items: { type: 'string' }, description: '3 hashtags collés à la niche' },
    hook: { type: 'string', description: 'la TOUTE 1re phrase à dire face caméra, percutante, qui arrête le scroll' },
    lignes: {
      type: 'array', items: { type: 'string' },
      description: 'le corps du script, ligne par ligne, en langage PARLÉ prêt à dire face caméra (pas de didascalies). Nombre de lignes adapté à la durée demandée.',
    },
    cta: { type: 'string', description: 'la phrase de fin qui pousse au commentaire/partage/save' },
    conseil: { type: 'string', description: 'un conseil de tournage en 1 ligne : musique, créneau de post, ou rythme' },
  },
  required: ['titre', 'scoreViral', 'tags', 'hook', 'lignes', 'cta', 'conseil'],
};

// ─── Définir SA niche avec ses propres mots (texte libre → niche) ──
const DEFINE_NICHE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    cle: { type: 'string', description: 'identifiant kebab-case' },
    nom: { type: 'string', description: 'nom de niche affiné et précis (jamais juste « Fitness »)' },
    pourquoiToi: { type: 'string', description: 'pourquoi elle lui colle, en reprenant ses mots' },
    audience: { type: 'string' },
    potentielMonetisation: { type: 'string' },
    niveauConcurrence: { type: 'string' },
    concepts: { type: 'array', items: { type: 'string' }, description: '5 angles de contenu' },
    premieresIdees: { type: 'array', items: { type: 'string' }, description: '5 idées de vidéos prêtes' },
  },
  required: ['cle', 'nom', 'pourquoiToi', 'audience', 'potentielMonetisation', 'niveauConcurrence', 'concepts', 'premieresIdees'],
};

// ─── Concepts qui cartonnent dans une niche (tunnel : "ce qui cartonne") ──
const TRENDING_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    concepts: {
      type: 'array', description: 'exactement 4 concepts de vidéos qui cartonnent dans cette niche',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          hook: { type: 'string', description: "l'accroche/le titre du concept, prêt à filmer, spécifique à la niche" },
          type: { type: 'string', description: 'le type de format (Secret révélé, Listicle, Défi, Mythe vs réalité…)' },
          pourquoi: { type: 'string', description: 'le ressort psychologique qui retient, 1 phrase' },
          vues: { type: 'string', description: 'estimation crédible, ex "1,8M vues"' },
        },
        required: ['hook', 'type', 'pourquoi', 'vues'],
      },
    },
  },
  required: ['concepts'],
};

// ─── Diagnostic d'onboarding (path débutant : "ton terrain de jeu") ──
const QUIZ_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    resume: { type: 'string', description: '2-3 phrases : où en est ce créateur, son potentiel, son frein n°1' },
    forces: { type: 'array', items: { type: 'string' }, description: '2-3 atouts concrets' },
    aDebloquer: { type: 'array', items: { type: 'string' }, description: '2-3 freins à lever' },
    plan: { type: 'array', items: { type: 'string' }, description: '3 actions concrètes pour démarrer/progresser' },
    formats: { type: 'array', items: { type: 'string' }, description: '3 formats reco taillés pour SA niche' },
  },
  required: ['resume', 'forces', 'aDebloquer', 'plan', 'formats'],
};

// ─── table des endpoints (extensible) ──────────────────────────────
const ROUTES = {
  '/analyze-account': {
    schema: ACCOUNT_SCHEMA,
    build: (input) => ({
      system: [{ text: BRAND, cache: true }],
      prompt: accountPrompt(input),
      maxTokens: 1100,
    }),
  },
  '/daily-idea': {
    schema: DAILY_SCHEMA,
    build: (input) => {
      const p = input.profil || {};
      const niche = (p.niche && p.niche.nom) ? p.niche.nom : null;
      const eviter = Array.isArray(input.eviter) ? input.eviter.filter(Boolean).slice(0, 8) : [];
      return {
        system: [{ text: BRAND, cache: true }],
        prompt: 'Génère UNE idée du jour concrète et tournable pour ce créateur. ' + profilText(p) + '.\n' +
          (niche
            ? 'IMPÉRATIF : l\'idée porte à 100% sur SA niche « ' + niche + ' » — le sujet de la vidéo est DANS cette niche, jamais un autre domaine (surtout PAS de jeux vidéo si ce n\'est pas sa niche).\n'
            : '') +
          (eviter.length
            ? 'Il a DÉJÀ vu ces idées — propose un angle VRAIMENT différent, n\'en répète aucune : ' + eviter.map((h) => '« ' + h + ' »').join(' ; ') + '.\n'
            : '') +
          'Elle doit être spécifique (pas générique), surprendre, et lui donner envie de filmer maintenant.\n' +
          'IMPORTANT : le hook reste COURT (juste l\'accroche), le pourquoi COURT. Le « quoi faire » va dans deroule (3-5 étapes concrètes : quoi filmer/montrer à l\'écran), ADAPTÉ à s\'il se montre ou non (s\'il est faceless : voix off + B-roll + mains + texte, jamais "filme-toi").\n' +
          'outils : privilégie D\'ABORD le réel et l\'humain — sa VRAIE VOIX (plus authentique et engageante) et ses propres plans filmés. Ne propose la voix IA / l\'avatar du Studio Creatikk QUE comme REPLI s\'il ne veut vraiment pas utiliser sa voix ou se montrer. ET s\'il n\'a pas le temps ou pas d\'images (B-roll, plans d\'illustration) : propose de générer les visuels manquants via le Studio Creatikk (mode standard, ou VEO 3 / Kling pour des plans cinématiques) à ajouter au montage. Reste pratique et concret.\n' +
          'Donne badge, hook, pourquoiMaintenant, format, deroule, outils, ctaConfiance.',
        maxTokens: 700,
      };
    },
  },
  '/generate-niches': {
    schema: NICHE_SCHEMA,
    build: (input) => ({
      system: [{ text: BRAND, cache: true }],
      prompt: nichePrompt(input),
      maxTokens: 2500,
    }),
  },
  '/generate-hooks': {
    schema: HOOKS_SCHEMA,
    build: (input) => {
      const idee = input.idee || {};
      return {
        system: [{ text: BRAND, cache: true }],
        prompt: 'Le créateur veut filmer CETTE idée de vidéo : « ' + (idee.hook || '?') + ' »' +
          (idee.why ? ' (contexte : ' + idee.why + ')' : '') + '. ' + profilText(input.profil) + '.\n' +
          'Propose 3 accroches (la TOUTE 1re phrase de la vidéo, celle qui stoppe le scroll en moins d\'1 seconde) PERCUTANTES et 100% SPÉCIFIQUES à cette idée, chacune dans une FAMILLE différente parmi : curiosity gap (vide d\'info), erreur/négatif (« arrête de… »), chiffre/résultat concret, contre-pied (« tout le monde croit X, faux »), preuve/avant-après. Chaque accroche doit être dite à voix haute en 2-4 secondes, sans intro molle. Pour chaque : texte (prêt à dire, sans guillemets, ultra concret) + formule (le principe psychologique en 1 ligne). Reste sur LE sujet exact de cette idée.',
        maxTokens: 600,
      };
    },
  },
  '/analyze-video': {
    schema: VIDEO_SCHEMA,
    build: (input) => {
      const link = input.source === 'link';
      const s = input.stats || {};
      const statsLine = link
        ? `STATS RÉELLES de la vidéo : ${s.vues ?? '?'} vues, ${s.likes ?? '?'} likes, ${s.commentaires ?? '?'} commentaires, ${s.partages ?? '?'} partages (engagement ${s.taux ?? '?'}).`
        : '';
      const prompt = link
        ? 'Un créateur veut COMPRENDRE une vidéo DÉJÀ PUBLIÉE (il a collé son lien). ' + profilText(input.profil) + '.\n' +
          (input.lien ? 'Lien : ' + input.lien + '\n' : '') +
          (input.description ? 'Sujet : « ' + input.description + ' »\n' : '') +
          statsLine + '\n' +
          'Fais une analyse RÉTROSPECTIVE et honnête, basée sur ces chiffres et les codes de sa niche :\n' +
          '- lectureStats : interprète les stats — pourquoi ce niveau de vues (bon ou faible) par rapport à son audience et à sa niche ; quel signal (accroche, partage, rétention) explique ces chiffres.\n' +
          '- scoreViral : la performance réelle interprétée (0-100), cohérente avec les stats.\n' +
          '- ceQuiMarche : ce qui A fonctionné dans cette vidéo.\n' +
          '- aAmeliorer : ce qui a FREINÉ la portée.\n' +
          '- recoPrioritaire : LE levier n°1 pour faire mieux à la PROCHAINE vidéo — précis et actionnable (ex "réécris ta 1re phrase en mode curiosity gap", pas "améliore ton accroche").\n' +
          '- conseilFormat : un conseil de format adapté à sa niche. Spécifique et chiffré quand possible, jamais générique.'
        : 'Un créateur veut TESTER une vidéo AVANT de la publier. ' + profilText(input.profil) + '.\n' +
          (input.description ? 'Idée / description : « ' + input.description + ' »\n' : '') +
          'Diagnostic PRÉDICTIF honnête (tu ne vois pas la vidéo, base-toi sur le concept + les codes de sa plateforme/niche) : scoreViral (potentiel 0-100, nuancé, pas toujours 70+), verdict, 2-3 choses qui DEVRAIENT marcher (ceQuiMarche), 2-3 freins PRÉCIS à corriger AVANT de poster (aAmeliorer, ex "ton hook arrive à la 3e seconde, mets-le en 1re"), LA reco prioritaire avant publication (concrète), un conseil de format. Mets lectureStats = "" (pas encore postée). Spécifique et actionnable, jamais générique.';
      return { system: [{ text: BRAND, cache: true }], prompt, maxTokens: 1100 };
    },
  },
  '/content-plan': {
    schema: PLAN_SCHEMA,
    build: (input) => ({
      system: [{ text: BRAND, cache: true }],
      prompt: 'Construis un plan de contenu de 30 JOURS pour ce créateur. ' + profilText(input.profil) +
        (input.objectif ? '. Objectif : ' + input.objectif : '') + '.\n' +
        'Donne EXACTEMENT 30 idées de vidéos (une par jour), concrètes et tournables, SPÉCIFIQUES à sa niche, TOUTES DIFFÉRENTES (aucune répétition ni redite), avec une vraie PROGRESSION sur le mois : semaine 1 tester plusieurs angles, semaine 2 doubler ce qui marche, semaine 3 créer du lien et de la série, semaine 4 amener vers la monétisation. Pour chaque jour : un titre d\'idée court et précis + pourquoi (1 phrase). Jamais générique, toujours collé à sa niche, et varie vraiment les formats (secret, listicle, défi, storytime, tuto, avis cash, coulisses, Q/R, versus…).',
      maxTokens: 2900,
    }),
  },
  '/coach-tips': {
    schema: COACH_TIPS_SCHEMA,
    build: (input) => {
      const c = input.compte || {};
      const ctx = c.abonnes ? `Son compte : ${c.abonnes} abonnés, ${c.vues || '?'} vues/vidéo, régularité ${c.reg || '?'}, niveau ${c.niveau || '?'}.` : '';
      return {
        system: [{ text: BRAND, cache: true }],
        prompt: 'Tu es le coach de ce créateur. ' + profilText(input.profil) + '. ' + ctx + '\n' +
          'Donne : 3 conseils du moment (chacun : un emoji, un titre court, 1-2 phrases ACTIONNABLES et pointues, spécifiques à SON niveau et SA niche — le genre de conseil d\'expert qu\'on ne trouve pas en cherchant sur Google) ; et 3 pistes de monétisation pour son niveau actuel, RÉALISTES mais ambitieuses (titre, 1 phrase concrète sur comment s\'y prendre, et une estimation de gain motivante — montre le vrai potentiel, pas le minimum). Jamais générique, toujours collé à son profil et à sa niche.',
        maxTokens: 900,
      };
    },
  },
  '/more-monetization': {
    schema: MONEY_IDEAS_SCHEMA,
    build: (input) => {
      const c = input.compte || {};
      const ctx = c.abonnes ? `Son compte : ${c.abonnes} abonnés, niveau ${c.niveau || '?'}.` : '';
      const eviter = Array.isArray(input.eviter) ? input.eviter.filter(Boolean).slice(0, 12) : [];
      return {
        system: [{ text: BRAND, cache: true }],
        prompt: 'Ce créateur veut EXPLORER plus de façons de gagner de l\'argent avec son contenu (il veut gagner plus / d\'autres idées). ' + profilText(input.profil) + '. ' + ctx + '\n' +
          (eviter.length ? 'Il a DÉJÀ vu ces pistes — propose-en 3 VRAIMENT NOUVELLES et différentes, n\'en répète AUCUNE : ' + eviter.map((t) => '« ' + t + ' »').join(' ; ') + '.\n' : '') +
          'Donne 3 pistes de monétisation concrètes et collées à SA niche, qui vont un cran plus loin (revenus plus élevés ou leviers complémentaires/créatifs). Pour chaque : titre, texte (1 phrase sur comment s\'y prendre), gain (fourchette € ambitieuse mais crédible).',
        maxTokens: 600,
      };
    },
  },
  '/revenue-potential': {
    schema: REVENUE_SCHEMA,
    build: (input) => {
      const c = input.compte || {};
      const ctx = c.abonnes ? `Compte : ${c.abonnes} abonnés, ${c.vues || '?'} vues/vidéo, niveau ${c.niveau || '?'}.` : '';
      return {
        system: [{ text: BRAND, cache: true }],
        prompt: 'Estime le POTENTIEL DE REVENUS de ce créateur de façon AMBITIEUSE et crédible. Beaucoup de créateurs sérieux de cette niche en vivent vraiment — montre ce VRAI potentiel, ne lowball JAMAIS (zéro chiffre misérabiliste, zéro fourchette timide). ' + profilText(input.profil) + '. ' + ctx + '\n' +
          'Donne 3 paliers de progression CONCRETS et ACTIONNABLES — chacun dit QUOI FAIRE pour l\'atteindre, pas juste un seuil :\n' +
          '- Palier 1 (etat "cur") : ce qu\'il peut gagner DÈS MAINTENANT même avec une petite audience engagée (petite offre liée à sa niche, affiliation, UGC, premières ventes). levier = l\'action concrète à lancer cette semaine.\n' +
          '- Palier 2 (etat "lock") : atteindre ~10 000 abonnés grâce à du contenu à forte valeur → débloque la monétisation directe TikTok (Creator Rewards) + sponsos régulières. levier = le type de contenu qui fait grossir vite dans CETTE niche.\n' +
          '- Palier 3 (etat "lock") : passer à l\'échelle (offre/produit qui scale, sponsos récurrentes, partenariats marques) — c\'est là que ça devient un vrai revenu, voire un temps plein.\n' +
          'Pour chaque palier : palier = le SEUIL court uniquement (2 à 5 mots, ex "Dès maintenant", "10 000 abonnés") ; apercu = un aperçu TRÈS court de l\'action (4-7 mots, pour la liste) ; levier = l\'action détaillée + ce que ça débloque (1-2 phrases, pour la page détail) ; gain = fourchette € AMBITIEUSE (le potentiel réel des bons créateurs de la niche, pas le minimum syndical). head = le revenu cible TRÈS court (5 mots max, SANS délai, ex "2 000 – 5 000 €/mois"), headsub = court avec le délai/contexte (ex "atteignable en ~6 mois avec Creatikk"), projection = 1 phrase chiffrée qui donne envie. Reste CONCIS, colle à SA niche, et rappelle implicitement que Creatikk accélère tout ça.',
        maxTokens: 1000,
      };
    },
  },
  '/analyze-quiz': {
    schema: QUIZ_SCHEMA,
    build: (input) => {
      const a = input.reponses || {};
      const angle = a.nicheDetail || a.niche2 || '';
      const ctx = `Niveau : ${a.level || '?'}. Niche : ${a.niche || '?'}${angle ? ` — son angle EXACT : « ${angle} »` : ''}. Type de contenu : ${a.content || '?'}. Frein principal : ${a.blocker || '?'}. Objectif : ${a.goal || '?'}. Abonnés : ${a.followers || '?'}. Fréquence : ${a.frequency || '?'}.`;
      return {
        system: [{ text: BRAND, cache: true }],
        prompt: "Voici les réponses d'un créateur à un mini-questionnaire d'onboarding : " + ctx +
          "\nFais un diagnostic PERSONNALISÉ qui colle à son angle (cite-le). Sois TRÈS CONCIS — phrases courtes et percutantes, va à l'essentiel : resume (2 phrases max : son potentiel sur cet angle + son frein n°1), forces (2 atouts, une ligne chacun), aDebloquer (2 freins, une ligne), plan (3 actions courtes), formats (3 formats, une ligne). Spécifique, jamais générique, mais BREF.",
        maxTokens: 700,
      };
    },
  },
  '/trending-concepts': {
    schema: TRENDING_SCHEMA,
    build: (input) => ({
      system: [{ text: BRAND, cache: true }],
      prompt: 'Le créateur est dans la niche « ' + (input.niche || 'création de contenu') + ' »' +
        (input.precision ? ', et précise SON angle exact : « ' + input.precision + ' »' : '') + '.\n' +
        'Donne 4 concepts de vidéos qui CARTONNENT en ce moment, ULTRA spécifiques à cet angle précis (PAS des clichés évidents, PAS du générique). Chacun doit arrêter le scroll et donner envie de filmer demain. Pour chacun : hook (le titre/l\'accroche exacte, concret, collé à son sujet — pas une catégorie vague), type (format : Secret révélé, Listicle, Défi, Mythe vs réalité, Storytelling, Avis cash…), pourquoi (le ressort psychologique précis qui retient), vues (estimation crédible). Sois créatif, surprenant et concret — vise des angles que les autres créateurs de la niche n\'exploitent pas encore.',
      maxTokens: 800,
    }),
  },
  '/generate-script': {
    schema: SCRIPT_SCHEMA,
    build: (input) => {
      const idee = input.idee || {};
      const duree = String(input.duree || '60');
      const mots = duree === '30' ? '70 à 90 mots (3-4 lignes très punchy)' : (duree === '90' ? '200 à 240 mots (8-11 lignes)' : '140 à 170 mots (6-8 lignes)');
      return {
        system: [{ text: BRAND, cache: true }],
        prompt:
          'Écris un SCRIPT VIDÉO court-format (TikTok/Reels/Shorts) VRAIMENT QUALITATIF et pensé pour la VIRALITÉ. ' + profilText(input.profil) + '.\n' +
          'Sujet / idée de la vidéo : « ' + (idee.hook || input.accroche || '?') + ' »' + (idee.why ? ' (contexte : ' + idee.why + ')' : '') + '.\n' +
          (input.accroche ? 'Accroche choisie par le créateur (pars de cette 1re phrase) : « ' + input.accroche + ' ».\n' : '') +
          (input.style ? 'Style/ton demandé : ' + input.style + '.\n' : '') +
          'Durée cible : ' + duree + ' secondes → vise ' + mots + '.\n\n' +
          'Règles de viralité OBLIGATOIRES :\n' +
          '- Le HOOK (1re phrase) doit créer une tension/curiosité immédiate et promettre un payoff. Pas de phrase d\'intro molle ("Salut les amis").\n' +
          '- Rétention : chaque ligne donne envie de regarder la suivante (boucle ouverte, mini-cliffhangers, rythme rapide).\n' +
          '- Concret et spécifique à SA niche : exemples, chiffres, mini-histoire vraie — jamais de généralités creuses.\n' +
          '- Langage PARLÉ, direct, comme on parle face caméra (pas de "[plan large]", pas de didascalies).\n' +
          '- Le CTA final déclenche un commentaire/partage/save de façon naturelle (pas "abonne-toi" plat).\n' +
          'Donne : titre, scoreViral (honnête), 3 tags, hook, lignes (le corps, ligne par ligne, prêt à dire), cta, conseil (musique/créneau/rythme).',
        maxTokens: 900,
      };
    },
  },
  '/niche-monetization': {
    schema: NICHE_MONEY_SCHEMA,
    build: (input) => ({
      system: [{ text: BRAND, cache: true }],
      prompt: 'Un créateur est dans la niche « ' + (input.niche || 'création de contenu') + ' »' +
        (input.precision ? ', son angle exact : « ' + input.precision + ' »' : '') +
        (input.objectif ? '. Son objectif : ' + input.objectif : '') + '.\n' +
        'Décris comment IL gagne de l\'argent, de façon PRÉCISE et crédible, 100% collée à SA niche (jamais générique) :\n' +
        '- sources : 5 sources de revenus, de la plus accessible à la plus rémunératrice. La PREMIÈRE source = la monétisation directe des plateformes (type=platform : TikTok Creator Rewards / YouTube Shorts). Les autres : type brand (marques/sponsos/affiliation, noms réels du domaine) ou offer (ses propres produits). label = COURT (3-6 mots MAX, jamais une phrase), spécifique à la niche ; fourchette = UNIQUEMENT le montant €/mois (ex "300–900€/mois"), AUCUN texte en plus, PAS de parenthèses.\n' +
        '- brands : 2-3 marques crédibles de SA niche précise qui pourraient le démarcher (noms réalistes du secteur), avec secteur (ce qu\'elles vendent) et message (un vrai DM de proposition, court, concret, chiffré si possible), initiale (1re lettre du nom).\n' +
        '- sell : ce qu\'IL pourrait vendre lui-même (what, collé à sa niche), price (format de prix réaliste), audience (à qui).\n' +
        'Tout doit être SI spécifique qu\'on reconnaît immédiatement la niche. Jamais de marque générique type "Nova Studio" ou "BrandLab".',
      maxTokens: 900,
    }),
  },
  '/define-niche': {
    schema: DEFINE_NICHE_SCHEMA,
    build: (input) => ({
      system: [{ text: BRAND, cache: true }],
      prompt: 'Un créateur décrit SA niche / ce qu\'il veut faire AVEC SES PROPRES MOTS : « ' + (input.description || '') + ' ». ' + profilText(input.profil) + '.\n' +
        'Transforme ça en UNE niche précise et actionnable (une vraie sous-niche claire, jamais juste « Fitness » ou « Cuisine »). Donne : cle (kebab-case), nom affiné, pourquoiToi (en reprenant ses mots), audience, potentielMonetisation, niveauConcurrence, 5 concepts d\'angle, 5 premières idées de vidéos prêtes à filmer. Reste 100% fidèle à ce qu\'il a décrit — ne change pas son sujet.',
      maxTokens: 1200,
    }),
  },
};

// ─── serveur HTTP ──────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }
  if (req.url === '/health') {
    res.writeHead(200, { ...CORS, 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, keySet: !!API_KEY, model: MODEL }));
  }
  if (req.url === '/coach-chat' && req.method === 'POST') {
    let cb = '';
    req.on('data', (c) => (cb += c));
    req.on('end', async () => {
      try { await streamCoach(res, cb ? JSON.parse(cb) : {}); }
      catch (e) { console.error('coach-chat →', e.message); res.writeHead(500, CORS); res.end('error'); }
    });
    return;
  }
  const route = ROUTES[req.url];
  if (req.method !== 'POST' || !route) {
    res.writeHead(404, CORS);
    return res.end('not found');
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    try {
      const input = body ? JSON.parse(body) : {};
      const opts = route.build(input);
      const result = await callClaude({ ...opts, schema: route.schema });
      res.writeHead(200, { ...CORS, 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      console.error(req.url, '→', e.message);
      res.writeHead(500, { ...CORS, 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🧠 Creatikk démo — serveur sur http://localhost:${PORT}`);
  console.log(`   clé Claude : ${API_KEY ? 'OK ✅' : 'MANQUANTE ❌ (ajoute-la dans .env)'}`);
  console.log(`   modèle : ${MODEL}`);
  console.log(`   endpoints : ${Object.keys(ROUTES).join(', ')}, /health\n`);
});
