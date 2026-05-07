# Nextcloud Tasks

Application mobile React Native (Expo) pour gérer vos tâches CalDAV Nextcloud. Fonctionne sur Android et iOS.

> **Releases & téléchargements** → [github.com/lgabardos/nextcloud-task-app/releases](https://github.com/lgabardos/nextcloud-task-app/releases)

---

## Fonctionnalités

- **Connexion sécurisée** — basic auth via CalDAV + génération d'un app-password OCS dédié, stocké dans le keychain chiffré de l'appareil
- **Listes de tâches CalDAV** — lecture, création et suppression de listes (MKCALENDAR / DELETE)
- **Gestion des tâches** — créer, marquer terminée/à faire, supprimer, voir le détail (priorité, échéance, catégories, progression)
- **Mode hors-ligne** — les listes et tâches sont mises en cache localement (AsyncStorage) ; les toggles effectués sans réseau sont mis en queue et synchronisés automatiquement au retour de la connexion
- **Mises à jour automatiques** — vérification au lancement des nouvelles versions publiées sur GitHub Releases
- **Optimistic updates** — l'UI répond instantanément, les appels réseau se font en arrière-plan

---

## Prérequis

| Outil | Version minimale |
|---|---|
| Node.js | 18 |
| npm | 9 |
| Expo CLI | dernière version |
| EAS CLI | dernière version (pour les builds) |

---

## Installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/lgabardos/nextcloud-task-app.git
cd nextcloud-task-app

# 2. Installer les dépendances
npm install

# 3. Lancer en développement
npx expo start
```

Scannez le QR code avec **Expo Go** (Android/iOS) pour tester instantanément.

> **Note CORS** : certaines requêtes CalDAV (PROPFIND, REPORT) peuvent être bloquées par le navigateur dans Expo Go. Pour un test complet, utilisez un **Development Build** (voir ci-dessous) ou directement un APK.

---

## Tests

```bash
# Lancer tous les tests
npm test

# Mode watch
npm run test:watch

# Avec couverture
npm run test:coverage
```

Les tests couvrent les services purs (aucune dépendance réseau ou native) :

| Fichier | Ce qui est testé |
|---|---|
| `calDavService` | parsing iCal, formatage dates, priorités, slugification |
| `pendingActionsService` | enqueue, dédoublonnage, annulation, removePending |
| `cacheService` | formatLastSync |
| `updateService` | comparaison de versions sémantiques |
| `authService` | nettoyage d'URL |

---

## Build Android

### APK direct (distribution interne)

```bash
# Se connecter à Expo
npx eas-cli@latest login

# Build APK installable sans Play Store
npm run build:android:preview
```

### AAB pour le Play Store

```bash
npm run build:android:prod
```

### Tous les profils disponibles

| Commande | Résultat |
|---|---|
| `npm run build:android:preview` | `.apk` installable directement |
| `npm run build:android:prod` | `.aab` pour le Play Store |
| `npm run build:ios:preview` | `.ipa` distribution interne iOS |
| `npm run build:ios:prod` | `.ipa` App Store |

---

## Structure du projet

```
app/                          ← Routes Expo Router
  _layout.tsx                 ← Root layout + vérification auth au démarrage
  index.tsx                   ← Écran de connexion
  (app)/
    _layout.tsx               ← Layout groupe authentifié
    home.tsx                  ← Liste des task lists
    list/[id].tsx             ← Tâches d'une liste
    task/[taskUrl].tsx        ← Détail d'une tâche

src/
  screens/
    LoginScreen.tsx           ← Formulaire de connexion Nextcloud
    HomeScreen.tsx            ← Accueil : listes + état offline + MAJ dispo
    TaskListScreen.tsx        ← Liste des tâches, filtres, ajout, toggle
    TaskDetailScreen.tsx      ← Détail complet + actions

  services/
    authService.ts            ← Connexion CalDAV, génération app-password, SecureStore
    calDavService.ts          ← PROPFIND / REPORT / PUT / DELETE / MKCALENDAR
    cacheService.ts           ← Lecture/écriture cache AsyncStorage
    pendingActionsService.ts  ← Queue d'actions offline (toggle hors-ligne)
    updateService.ts          ← Vérification GitHub Releases

  hooks/
    useSyncPending.ts         ← Flush la queue offline au retour réseau

  store/
    appStore.ts               ← État global Zustand (credentials, listes, tâches, offline)

  components/
    UI.tsx                    ← Composants réutilisables (Button, Input, Card, Badge)

  utils/
    theme.ts                  ← Tokens de design (couleurs, spacing, radius)

  __tests__/                  ← Tests unitaires Jest
```

---

## Authentification

L'app n'utilise **pas** le Login Flow v2 (qui nécessite un navigateur et génère des erreurs CORS dans un contexte natif). Le flux est :

1. Vérification des credentials via `PROPFIND /remote.php/dav/` avec basic auth
2. Tentative de génération d'un **app-password** dédié via `GET /ocs/v2.php/core/apppassword`
3. Si l'OCS échoue (permissions ou version Nextcloud trop ancienne) → fallback sur le mot de passe directement
4. Credentials stockés dans le **keychain chiffré de l'appareil** via `expo-secure-store`

L'app-password est révocable depuis **Paramètres Nextcloud → Sécurité → Appareils et sessions**.

---

## Mode hors-ligne

Quand le réseau est indisponible :

- Les listes et tâches sont affichées depuis le cache local
- Un indicateur `📶 Hors-ligne` s'affiche avec la date de dernière synchronisation
- Les toggles (marquer terminée/à faire) fonctionnent normalement — ils sont enregistrés dans une queue persistante
- Si on retoggle une tâche déjà en queue, les deux actions s'annulent (net zéro)
- Au retour de la connexion (pull-to-refresh), la queue est flushée automatiquement et l'état est synchronisé avec le serveur

---

## API CalDAV utilisée

| Opération | Méthode | Endpoint |
|---|---|---|
| Lister les calendriers | `PROPFIND` Depth:1 | `/remote.php/dav/calendars/{user}/` |
| Lister les tâches | `REPORT` | `/{calendar}/` |
| Créer une tâche | `PUT` | `/{calendar}/{uid}.ics` |
| Mettre à jour une tâche | `GET` + `PUT` | `/{calendar}/{uid}.ics` |
| Supprimer une tâche | `DELETE` | `/{calendar}/{uid}.ics` |
| Créer une liste | `MKCALENDAR` | `/remote.php/dav/calendars/{user}/{slug}/` |
| Supprimer une liste | `DELETE` | `/remote.php/dav/calendars/{user}/{slug}/` |

---

## Dépannage

**"Impossible de joindre le serveur"**
- L'URL doit commencer par `https://` (ou `http://` pour un serveur local)
- Testez l'accès : `curl -u login:pass https://votre-serveur/remote.php/dav/`

**"CalDAV introuvable" (404)**
- Vérifiez que l'app **Tasks** est activée dans Nextcloud
- Allez dans Administration → Applications et activez "Tasks"

**"Identifiants incorrects" (401)**
- Si la double authentification est activée, générez un mot de passe d'application depuis Paramètres → Sécurité

**"Aucune liste trouvée"**
- Créez au moins une liste depuis l'interface web Nextcloud (app Tasks)

**Build EAS échoue**
- Vérifiez que `android.package` dans `app.json` est unique
- Lancez `npx eas-cli@latest diagnostics`
- Consultez les logs complets sur [expo.dev](https://expo.dev)
