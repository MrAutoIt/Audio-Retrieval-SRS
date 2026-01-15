export interface Settings {
  daily_reset_time: string; // HH:MM format, e.g., "04:00"
  timezone?: string; // Optional fixed timezone (IANA timezone), defaults to device local
  box_intervals: number[]; // Days for each box level
  extra_seconds: number; // Extra seconds added to response window
  onboarding_completed: boolean;
  current_language: string; // ISO 639-1 language code, e.g., "hu", "es", "fr"
}

export const DEFAULT_SETTINGS: Settings = {
  daily_reset_time: '04:00',
  timezone: undefined, // Device local by default
  box_intervals: [1, 2, 4, 8, 16, 30],
  extra_seconds: 2.0,
  onboarding_completed: false,
  current_language: 'hu', // Default to Hungarian
};

export function createSettings(overrides?: Partial<Settings>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
}

export function validateSettings(settings: Partial<Settings>): Settings {
  const dailyResetTime = settings.daily_reset_time || DEFAULT_SETTINGS.daily_reset_time;
  
  // Validate HH:MM format
  if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(dailyResetTime)) {
    throw new Error(`Invalid daily_reset_time format: ${dailyResetTime}. Expected HH:MM format.`);
  }

  return {
    daily_reset_time: dailyResetTime,
    timezone: settings.timezone,
    box_intervals: settings.box_intervals || DEFAULT_SETTINGS.box_intervals,
    extra_seconds: settings.extra_seconds ?? DEFAULT_SETTINGS.extra_seconds,
    onboarding_completed: settings.onboarding_completed ?? DEFAULT_SETTINGS.onboarding_completed,
    current_language: settings.current_language || DEFAULT_SETTINGS.current_language,
  };
}
