'use client';

import { useEffect, useState } from 'react';
import { getStorage } from '@/lib/storage';
import { Settings, DEFAULT_SETTINGS } from '@audio-retrieval-srs/core';

// Common language codes with display names
const LANGUAGES: Array<{ code: string; name: string }> = [
  { code: 'hu', name: 'Hungarian' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'cs', name: 'Czech' },
];

interface LanguageSwitcherProps {
  onLanguageChange?: (languageCode: string) => void;
}

export default function LanguageSwitcher({ onLanguageChange }: LanguageSwitcherProps) {
  const [currentLanguage, setCurrentLanguage] = useState<string>('hu');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurrentLanguage();
  }, []);

  async function loadCurrentLanguage() {
    const storage = getStorage();
    const settings = await storage.getSettings() || DEFAULT_SETTINGS;
    setCurrentLanguage(settings.current_language || 'hu');
    setLoading(false);
  }

  async function handleLanguageChange(newLanguage: string) {
    const storage = getStorage();
    const settings = await storage.getSettings() || DEFAULT_SETTINGS;
    
    const updated: Settings = {
      ...settings,
      current_language: newLanguage,
    };
    
    await storage.saveSettings(updated);
    setCurrentLanguage(newLanguage);
    
    // Trigger page reload to update all views
    if (onLanguageChange) {
      onLanguageChange(newLanguage);
    } else {
      // Default: reload the page
      window.location.reload();
    }
  }

  const currentLanguageName = LANGUAGES.find(l => l.code === currentLanguage)?.name || currentLanguage;

  if (loading) {
    return <div className="text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-gray-700">Language:</label>
      <select
        value={currentLanguage}
        onChange={(e) => handleLanguageChange(e.target.value)}
        className="px-3 py-1 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {LANGUAGES.map(lang => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </select>
      <span className="text-sm text-gray-500">({currentLanguageName})</span>
    </div>
  );
}
