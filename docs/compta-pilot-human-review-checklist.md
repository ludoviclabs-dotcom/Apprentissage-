# Checklist de revue humaine — pilote « Emprunts obligataires »

Cette checklist sert à **approuver ou rejeter** un contenu dans
`/admin/content-review`. Elle ne remplace pas les contrôles déterministes : ceux-ci
ont déjà tourné, et un contenu qui les échoue n'arrive pas jusqu'ici. Ce qu'elle
couvre est exactement ce que le code **ne peut pas** vérifier.

Ce document ne reproduit aucun extrait du cours. Les vérifications se font
écran en main, contenu à côté de sa source citée.

## Avant de commencer

```bash
corepack pnpm content:pilot:preflight --chapter "Emprunts obligataires"
```

Le prévol doit être lu **avant** la revue : il dit si le corpus est celui qu'on
croit, quel mode de génération a produit les brouillons, et ce qui bloque encore.

Puis, avec `CONTENT_REVIEW_ENABLED=true` dans `.env` :

```bash
corepack pnpm dev
```

Ouvrir <http://localhost:3000/admin/content-review>.

## Ce que l'étiquette d'origine vous dit

| Étiquette | Ce que vous relisez | Publiable après approbation |
| --- | --- | --- |
| **Fixture (mock)** | une fixture technique, écrite pour tester la chaîne | **non, jamais** |
| **Génération IA** | un texte rédigé par un modèle à partir des sources | oui |
| **Rédaction assistée** | un texte rédigé à partir des extraits validés, sans appel à un fournisseur | oui |

Un contenu marqué **Fixture (mock)** ne doit pas être approuvé : le garde le
refusera de toute façon, mais l'approuver ferait croire à une relecture utile.

## La règle qui prime sur tout le reste

> **Approuver, c'est signer.** Un contenu approuvé peut être publié et lu par
> quelqu'un qui n'a pas vos sources. Dans le doute — un compte dont vous n'êtes
> pas sûr, un arrondi que vous n'avez pas refait, une formulation que vous
> trouvez « probablement bonne » — **rejeter avec un motif** coûte une
> régénération ; approuver à tort coûte un contre-sens enseigné.

Une validation technique n'est pas une approbation pédagogique.

## 1. Conformité au cours

- [ ] Chaque affirmation est **dans** les sources du chapitre, pas seulement
      compatible avec elles.
- [ ] Aucune règle venue d'ailleurs : pas de PCG de mémoire, pas d'IFRS, pas de
      pratique d'entreprise non écrite dans le cours.
- [ ] Les nuances du cours sont préservées. En particulier, quand le cours
      distingue deux méthodes autorisées, le contenu ne présente pas l'une comme
      **la** méthode.
- [ ] Rien n'est présenté comme obligatoire quand la source dit « peut ».

## 2. Calculs

- [ ] **Le calcul a été refait à la main**, pas relu. C'est le seul contrôle qui
      compte ici : le code a déjà vérifié que le template appliqué à ses entrées
      redonne la réponse, donc une erreur de code est exclue — mais une erreur
      de *modélisation* (mauvais template, mauvaise entrée, mauvais prorata) ne
      l'est pas.
