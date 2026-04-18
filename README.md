# 📱 Nextcloud Tasks

Application Android React Native (Expo) pour gérer vos tâches CalDAV Nextcloud.

---

## 🚀 Installation rapide

### Prérequis

- [Node.js](https://nodejs.org/) >= 18
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- Un compte [Expo](https://expo.dev/) (gratuit, pour le build APK)
- [EAS CLI](https://docs.expo.dev/eas/) : `npm install -g eas-cli`

### 1. Installer les dépendances

```bash
npm install
```

### 2. Lancer en développement

```bash
npx expo start
```

Scannez le QR code avec l'app **Expo Go** (Android/iOS) pour tester.

---

## 📦 Build APK Android

### Étape 1 — Se connecter à Expo

```bash
eas login
```

### Étape 2 — Configurer le projet

```bash
eas build:configure
```

### Étape 3 — Build APK (distributable)

```bash
eas build --platform android --profile preview
```

> Cela génère un fichier `.apk` installable directement sur Android (pas besoin du Play Store).

### Étape 4 — Build AAB (Play Store)

```bash
eas build --platform android --profile production
```

---

## 🔧 Configuration

### Changer le nom/package de l'app

Dans `app.json` :

```json
{
  "expo": {
    "name": "Mon App Tâches",
    "android": {
      "package": "com.mondomaine.tasks"
    }
  }
}
```

### Icône et splash screen

Remplacez `assets/icon.png` (1024×1024) et configurez `splash` dans `app.json`.

---

## 🗂 Structure du projet

```
app/                        ← Routes Expo Router
  _layout.tsx               ← Root layout + vérification auth
  index.tsx                 ← Écran de connexion
  (app)/
    _layout.tsx             ← Group layout (écrans authentifiés)
    home.tsx                ← Liste des task lists
    list/[id].tsx           ← Tâches d'une liste
    task/[taskUrl].tsx      ← Détail d'une tâche

src/
  services/
    authService.ts          ← Nextcloud Login v2 + SecureStore
    calDavService.ts        ← PROPFIND / REPORT / PUT / DELETE CalDAV
  screens/
    LoginScreen.tsx         ← Formulaire de connexion
    HomeScreen.tsx          ← Vue des listes
    TaskListScreen.tsx      ← Vue des tâches (filtres, ajout, toggle)
    TaskDetailScreen.tsx    ← Détail complet + édition statut
  store/
    appStore.ts             ← État global Zustand
  components/
    UI.tsx                  ← Button, Input, Card, Badge
  utils/
    theme.ts                ← Couleurs, espacements, rayons
```

---

## 🔐 Authentification Nextcloud

L'application utilise le **Nextcloud Login Flow v2** :

1. `POST /index.php/login/v2` → initiation, récupère token + endpoint de poll
2. Tentative d'auth avec user/pass via l'URL de login
3. Poll de `/login/v2/poll` pour obtenir un **app-password** (token d'accès dédié)
4. Fallback : vérification directe via PROPFIND CalDAV avec basic auth
5. Credentials stockés dans le **Keychain Android chiffré** (via `expo-secure-store`)

---

## ✅ Fonctionnalités

- [x] Connexion Nextcloud (Login v2 + fallback basic auth)
- [x] Stockage sécurisé des credentials (SecureStore)
- [x] Reconnexion automatique au lancement
- [x] Liste des task lists CalDAV (VTODO uniquement)
- [x] Affichage des tâches avec filtres (en cours / terminées / toutes)
- [x] Toggle complet/incomplet (mise à jour iCal via PUT)
- [x] Création de tâche (titre, description, priorité)
- [x] Suppression de tâche (DELETE CalDAV)
- [x] Détail d'une tâche (statut, priorité, échéance, catégories, timestamps)
- [x] Pull-to-refresh
- [x] Déconnexion sécurisée
- [x] Optimistic updates (UI réactive sans attendre le serveur)

---

## 📡 API CalDAV utilisée

| Opération | Méthode HTTP | Description |
|---|---|---|
| Lister les calendriers | `PROPFIND` Depth:1 | Récupère toutes les listes |
| Lister les tâches | `REPORT` | Filtre VTODO |
| Créer une tâche | `PUT` | Crée un fichier .ics |
| Modifier une tâche | `GET` + `PUT` | Lit, modifie, réécrit l'iCal |
| Supprimer une tâche | `DELETE` | Supprime le fichier .ics |

---

## 🐛 Dépannage

### "Impossible de contacter le serveur"
- Vérifiez l'URL (doit commencer par `https://`)
- Vérifiez que CalDAV est activé dans Nextcloud (Admin > Paramètres > Partage)
- Testez avec curl : `curl -u user:pass https://votre-serveur/remote.php/dav/`

### "Aucune liste trouvée"
- Créez au moins une liste dans l'app **Tasks** de Nextcloud
- Vérifiez que les permissions CalDAV sont actives

### Build échoue
- Vérifiez que le `package` Android dans `app.json` est unique
- Lancez `eas diagnostics` pour identifier le problème
