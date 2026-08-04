# ADR 010 — Attestations vérifiables, portail client et révocation (PR-13)

Statut : accepté
Date : 2026-08-04
Remplace en partie : ADR-007 (« The attestation is HTML, and issued once » ; « No billing portal »)

## Contexte

ADR-007 a livré un socle de paiement solide et deux limites explicitement
assumées : pas de portail client — « cancellation and card updates go through
the Stripe dashboard for this beta » — et pas de PDF, parce que « the browser's
own print-to-PDF typesets better than a first-pass HTML-to-PDF dependency
would, and this app commits to running without internet access ».

Les deux limites sont devenues coûteuses pour des raisons différentes.

Le portail manquant n'était pas seulement une gêne : la route de checkout
répondait « résilie-le depuis Stripe », un conseil qu'un apprenant **ne peut pas
suivre** puisqu'il n'a pas accès au tableau de bord Stripe. Le produit donnait
une instruction impossible.

L'attestation en HTML, elle, n'était pas vérifiable. Un document qu'un tiers ne
peut pas contrôler n'a de valeur que la confiance qu'il accorde à celui qui le
présente — c'est-à-dire aucune dans un contexte de recrutement. Et le
« printable page » d'ADR-007 n'était même pas imprimable : aucune feuille de
style `@media print` n'a jamais existé.

## Décision

### Le PDF est généré par `pdf-lib`, et l'argument hors-ligne d'ADR-007 tient

ADR-007 avait raison de refuser un pipeline PDF *tel qu'il l'envisageait* : un
navigateur sans tête ou une police chargée depuis un CDN cassent la promesse de
fonctionner sans accès réseau. `pdf-lib` (MIT, 1.17.1) ne casse rien de tout
cela : c'est du TypeScript pur, il écrit les octets lui-même, et les quatorze
polices standard PDF sont résolues **par le lecteur** — aucun fichier de police
n'est embarqué, aucune requête n'est émise. Le QR est produit par
`qrcode-generator` (MIT, 2.0.4, **zéro dépendance transitive**), dont je
n'utilise que la matrice de modules, dessinée en rectangles : pas d'encodeur PNG
à embarquer, et la plus petite surface d'approvisionnement disponible.

Un piège concret est traité : les polices standard encodent WinAnsi et **lèvent**
sur tout ce qui en sort. Le nom du titulaire étant saisi par le titulaire, un
emoji ou un caractère cyrillique transformait chaque téléchargement en 500 —
un déni de service qu'un utilisateur déclenche sur lui-même. `toPrintable`
assainit avant tout dessin, et le test le prouve sur emoji, CJK, grec, NUL et
saut de ligne.

### Ce que le PDF imprime est ce qui a été gelé, pas ce qui est vrai aujourd'hui

`certificates.content_json` fige, à l'émission, tout ce que le document affirme.
Recalculer au téléchargement laisserait le document changer sous un titulaire
qui n'a rien fait : une tentative de plus déplace la moyenne, une révision du
curriculum renomme une compétence — et la copie déjà dans la boîte mail d'un
recruteur cesserait de correspondre à celle que le serveur imprime.

Deux inexactitudes préexistantes sont corrigées au passage, parce qu'un PDF les
rendrait durables :

- l'attestation citait `activeCurriculum.id` alors que la complétion est
  calculée contre le curriculum **épinglé** de l'apprenant. Un apprenant sur une
  version antérieure recevait une attestation nommant une version qui ne l'avait
  jamais noté ;
- les cas pratiques ne sont enregistrés nulle part comme « complétés ». Le PDF
  ne l'affirme donc pas : il liste les cas dont le niveau porte une preuve
  `caseStudy`, sous le libellé « Cas pratiques **travaillés** ». L'affirmation
  plus forte exigerait un résultat par cas que le produit ne stocke pas.

Le titre lui-même est dérivé : « Attestation de réussite » quand tous les
niveaux sont acquis, « de complétion » sinon, pour qu'une émission partielle
future ne puisse pas revendiquer une réussite par accident. Et la mention
d'absence de valeur officielle est imprimée sur chaque document.

### L'identifiant de vérification est une capacité, pas un nom

Le numéro `FLH-2026-…` porte 40 bits d'aléa et son propre commentaire le
qualifie de « not a secret » — ce qui était exact tant qu'une attestation
n'était lisible que par son propriétaire. Publier une page indexée sur lui
aurait fait d'une URL devinable une divulgation du nom et du parcours de son
titulaire.

