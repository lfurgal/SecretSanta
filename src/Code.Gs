/**
 * ==============================================================================
 * Secret Santa - Backend Google Apps Script
 * ==============================================================================
 * Ce script gère :
 * 1. Le service WebApp (doGet) avec configuration responsive et iframe.
 * 2. La récupération confidentielle des participants (zéro fuite d'état).
 * 3. Le tirage au sort concurrent et sécurisé (LockService, anti-blocage, idempotence).
 * 4. Les outils d'administration via menu personnalisé dans Google Sheets.
 */

/**
 * Point d'entrée de la Web App. Sert le fichier HTML Index.html.
 * Configure le viewport responsive pour mobile et autorise l'intégration iframe.
 *
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('🎅 Secret Santa')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Retourne la liste des noms des participants (sans aucune métadonnée d'état).
 * Garantit une confidentialité absolue : ni le statut "a déjà tiré", ni "est déjà sorti",
 * ni les cibles ne transitent sur le réseau.
 *
 * @returns {string[]} Liste ordonnée des prénoms non vides
 */
function getParticipants() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    return [];
  }

  // Lecture de la colonne A à partir de la ligne 2
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  
  return values
    .map(row => (row[0] ? String(row[0]).trim() : ''))
    .filter(name => name.length > 0);
}

/**
 * Effectue le tirage au sort pour un participant donné avec gestion de la concurrence,
 * garantie d'idempotence et algorithme anti-blocage.
 *
 * @param {string} nomParticipant - Prénom du participant qui effectue le tirage
 * @returns {{ ok: boolean, cible?: string, error?: string }}
 */
function tirerAuSort(nomParticipant) {
  if (!nomParticipant || typeof nomParticipant !== 'string' || !nomParticipant.trim()) {
    return { ok: false, error: 'Nom de participant invalide.' };
  }

  const nomCible = nomParticipant.trim();
  const lock = LockService.getScriptLock();

  try {
    // Verrouillage pour empêcher les conditions de course (race conditions)
    // En Apps Script, tryLock renvoie un booléen (true si acquis, false si timeout)
    const hasLock = lock.tryLock(10000);
    if (!hasLock) {
      return {
        ok: false,
        error: "Un autre tirage est en cours ou le serveur est temporairement sollicité. Veuillez réessayer dans quelques instants."
      };
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return { ok: false, error: "Aucun participant n'a été trouvé dans la feuille." };
    }

    // Récupération des colonnes A à D (Nom, A déjà tiré, Est déjà sorti, Cible)
    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();

    const participants = [];
    let joueurIndex = -1;

    for (let i = 0; i < data.length; i++) {
      const nom = data[i][0] ? String(data[i][0]).trim() : '';
      if (!nom) continue;

      const valB = data[i][1];
      const strB = String(valB || '').trim().toUpperCase();
      const aTire = (valB === true) || strB === 'OUI' || strB === 'TRUE' || strB === 'VRAI' || strB === 'X';

      const valC = data[i][2];
      const strC = String(valC || '').trim().toUpperCase();
      const estSorti = (valC === true) || strC === 'OUI' || strC === 'TRUE' || strC === 'VRAI' || strC === 'X';

      const cible = data[i][3] ? String(data[i][3]).trim() : '';

      const pObj = {
        rowIndex: i + 2, // Ligne dans la feuille Google Sheets
        nom: nom,
        aTire: aTire,
        estSorti: estSorti,
        cible: cible
      };

      participants.push(pObj);

      if (nom.toLowerCase() === nomCible.toLowerCase()) {
        joueurIndex = participants.length - 1;
      }
    }

    // Vérifier que le participant existe bien
    if (joueurIndex === -1) {
      return { ok: false, error: "Participant introuvable dans la liste." };
    }

    const joueur = participants[joueurIndex];

    // 1. IDEMPOTENCE : si le joueur a déjà tiré, on lui restitue directement son assignation
    // sans altérer l'état de la feuille.
    if (joueur.aTire && joueur.cible) {
      return { ok: true, cible: joueur.cible };
    }

    if (participants.length < 2) {
      return { ok: false, error: "Le Secret Santa nécessite au moins 2 participants." };
    }

    // 2. Identification des personnes n'ayant pas encore tiré
    const pasEncoreTire = participants.filter(p => !p.aTire);

    // 3. Filtrage des cibles admissibles :
    // - Pas soi-même
    // - Pas une personne déjà tirée (colonne C !== 'OUI')
    let candidats = participants.filter(p =>
      p.nom.toLowerCase() !== joueur.nom.toLowerCase() && !p.estSorti
    );

    if (candidats.length === 0) {
      return {
        ok: false,
        error: "Aucune cible éligible n'est disponible (tous les cadeaux ont déjà été attribués). Si vous souhaitez relancer une session, utilisez le menu '🎅 Secret Santa > Réinitialiser le tirage' dans la feuille."
      };
    }

    // 4. INVARIANT ANTI-BLOCAGE (Dernier joueur) :
    // S'il ne reste exactement que 2 joueurs n'ayant pas encore tiré (le joueur actuel et un autre)
    // et que cet autre joueur n'a pas encore été tiré au sort (estSorti === false),
    // on FORCE le tirage sur cet autre joueur.
    // Cela empêche mathématiquement que le tout dernier joueur à tirer ne se retrouve seul avec lui-même.
    if (pasEncoreTire.length === 2) {
      const autreJoueur = pasEncoreTire.find(p => p.nom.toLowerCase() !== joueur.nom.toLowerCase());
      if (autreJoueur && !autreJoueur.estSorti) {
        candidats = [autreJoueur];
      }
    }

    // 5. Tirage au sort pseudo-aléatoire uniforme parmi les candidats admissibles
    const randomIndex = Math.floor(Math.random() * candidats.length);
    const cibleChoisie = candidats[randomIndex];

    // 6. Enregistrement atomique dans Google Sheets
    // - Col B (ligne tireur) : 'OUI'
    // - Col D (ligne tireur) : Nom de la cible
    // - Col C (ligne cible)  : 'OUI'
    sheet.getRange(joueur.rowIndex, 2).setValue('OUI');
    sheet.getRange(joueur.rowIndex, 4).setValue(cibleChoisie.nom);
    sheet.getRange(cibleChoisie.rowIndex, 3).setValue('OUI');

    // Force la persistance immédiate des modifications
    SpreadsheetApp.flush();

    return {
      ok: true,
      cible: cibleChoisie.nom
    };

  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : "Une erreur inattendue est survenue."
    };
  } finally {
    // Libération garantie du verrou de script
    try {
      if (lock.hasLock()) {
        lock.releaseLock();
      }
    } catch (e) {
      // Ignore si le lock a déjà expiré ou été libéré
    }
  }
}

