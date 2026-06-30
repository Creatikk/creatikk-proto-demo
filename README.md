# Creatikk — maquette cliquable (proto + cerveau)

Déploiement de la **maquette de démo** (tunnel + dashboard) **avec l'IA branchée**, pour que le dev (Joseph) puisse cliquer dedans et tout comprendre. Hébergement gratuit sur **Render**.

- `public/` → la maquette statique (tunnel + dashboard + landing).
- `cerveau/` → le serveur de démo IA (Node, zéro dépendance, appelle Claude).
- `render.yaml` → déploie les **2 services d'un coup** (Blueprint).

⚠️ **Aucune clé n'est dans ce repo** (`.env` est exclu). La clé Claude se met **uniquement dans Render** (étape 4).

---

## Déploiement en 5 min (Render)

1. **Compte Render** : va sur https://render.com → crée un compte gratuit (ou connecte-toi) → connecte ton **GitHub**.
2. **New +** → **Blueprint** → sélectionne ce repo.
3. Render lit `render.yaml` et propose **2 services** :
   - `creatikk-cerveau` (web service, Node)
   - `creatikk-proto` (site statique)
4. Sur **`creatikk-cerveau`**, renseigne la variable secrète :
   - **`ANTHROPIC_API_KEY`** = ta clé Claude **(régénérée — voir note sécurité)**
   - *(`ANTHROPIC_MODEL` est déjà rempli : `claude-sonnet-4-6`.)*
5. **Apply / Deploy** → attends ~2-3 min.
6. Récupère les **2 URLs** données par Render :
   - cerveau : `https://creatikk-cerveau-XXXX.onrender.com`
   - proto  : `https://creatikk-proto-XXXX.onrender.com`
7. **Donne-moi ces 2 URLs** → je te construis le lien final à coller dans Notion.

---

## Le lien final (à embarquer dans Notion)

```
https://<proto>/?api=https://<cerveau>
```

Le `?api=` dit à la maquette **où est le cerveau**. Exemple :
`https://creatikk-proto-ab12.onrender.com/?api=https://creatikk-cerveau-cd34.onrender.com`

Dans Notion : tape `/embed`, colle ce lien → la maquette s'affiche cliquable dans la page.

---

## Notes

- **Veille (plan gratuit)** : le cerveau s'endort après ~15 min sans usage. Le **1er appel** après une sieste prend ~50s (cold start), ensuite c'est rapide. Normal pour une démo.
- 🔒 **Sécurité** : régénère ta clé Claude (elle avait été collée en clair ailleurs) **et mets une limite de dépense** dans la console Anthropic — l'endpoint est public.
- Le serveur lit la clé via `process.env.ANTHROPIC_API_KEY`, le port via `process.env.PORT`, et autorise le CORS (`*`). Rien à modifier.
