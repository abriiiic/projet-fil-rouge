# Messagerie (projet fil rouge)
Une messagerie instantanée pour échanger des messages textes et des photos entre deux personnes.

Projet de Web, baccalauréat, semestre 1 (UQAC). L'objectif est de mettre en pratique les bases de la conception d'un site Web en s'appuyant sur un service en ligne pour l'authentification et les données.

**Site en ligne : https://abriiiic.github.io/projet-fil-rouge/**

## Fonctionnalités
- Inscription (pseudo unique, adresse courriel, mot de passe avec confirmation), connexion, déconnexion
- Démarrer une conversation en cherchant le pseudo d'un membre (si la conversation existe déjà, elle est simplement rouverte)
- Envoi et réception de messages en temps réel : texte, photo (5 Mo maximum), ou les deux
- Heure d'envoi affichée à l'heure locale (avec la date si le message ne date pas d'aujourd'hui)
- Réactions aux messages avec 5 emojis (une réaction par personne et par message)
- Recherche dans la liste des conversations
- Conversations favorites, affichées en haut de la liste
- Suppression d'une conversation et de ses messages
- Profil avec photo, bannière et bio (300 caractères), consultable par ses contacts
- Modification du pseudo, de l'adresse courriel et du mot de passe
- Interface adaptée au mobile
- Animation décorative autour de la messagerie 