La vérification reçoit donc son propre identifiant : 160 bits d'un CSPRNG,
encodés dans l'alphabet de Crockford (minuscules, sans `i`, `l`, `o` ni `u`,
pour qu'un identifiant lu à voix haute ou recopié depuis du papier ne devienne
pas un autre). Le numéro reste ce qu'il a toujours été : une référence humaine
imprimée sur le document.

### La page publique lit une projection, pas la table privée

`certificates` est sous RLS `ENABLE + FORCE` indexée sur
`app_current_user_id()`. Une page de vérification n'a par construction aucune
session — c'est tout l'intérêt — et ne peut donc jamais satisfaire cette
policy. Trois issues existaient : élargir la policy aux lectures anonymes,
ajouter une fonction `SECURITY DEFINER`, ou projeter les champs publics dans
leur propre table.

La projection l'emporte parce qu'elle rend la fuite **structurellement
impossible plutôt que simplement interdite** : `holder_email`, `user_id`,
`average_score` et le motif de révocation ne sont pas des colonnes de
`certificate_verifications`. Aucune requête écrite plus tard contre cette table
ne peut les renvoyer. Les deux autres options laissaient l'e-mail à un
`SELECT *` de distance.

Elle ne porte pas de RLS, pour la raison exacte qui en dispense
`billing_customers` dans ADR-007 : la ligne est *faite* pour être lue par
quiconque détient l'identifiant opaque. Le contrôle d'accès est l'identifiant de
160 bits, pas le moteur de policies.

Le score est absent de la page publique bien que le PDF l'imprime. Le titulaire
a choisi de transmettre ce document ; il n'a pas choisi de publier ses notes à
une URL. La vérification répond « ce document est-il authentique », pas
« comment s'en est-il sorti ».

### La révocation n'écrit pas la ligne privée

Un opérateur révoquant l'attestation d'un tiers ne peut pas atteindre cette
ligne, pour la même raison de RLS. Plutôt que de forcer un passage, le statut
que voit un vérificateur vit dans `certificate_verifications` — la table que la
page publique lit de toute façon — et c'est la seule autorité sur la validité.
`certificates` garde le contenu gelé et n'est jamais écrite que par son
propriétaire.

Le motif atterrit dans `certificate_revocations`, jamais dans la projection :
il concerne l'émetteur et le titulaire, pas l'inconnu qui scanne le QR. La page
publique dit qu'une attestation est révoquée et que le motif n'est pas rendu
public.

`superseded` n'est pas un synonyme de `revoked`, et la distinction est le sens
même de la réémission : une attestation révoquée n'aurait pas dû être délivrée,
une attestation remplacée a été honnêtement gagnée et décrit toujours quelque
chose de vrai. Dire « révoquée » parce que le syllabus a été révisé serait une
accusation infondée. La contrainte `UNIQUE (user_id, track_id)` de 0009 est donc
remplacée par un index unique partiel sur les lignes **actives**.

### Le portail est une redirection, pas une autorité

`POST /api/stripe/portal` ouvre une session sur le portail hébergé par Stripe
pour le client Stripe **du appelant**, lu depuis `billing_customers`. Aucun
identifiant client n'est accepté dans le corps de la requête : en accepter un
laisserait n'importe qui ouvrir le portail de facturation de n'importe quel
client dont il devinerait ou lirait l'identifiant.

Il n'accorde rien. Le portail laisse Stripe modifier un abonnement ; l'effet de
cette modification atteint l'application par le seul chemin qui existe déjà —
un webhook signé. Le navigateur qui revient n'est pas cru davantage qu'après un
checkout.

### Les six statuts sont classés, pas seulement filtrés

La décision d'accès reste un booléen — `active` et `trialing`, rien d'autre — et
un test épingle `classifySubscriptionStatus` sur `isEntitlingStatus` pour que
deux fonctions ne puissent jamais diverger sur un statut. Ce qui change est ce
qu'on en **dit** : « accès fermé » n'est pas un message. Une carte refusée se
répare dans le portail, une résiliation se répare par un réabonnement, un
premier paiement non confirmé se répare au checkout. Les confondre transforme un
problème réparable en cul-de-sac.

