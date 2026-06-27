class GeminiService {
  constructor() {
    this.modelName = 'gemini-2.5-flash';
    this.lastRequestTime = 0;
    this.minDelayMs = 4500; // Force a 4.5s delay between requests to stay under 15 RPM
  }

  async _throttle() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minDelayMs) {
      const waitTime = this.minDelayMs - elapsed;
      console.log(`Rate Limiter : attente de ${waitTime}ms pour respecter les quotas Gemini...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }

  getApiKey() {
    return localStorage.getItem('gemini_api_key') || '';
  }

  setApiKey(key) {
    if (!key) {
      localStorage.removeItem('gemini_api_key');
    } else {
      localStorage.setItem('gemini_api_key', key.trim());
    }
  }

  hasApiKey() {
    const key = this.getApiKey();
    return key.length > 10;
  }

  async validateKey(testKey) {
    const apiKey = testKey ? testKey.trim() : this.getApiKey();
    if (!apiKey) return false;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ parts: [{ text: 'Bonjour' }] }],
        generationConfig: { maxOutputTokens: 10 }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const data = await response.json();
      return !!(data.candidates && data.candidates[0]);
    } catch (e) {
      console.error('API key validation failed:', e);
      return false;
    }
  }

  async generateSummary(newContent, oldContent = '', customPrompt = '') {
    await this._throttle();
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Clé API Gemini manquante. Veuillez la configurer dans les réglages.');
    }

    let prompt = '';
    if (oldContent && oldContent.trim() !== '') {
      // Diff summary
      prompt = customPrompt || this.getDefaultDiffPrompt();
      prompt = prompt
        .replace('[OLD_CONTENT]', this.truncateContent(oldContent))
        .replace('[NEW_CONTENT]', this.truncateContent(newContent));
    } else {
      // First look summary
      prompt = this.getDefaultInitialPrompt()
        .replace('[NEW_CONTENT]', this.truncateContent(newContent));
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.95,
          maxOutputTokens: 2048
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `Erreur HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      } else {
        throw new Error("L'API Gemini a retourné une réponse vide.");
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      throw error;
    }
  }

  async extractItems(newContent) {
    await this._throttle();
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Clé API Gemini manquante. Veuillez la configurer dans les réglages.');
    }

    const prompt = this.extractItemsPrompt(newContent);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `Erreur HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        const jsonText = data.candidates[0].content.parts[0].text;
        const parsed = JSON.parse(jsonText);
        if (Array.isArray(parsed)) {
          // Sort extracted items by timestamp descending (most recent first)
          parsed.sort((a, b) => {
            if (a.timestamp === null) return 1;
            if (b.timestamp === null) return -1;
            return b.timestamp - a.timestamp;
          });
          return parsed;
        } else {
          throw new Error("L'API n'a pas retourné un tableau JSON valide.");
        }
      } else {
        throw new Error("L'API Gemini a retourné une réponse d'extraction vide.");
      }
    } catch (error) {
      console.error('Error extracting items:', error);
      throw error;
    }
  }

  async generateConsolidatedSummary(selectedItems) {
    await this._throttle();
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Clé API Gemini manquante. Veuillez la configurer dans les réglages.');
    }

    const prompt = this.consolidatedSummaryPrompt(selectedItems);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          topP: 0.95,
          maxOutputTokens: 2048
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `Erreur HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      } else {
        throw new Error("L'API Gemini a retourné une réponse de synthèse vide.");
      }
    } catch (error) {
      console.error('Error generating consolidated summary:', error);
      throw error;
    }
  }

  truncateContent(text, maxChars = 25000) {
    if (text.length <= maxChars) return text;
    return text.substring(0, maxChars) + '\n\n[...Contenu tronqué en raison des limites de taille...]';
  }

  getDefaultDiffPrompt() {
    return `Tu es un assistant de veille technologique expert nommé "Le Résumeur".
On te fournit le contenu textuel précédent d'une page web et son nouveau contenu après une mise à jour.
Ton travail consiste à analyser la différence entre les deux versions et de rédiger un résumé clair, structuré et synthétique (en Français) décrivant uniquement ce qui a changé, ce qui est nouveau et pourquoi c'est important.

Ne résume pas toute la page, concentre-toi uniquement sur les modifications. Ignore les changements de structure, de menus, de pieds de page, de compteurs de likes ou de dates de mise à jour techniques (sauf s'ils indiquent un changement de version majeur).

Format de réponse attendu (utilise du Markdown propre et lisible) :
🎯 **Résumé rapide** : Une seule phrase résumant l'évolution majeure.
🆕 **Changements clés** :
- Liste à puces détaillant chaque nouveauté importante ou suppression notable.
💡 **Impact / Intérêt** : Pourquoi cette modification est intéressante pour la veille technologique.

---
Ancien contenu de la page :
"""
[OLD_CONTENT]
"""

Nouveau contenu de la page :
"""
[NEW_CONTENT]
"""`;
  }

  getDefaultInitialPrompt() {
    return `Tu es un assistant de veille technologique expert nommé "Le Résumeur".
On te fournit le contenu textuel d'une nouvelle page ajoutée à la surveillance.
Rédige un aperçu initial clair, structuré et synthétique de cette page en Français.

Format de réponse attendu (utilise du Markdown propre et lisible) :
📌 **Aperçu général** : Quel est le sujet principal de la page ?
🔑 **Points clés surveillés** :
- Liste à puces des principaux sujets, produits ou actualités affichés sur cette page.
⚙️ **Prêt pour la veille** : Une brève phrase indiquant le type de changements à surveiller en priorité sur cette page.

---
Contenu de la page :
"""
[NEW_CONTENT]
"""`;
  }

  extractItemsPrompt(newContent) {
    return `Tu es un extracteur d'informations de veille expert. 
Analyse le contenu textuel de la page web ci-dessous et extrait tous les articles individuels, comptes-rendus de séances, actualités, annonces ou publications listés.
Pour chaque élément trouvé, extrait :
- Le titre ou l'objet de l'élément (ex: "Séance du conseil municipal du 25 mai 2026").
- La date de publication (ex: "25 mai 2026"). Si la date précise n'est pas indiquée, estime le mois et l'année d'après le contexte (l'année actuelle est 2026).
- Un court résumé de 1 à 2 sentences décrivant le contenu ou les décisions prises pour cet élément.
- Un timestamp Unix estimé en millisecondes correspondant à la date de l'élément. Par exemple, le 25 mai 2026 correspondrait à 1779667200000. Si l'élément date de 2025, estime à mi-année ou au jour près si possible. Si aucune date n'est trouvable, mets null.

Format de sortie requis : Vous devez renvoyer UNIQUEMENT un tableau JSON d'objets. Chaque objet doit suivre exactement ce schéma :
[
  {
    "title": "Titre de l'élément",
    "date": "Date lisible",
    "summary": "Résumé succinct de l'élément",
    "timestamp": 1779667200000 // ou null
  }
]

Contenu de la page :
"""
${this.truncateContent(newContent)}
"""`;
  }

  consolidatedSummaryPrompt(selectedItems) {
    const itemsList = selectedItems.map((item, idx) => {
      return `[Élément #${idx + 1}]
Titre : ${item.title}
Date : ${item.date}
Résumé de base : ${item.summary}`;
    }).join('\n\n');

    return `Tu es un assistant de veille technologique et administrative expert nommé "Le Résumeur".
L'utilisateur a sélectionné plusieurs actualités, comptes-rendus ou publications issues de sa veille pour en obtenir une synthèse globale de cette sélection.
Rédige un rapport de synthèse clair, structuré et bien rédigé en Français, basé uniquement sur les éléments fournis ci-dessous.

Regroupe les informations de manière logique (par thématique, importance ou chronologiquement) pour en faire un compte-rendu fluide et agréable à lire. Évite de simplement lister à nouveau les éléments, fais-en une véritable synthèse croisée.

Éléments sélectionnés :
${itemsList}

Format de rapport de synthèse attendu (utilise du Markdown propre et professionnel) :
# 📋 Synthèse Personnalisée de la Veille
*Générée le ${new Date().toLocaleDateString('fr-FR')}*

## 🎯 Aperçu de la Sélection
Un résumé global en 2-3 phrases sur les thèmes dominants de cette sélection.

## 🔍 Analyse & Points Clés
Une analyse détaillée des éléments sélectionnés, regroupée par thèmes majeurs ou par pertinence. Utilisez des sous-titres, du texte en gras et des listes à puces pour structurer.

## 💡 Enseignements & Impact
Quel est l'impact global de ces informations ? Quels sont les points de vigilance ou les actions à mener ?`;
  }
}

// Export as global
window.geminiService = new GeminiService();
