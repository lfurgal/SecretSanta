# 🎅 Secret Santa – Google Apps Script & Google Sheets

Application web légère, sécurisée et responsive de **Secret Santa**, conçue pour s'exécuter entièrement dans l'écosystème Google (Backend serverless **Google Apps Script**, base de données **Google Sheets**).

---

## 🌟 Points Forts & Garanties Techniques

### 1. Concurrence & Atomicité (`LockService`)
Lors d'un événement Secret Santa, plusieurs participants cliquent souvent au même moment. Le script utilise `LockService.getScriptLock()` avec une tentative d'acquisition jusqu'à 10 secondes (`tryLock(10000)`). Les tirages sont traités de manière strictement séquentielle et atomique, avec persistance immédiate (`SpreadsheetApp.flush()`) et libération garantie du verrou dans un bloc `finally`.

### 2. Algorithme Anti-blocage (Invariant des 2 derniers joueurs)
Dans un tirage séquentiel classique, le dernier participant peut se retrouver bloqué s'il ne reste que son propre nom comme cible disponible.
Notre algorithme surveille le nombre de participants n'ayant pas encore tiré :
> **Règle anti-blocage :** Dès qu'il ne reste exactement que 2 participants n'ayant pas encore tiré (`pasEncoreTire.length === 2`), si l'autre joueur n'a pas encore été tiré au sort, le tirage en cours est **forcé** sur cet autre joueur.
> Cela garantit mathématiquement que le dernier participant aura toujours une cible différente de lui-même.

### 3. Zéro fuite d'état (Confidentialité stricte)
La fonction `getParticipants()` ne renvoie qu'un tableau de chaînes de caractères brutes (`string[]`). Aucune information sur le statut de tirage (« A déjà tiré » ou « Est déjà sorti ») n'est envoyée dans l'UI ni dans les payloads réseau. Tous les prénoms s'affichent de façon strictement identique dans le menu déroulant.

### 4. Idempotence
Si un participant sélectionne à nouveau son nom ou rafraîchit la page après avoir tiré, le backend détecte sa cible existante en colonne D et la lui retourne directement, sans relancer de tirage ni modifier les données de la feuille.

---

## 📁 Structure du Projet

```text
secret-santa-apps-script/
├── README.md           # Documentation technique et guide de déploiement
├── .gitignore          # Fichiers ignorés par Git (clasp, OS, logs)
├── appsscript.json     # Manifeste Apps Script (V8, fuseau horaire, droits WebApp)
└── src/
    ├── Code.gs         # Backend Apps Script (API, verrou, logique métier, menu)
    └── Index.html      # Frontend WebApp (HTML5, CSS3 fluide, JS vanilla)
```

---

## 📊 Modèle de Données (Google Sheets)

La feuille active sert de base de données relationnelle légère :

| Colonne | En-tête | Description |
| :--- | :--- | :--- |
| **A** | `Nom` | Prénom du participant (saisi manuellement à partir de la ligne 2) |
| **B** | `A déjà tiré` | Rempli automatiquement par `OUI` dès que le joueur a validé son tirage |
| **C** | `Est déjà sorti` | Rempli automatiquement par `OUI` dès qu'un cadeau lui a été attribué |
| **D** | `Cible` | Prénom du destinataire attribué au tireur |

Un menu personnalisé **🎅 Secret Santa** est automatiquement injecté dans l'interface Google Sheets (`onOpen`) :
- **Initialiser la feuille** : génère les en-têtes, applique le formatage en gras et fige la ligne 1.
- **Réinitialiser le tirage** : demande une confirmation explicite puis vide les colonnes B, C et D pour relancer un événement tout en conservant la liste des noms.

---

## 🚀 Mise en Place & Déploiement

### Méthode 1 : Copier-coller dans Google Sheets (Rapide)

1. Ouvrez ou créez une feuille de calcul sur [Google Sheets](https://sheets.google.com).
2. Cliquez sur le menu **Extensions > Apps Script**.
3. Dans l'éditeur Apps Script :
   - Remplacez le contenu de `Code.gs` par celui de [`src/Code.gs`](file:///c:/Users/lucaf/Documents/BDX/1A/app/secret-santa-apps-script/src/Code.gs).
   - Créez un fichier HTML nommé `Index` (+ > HTML) et collez-y le contenu de [`src/Index.html`](file:///c:/Users/lucaf/Documents/BDX/1A/app/secret-santa-apps-script/src/Index.html).
   - Activez l'affichage du fichier manifeste dans les paramètres du projet (*Afficher le fichier manifeste « appsscript.json » dans l'éditeur*) et mettez à jour [`appsscript.json`](file:///c:/Users/lucaf/Documents/BDX/1A/app/secret-santa-apps-script/appsscript.json).
4. Retournez sur votre feuille Google Sheets, rechargez la page, et utilisez le menu **🎅 Secret Santa > Initialiser la feuille**.
5. Renseignez les prénoms de vos invités dans la colonne A (lignes 2, 3, 4, ...).

### Méthode 2 : Déploiement en ligne de commande via `clasp`

Si vous utilisez l'outil officiel de Google [`@google/clasp`](https://github.com/google/clasp) :

```bash
# 1. Connexion à Google
npx @google/clasp login

# 2. Cloner ou associer votre projet Sheets existant
npx @google/clasp clone <VOTRE_SCRIPT_ID> --rootDir .

# 3. Pousser les fichiers locaux vers Apps Script
npx @google/clasp push
```

### Déploiement en Application Web

1. Dans l'éditeur Google Apps Script, cliquez sur le bouton bleu **Déployer > Nouveau déploiement**.
2. Cliquez sur l'icône d'engrenage ⚙️ et sélectionnez **Application Web**.
3. Configurez les options :
   - **Description** : `Version 1.0 - Secret Santa`
   - **Exécuter en tant que** : `Moi (votre adresse email)`
   - **Qui a accès** : `Tout le monde` (*Anyone*)
4. Cliquez sur **Déployer**, validez les autorisations Google si demandé.
5. Copiez l'**URL de l'application Web** générée et partagez-la aux participants !

---

## 💻 Commandes Git pour Initialiser et Pousser

Depuis le dossier `secret-santa-apps-script/` :

```bash
# Se placer dans le dossier du projet
cd secret-santa-apps-script

# Initialiser le dépôt git local
git init

# Ajouter les fichiers
git add .

# Créer le premier commit
git commit -m "feat: initial commit Secret Santa web app for Google Apps Script"

# Renommer la branche principale en main
git branch -M main

# Associer votre dépôt distant GitHub
git remote add origin https://github.com/<votre-utilisateur>/<votre-depot>.git

# Pousser sur GitHub
git push -u origin main
```

---

## 📱 Compatibilité Mobile & UX

- **Responsive Design** : optimisé pour smartphones et PC (mise en page sur `100dvh`, carte centrée `max-width: 440px`).
- **Prévention du zoom iOS** : taille de police minimale fixée à `16px` sur le `<select>` et le `<button>` pour éliminer le zoom automatique forcé de Safari iOS.
- **Sécurisation anti-double-clic** : désactivation immédiate du bouton et affichage d'un spinner pendant l'exécution serveur.
- **Ambiance festive épurée** : design moderne avec micro-animations et flocons en CSS pur, zéro dépendance externe ni police distante.
