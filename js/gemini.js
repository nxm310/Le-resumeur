class GeminiService {
  constructor() {
    this.modelName = 'gemini-2.5-flash';
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
}

// Export as global
window.geminiService = new GeminiService();