## Technologies
| Rôle | Choix |
|---|---|
| Interface | HTML, CSS, JavaScript |
| Authentification, base de données, temps réel et stockage des photos | [Supabase](https://supabase.com) (PostgreSQL) |
| Bibliothèque côté client | `supabase-js` v2 (chargée depuis jsDelivr) |
| Hébergement du site | [GitHub Pages](https://pages.github.com), déployé par GitHub Actions |

Le site est **statique** : GitHub Pages sert seulement les fichiers HTML, CSS, JavaScript et images. Il n'y a pas de serveur à programmer : le navigateur communique directement avec Supabase.

## Structure du projet
```
projet-fil-rouge/
├── .github/workflows/
│   └── pages.yml                     Déploiement sur GitHub Pages
└── Code/                             Dossier publié sur GitHub Pages
    ├── index.html                    Racine du site, redirige vers Fichier_html/connexion.html
    ├── Fichier_html/
    │   ├── connexion.html            Connexion (page d'entrée)
    │   ├── inscription.html          Création de compte
    │   ├── mot-de-passe-oublie.html  Formulaire seul (non relié à Supabase)
    │   ├── conversation.html         Page principale (liste des conversations + messages)
    │   └── parametre.html            Profil et informations du compte
    ├── Fichier_css/
    │   ├── connexion.css             Connexion, inscription et mot de passe oublié
    │   ├── conversation.css          Messagerie, fenêtres (profil, nouvelle conversation), réactions
    │   └── parametre.css             Page de profil
    ├── Fichier_js/
    │   ├── supabase-config.js        Configuration et création du client Supabase
    │   ├── connexion.js              Logique de la page de connexion
    │   ├── inscription.js            Logique de la page d'inscription
    │   ├── conversation.js           Conversations, messages, réactions, favoris, profil d'un contact
    │   └── parametre.js              Profil (photo, bannière, bio) et compte (pseudo, courriel, mot de passe)
    └── Fichier_images/
        ├── connexion-fond.svg        Fond des pages de connexion
        └── favicon-messagerie.svg    Logo (icône de l'onglet)
```

## Architecture
### Une page = un fichier HTML, un fichier CSS, un fichier JS
Chaque page a son propre script, qui s'occupe à la fois de l'interface et des échanges avec Supabase. Les trois pages d'authentification partagent la même feuille de style, `connexion.css`.

```
 ┌──────────────┬────────────────┬─────────────────┬──────────────┐
 │ connexion.js │ inscription.js │ conversation.js │ parametre.js │   Pages
 └──────┬───────┴───────┬────────┴────────┬────────┴──────┬───────┘
        └───────────────┴────────┬────────┴───────────────┘
                                 ▼
                       ┌────────────────────┐
                       │ supabase-config.js │   window.supabaseClient
                       └─────────┬──────────┘
                                 ▼
                             Supabase
        Auth · Base de données · Realtime · Stockage (photos)
```

### Un client partagé
`supabase-config.js` crée **un seul client** Supabase et le range dans `window.supabaseClient`. Tous les scripts de page l'utilisent (dans `conversation.js` et `parametre.js`, il est copié dans la constante `client` pour alléger l'écriture).

### Ordre de chargement des scripts
```
supabase-js (CDN) → supabase-config.js → script de la page (defer)
```

Les deux premiers sont chargés **sans `defer`** : ils s'exécutent immédiatement, dans l'ordre, pendant la lecture du HTML. Le script de la page a l'attribut `defer` : il s'exécute une fois le HTML entièrement lu, donc quand le client existe déjà et que tous les éléments de la page sont disponibles. C'est pour ça que `inscription.js` fonctionne même s'il est écrit avant les deux autres dans `inscription.html`.

### Gestion des sessions
- `conversation.js` et `parametre.js` appellent `client.auth.getUser()` au démarrage. Si personne n'est connecté, la page redirige vers `connexion.html`.
- Une connexion réussie mène à `conversation.html`.
- Après l'inscription, si Supabase renvoie une session, on va directement à `conversation.html` ; sinon (confirmation par courriel activée), on revient à `connexion.html` en attendant que le lien soit cliqué.
- Le bouton « Se déconnecter » appelle `client.auth.signOut()` puis renvoie vers `connexion.html`.

Supabase conserve la session dans le navigateur : on reste connecté après un rechargement de la page.

### Circulation des données (envoi et affichage d'un message)
1. **Envoi** : si une photo est jointe, elle est d'abord envoyée dans le bucket `messages` ; on enregistre ensuite le message dans la table `message` avec l'adresse publique de la photo. La ligne renvoyée par la base est affichée tout de suite.
2. **Réception** : la page s'abonne (Realtime) aux insertions dans `message` pour la conversation ouverte. L'événement reçu sert seulement de **signal** : on va chercher en base les messages dont l'`id` est plus grand que celui du dernier message affiché, avec leurs réactions dans la même requête.
3. Ce même chargement est lancé une fois quand l'abonnement devient actif, pour récupérer un message qui serait arrivé entre le chargement initial et l'abonnement.
4. Un message dont l'`id` est déjà à l'écran est ignoré : pas de doublon, même si l'envoi et le signal temps réel arrivent en même temps.
5. La fenêtre ne défile vers le bas que si elle y était déjà (à 50 px près), pour ne pas déranger quelqu'un qui relit d'anciens messages.

Si on change de conversation pendant un chargement, le résultat de l'ancienne requête est ignoré.

### Favoris
Les favoris sont enregistrés dans `localStorage` (clé `favoris-conversations-<id du membre>`). Ils sont donc propres à chaque personne **et à chaque appareil**. Les conversations favorites sont triées en premier, les autres gardent leur ordre de création.

### Affichage responsive
- Sous 480 px de large, la liste des conversations passe au-dessus de la conversation (35 % de la hauteur de l'écran au maximum) et l'animation décorative est masquée.
- Sur les écrans tactiles (sans survol), le bouton « + » de réaction et le bouton « Modifier » de la photo de profil restent toujours visibles.

## Base de données
Quatre tables : les colonnes ci-dessous sont celles utilisées par le code.

### Table `membre`

| Colonne | Type | Remarque |
|---|---|---|
| `id` | uuid | clé primaire, identifiant du compte (`auth.users.id`) |
| `pseudo` | text | unique |
| `bio` | text | 300 caractères au maximum (limite du formulaire) |
| `photo_url` | text | adresse publique de la photo de profil (bucket `profils`) |
| `banniere_url` | text | adresse publique de la bannière (bucket `profils`) |

### Table `conversation`

| Colonne | Type | Remarque |
|---|---|---|
| `id` | nombre | clé primaire |
| `membre1_id` | uuid | → `membre.id`, personne qui a démarré la conversation |
| `membre2_id` | uuid | → `membre.id`, l'autre personne |

### Table `message`

| Colonne | Type | Remarque |
|---|---|---|
| `id` | nombre | clé primaire, sert aussi à trier les messages |
| `conversation_id` | nombre | → `conversation.id` |
| `auteur_id` | uuid | → `membre.id` |
| `contenu` | text | vide si le message ne contient qu'une photo |
| `image_url` | text | adresse publique de la photo (bucket `messages`), facultatif |
| `date_envoi` | timestamptz | enregistrée en UTC, affichée à l'heure locale |

### Table `reaction`

| Colonne | Type | Remarque |
|---|---|---|
| `message_id` | nombre | → `message.id` |
| `membre_id` | uuid | → `membre.id` |
| `emoji` | text | 👍 ❤️ 😂 😮 😢 |

Le couple (`message_id`, `membre_id`) est unique : réagir avec un autre emoji remplace l'ancienne réaction (`upsert`), recliquer sur le même la retire.

### Stockage des photos
| Bucket | Chemin d'un fichier |
|---|---|
| `profils` | `<id du membre>/<photo_url ou banniere_url>-<horodatage>.<extension>` |
| `messages` | `<id de la conversation>/<id du membre>-<horodatage>.<extension>` |

L'horodatage rend chaque nom unique : un nouvel envoi ne remplace jamais un fichier existant.

### Sécurité (RLS)
La clé « publishable » de `supabase-config.js` est visible par tout le monde. La protection repose sur la **sécurité au niveau des lignes (RLS)** de PostgreSQL, configurée dans Supabase.

Le client envoie lui-même certains identifiants : `id` du membre à l'inscription, `membre1_id` d'une conversation, `auteur_id` d'un message, `membre_id` d'une réaction. Les règles RLS doivent donc vérifier que ces valeurs correspondent à `auth.uid()`, sinon une personne pourrait agir au nom d'une autre.

Côté affichage :
- les textes (messages, pseudos, bios) sont insérés avec `textContent` : ils ne sont jamais interprétés comme du HTML ;
- seules les adresses d'images commençant par `https://` sont affichées, pour éviter qu'un lien `javascript:` enregistré en base s'exécute au clic.

> **Limite connue** : les buckets `profils` et `messages` sont publics. Une personne qui obtient l'adresse d'une photo envoyée dans une conversation peut l'ouvrir sans être connectée.

## Déploiement
Le site est publié sur GitHub Pages par le workflow `.github/workflows/pages.yml` :
- il se lance à chaque push sur `main` (ou à la main depuis l'onglet **Actions** du dépôt) ;
- il publie uniquement le dossier `Code/` : `Code/index.html` devient la racine du site et redirige vers `Fichier_html/connexion.html`.

Les chemins entre les pages sont relatifs (`../Fichier_css/...`, `conversation.html`…) : ils fonctionnent aussi bien en local que sur GitHub Pages.

## Installer sa propre copie
1. Créer un projet sur [supabase.com](https://supabase.com).
2. Créer les tables `membre`, `conversation`, `message` et `reaction` (voir plus haut), puis activer **Realtime** sur `message` et `conversation`.
3. Dans **Storage**, créer deux buckets publics : `profils` et `messages`.
4. Dans **Authentication** -> **Sign In / Providers**, vérifier que la connexion par courriel est activée (pour tester rapidement, on peut désactiver la confirmation par courriel).
5. Dans **Authentication** -> **URL Configuration**, mettre l'adresse du site GitHub Pages dans **Site URL** et l'ajouter aux **Redirect URLs** : c'est là que renvoient les liens de confirmation envoyés par courriel (inscription, changement d'adresse).
6. Dans `Code/Fichier_js/supabase-config.js`, remplacer `supabaseUrl` et `supabaseKey` par ceux de votre projet (**Project Settings > API**).
7. Dans le dépôt GitHub, **Settings** -> **Pages**, choisir **GitHub Actions** comme source, puis pousser sur `main`.

Pour tester en local avant de publier, ouvrir `Code/Fichier_html/connexion.html` avec l'extension *Live Server* de VS Code.