- [ ] Les données de l'énoncé sont celles de la source, à l'unité près.
- [ ] Le prorata temporis compte le bon nombre de mois, et à partir de la bonne
      date (date de jouissance ou date d'émission, selon ce que dit la source).
- [ ] L'arrondi annoncé est celui qui est appliqué, et il est cohérent d'un
      contenu à l'autre du chapitre.
- [ ] Les unités sont explicites et correctes (€, titres, mois, %).
- [ ] Les étapes intermédiaires mènent réellement au résultat final.

**Rappel : il n'y a pas de corrigé pour ce chapitre.** Aucune réponse ne peut
être comparée à un corrigé ; chaque réponse doit être **recalculée**.

## 3. Écritures comptables

- [ ] Chaque numéro de compte est celui que le cours nomme, y compris les comptes
      hors PCG que le cours introduit explicitement.
- [ ] Le libellé de compte correspond au numéro.
- [ ] Le sens débit/crédit est juste pour **chaque** ligne, pas seulement au
      total.
- [ ] L'écriture est complète : aucune ligne manquante, même si le total
      s'équilibre sans elle.
- [ ] Le montant porté sur chaque ligne est le bon montant, pas seulement un
      montant qui équilibre.
- [ ] La date de l'opération est cohérente avec l'énoncé.
- [ ] Les comptes exigés et les alternatives acceptées ne rendent pas juste une
      écriture fausse.

## 4. Formulation et clarté

- [ ] La consigne dit sans ambiguïté ce qui est attendu.
- [ ] L'énoncé se suffit à lui-même : un lecteur qui n'a pas la source peut
      répondre.
- [ ] Aucune question ne contient sa propre réponse.
- [ ] Le vocabulaire est celui du cours, pas un synonyme approximatif.
- [ ] Pas de jargon introduit sans être défini quelque part dans le chapitre.

## 5. Atomicité des cartes

- [ ] Une carte teste **un** fait. Deux faits ⇒ deux cartes.
- [ ] Le recto ne guide pas trop : il ne doit pas suffire à deviner le verso.
      *(Le moteur signale un recouvrement de vocabulaire trop élevé sans le
      bloquer — c'est à vous de trancher.)*
- [ ] Une carte de distinction oppose deux notions réellement confondues, et dit
      ce qui les sépare.
- [ ] Aucune carte n'en duplique une autre sous une formulation différente.

## 6. Références

- [ ] Le contenu cité **est** à la page citée. Ouvrir la source, vérifier.
- [ ] La référence porte sur ce que le contenu affirme, pas sur son voisinage.
- [ ] Quand une règle s'étale sur deux fragments, les deux sont cités.
- [ ] **Aucune référence ne pointe une page marquée dégradée.** Pour ce
      chapitre : la **page 5 de la mise en situation**. Un avertissement
      `page-degradee` s'affiche le cas échéant — il ne bloque pas l'approbation,
      mais il bloquera la publication.

### Le cas de la page 5

Vérifié sur le document source : cette page ne porte qu'une consigne et un
**formulaire de journal vierge**, destiné à être rempli par l'étudiant.
L'extraction est fidèle ; c'est l'heuristique de qualité qui la signale, parce
qu'une page de 72 caractères ressemble à une extraction ratée.

Conséquences pour la revue :

- aucune notion n'est perdue : ce que la page demande d'enregistrer est décrit
  ailleurs dans le document ;
- **aucun contenu ne doit citer cette page** — il n'y a rien à y citer ;
- si un contenu la cite, c'est un signe que son ancrage est faux : **rejeter**.

## 7. Absence d'information extérieure

- [ ] Aucun montant, taux, seuil ou date qui ne vienne pas des sources.
- [ ] Aucun exemple d'entreprise inventé pour « illustrer ».
- [ ] Aucun renvoi à une norme, un article ou un texte que les sources ne citent
      pas elles-mêmes.

## 8. Absence d'extrait excessif

- [ ] Le contenu **reformule**, il ne recopie pas le cours.
- [ ] Aucun paragraphe entier de la source n'est reproduit.
- [ ] Ce qui est cité littéralement est court et justifié (une définition, un
      intitulé de compte).

> Le panneau de sources affiché au relecteur montre le texte extrait ; ce texte
> **ne survit pas** dans un contenu publié — l'instantané ne porte que le
> document, sa nature, sa section et ses pages. Ce contrôle vise donc ce que le
> contenu lui-même recopie.

## Décider

| Décision | Quand | Ce que ça engage |
| --- | --- | --- |
| **Approuver** | toutes les cases ci-dessus sont cochées | le contenu devient publiable ; il ne sera pas écrasé par une régénération |
| **Rejeter** | une seule case résiste | **motif obligatoire** — c'est ce que lira la personne qui corrigera |
| **Ne rien faire** | vous n'êtes pas sûr et vous n'avez pas le temps de vérifier | le contenu reste en attente, ce qui est un état parfaitement acceptable |

Un rejet sans motif est inexploitable. Écrire « faux » ne suffit pas : dire
*quel* montant, *quel* compte, *quelle* page.

## Après la revue

Revenir dans la session et écrire : **REVUE HUMAINE TERMINÉE**.

La publication rejouera **tous** les contrôles au moment exact où elle a lieu —
un contenu approuvé puis modifié, ou dont la source a bougé depuis, sera refusé.