### La page d'offre ne s'adresse plus à l'opérateur

L'écran précédent imprimait `FINANCE_HUB_BILLING_ENABLED`, `STRIPE_SECRET_KEY`
et les noms des variables de prix à tout visiteur, y compris déconnecté. C'est à
la fois une mauvaise vitrine et une petite divulgation : cela renseignait un
inconnu sur le câblage du déploiement et sur la moitié qui manquait. La
configuration retourne dans `docs/local-runbook.md`. Le même reflexe s'applique
à la route de checkout, qui renvoyait le nom de la variable manquante dans son
corps de réponse et le journalise désormais côté serveur.

### La première vraie garde admin du dépôt

`getViewerRole` ne faisait jusqu'ici que *masquer* des liens ; `navigation.ts`
le dit en toutes lettres et `/documents` ne vérifie rien. Masquer est une
réponse acceptable pour une liste de documents importés. Ce n'en est pas une
pour révoquer l'attestation d'un tiers, donc `requireAdmin` renvoie un refus.
Il répond `404` et non `403` : un point d'entrée d'administration qui répond
« interdit » confirme son existence.

**La liste d'administrateurs devient obligatoire dès qu'il y a des comptes**
(corrigé après revue). `resolveViewerRole` accordait le rôle `admin` à *tout le
monde* quand `LEARNING_HUB_ADMIN_EMAILS` était vide, sur le raisonnement qu'une
installation privée n'a qu'un utilisateur. Ce raisonnement ne vaut que pour la
branche `!authEnabled`, qui est précisément la configuration à un seul
utilisateur. Comptes activés, n'importe qui peut s'inscrire — et « aucune liste
configurée » signifiait alors « chaque visiteur inscrit est administrateur ».
Sans conséquence tant que l'administration ne masquait que des liens ; depuis ce
PR, cela donnait le droit de révoquer l'attestation d'un tiers. La liste vide
n'accorde donc plus rien : on échoue fermé, ce qui coûte une variable
d'environnement au lieu du document de quelqu'un.

## Conséquences

- Un tiers peut vérifier une attestation sans compte, et ne voit que validité,
  titulaire, parcours, date, version et statut.
- Une attestation révoquée cesse de vérifier et se réimprime barrée ; le motif
  reste interne.
- L'abonné gère carte, factures et résiliation lui-même.
- Deux dépendances s'ajoutent, toutes deux MIT, sans binaire natif ni accès
  réseau au runtime.

## Limites assumées

- **Le prix affiché est du contenu, pas une lecture de Stripe.** `priceLabel`
  est éditorial ; l'autorité est le prix Stripe présenté sur la page de
  checkout avant tout paiement, et la page le dit. Une dérive entre les deux est
  possible et se corrige dans le dépôt.
- **La réémission sur changement de curriculum est automatique** (corrigé après
  revue) : redemander une attestation alors que la version épinglée a changé
  remplace l'ancienne — `superseded`, jamais `revoked` — et la vérification
  pointe vers le nouveau numéro. Elle reste déclenchée par l'apprenant, pas par
  la publication elle-même.
- **Les attestations d'avant PR-13 n'ont pas d'identifiant de vérification.**
  Elles restent consultables en HTML, sans PDF ni QR, et la page le dit plutôt
  que de promettre une vérification qu'elles ne portent pas.
- **La ligne privée converge, elle ne diverge plus** (corrigé après revue).
  L'opérateur n'écrit toujours pas `certificates` — la RLS l'en empêche — mais
  laisser cette ligne à `active` indéfiniment ne coûtait pas qu'un peu de
  cohérence : l'index unique partiel compte les lignes *actives*, donc une
  attestation révoquée bloquait définitivement son propre remplacement, et
  l'apprenant s'entendait répondre « vous en avez déjà une » à propos d'un
  document qui ne vérifiait plus. `syncCertificateStatusFromPublic` laisse le
  propriétaire réconcilier sa propre ligne, dans son propre contexte, au moment
  où il redemande une attestation. La projection reste la seule autorité sur la
  validité.
- **Aucun test Playwright ne parcourt un vrai paiement Stripe.** Le flux en mode
  test est documenté dans `docs/local-runbook.md` et reproductible à la main ;
  l'automatiser exige des secrets de test que la CI publique n'a pas, et un skip
  silencieux serait pire qu'une procédure écrite.