/**
 * Hook déclenché à l'ouverture du document Google Sheets.
 * Installe le menu d'administration Secret Santa.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎅 Secret Santa')
    .addItem('Initialiser la feuille', 'initialiserFeuille')
    .addItem('Réinitialiser le tirage', 'reinitialiserTirage')
    .addToUi();
}

/**
 * Initialise la feuille active avec les en-têtes requis, une mise en forme soignée
 * et fige la ligne supérieure.
 */
function initialiserFeuille() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const headers = [['Nom', 'A déjà tiré', 'Est déjà sorti', 'Cible']];

  // Définition des en-têtes
  const headerRange = sheet.getRange(1, 1, 1, 4);
  headerRange.setValues(headers);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#F3F4F6');
  headerRange.setFontColor('#111827');
  headerRange.setHorizontalAlignment('center');
  sheet.getRange(1, 1).setHorizontalAlignment('left');

  // Figer la première ligne
  sheet.setFrozenRows(1);

  // Largeurs de colonnes optimales
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 130);
  sheet.setColumnWidth(3, 130);
  sheet.setColumnWidth(4, 180);

  SpreadsheetApp.getUi().alert(
    'Initialisation terminée',
    'La feuille a été préparée avec succès !\n\nVous pouvez maintenant saisir la liste des prénoms dans la colonne A (à partir de la ligne 2).',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Réinitialise tous les tirages après confirmation de l'administrateur.
 * Conserve la liste des participants (colonne A) et efface les colonnes B, C et D.
 */
function reinitialiserTirage() {
  const ui = SpreadsheetApp.getUi();
  const confirmation = ui.alert(
    'Confirmation requise',
    'Voulez-vous vraiment réinitialiser tous les tirages ?\n\nCette action effacera définitivement les assignations actuelles (colonnes B, C et D). La liste des participants en colonne A sera conservée.',
    ui.ButtonSet.YES_NO
  );

  if (confirmation !== ui.Button.YES) {
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    // Effacer les données des colonnes B, C et D à partir de la ligne 2
    sheet.getRange(2, 2, lastRow - 1, 3).clearContent();
    SpreadsheetApp.flush();
  }

  ui.alert(
    'Tirage réinitialisé',
    'Tous les tirages ont été effacés. Le Secret Santa est prêt pour une nouvelle session !',
    ui.ButtonSet.OK
  );
}
