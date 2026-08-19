import { appSettingsService } from './appSettingsService';

/**
 * Tenant self-onboarding state.
 *
 * Stored in `app_settings` (tenant-scoped by the stamp_tenant_id trigger) so a
 * fresh client sees the guided wizard until they finish or skip it.
 */

const KEYS = {
  STATE: 'onboarding_state',
  BRANDING: 'org_branding',
};

export interface OrgBranding {
  orgName: string;
  tagline: string;
  primaryColor: string;
  logoUrl: string;
}

export const DEFAULT_BRANDING: OrgBranding = {
  orgName: '',
  tagline: '',
  primaryColor: '#2563eb',
  logoUrl: '',
};

export interface OnboardingState {
  /** Wizard finished or explicitly skipped — don't auto-open again. */
  completed: boolean;
  /** Last step index the user reached (0-based). */
  step: number;
  /** Steps the user has marked done. */
  done: string[];
}

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  completed: false,
  step: 0,
  done: [],
};

export const onboardingService = {
  async getState(): Promise<OnboardingState> {
    const raw = await appSettingsService.getSetting(KEYS.STATE);
    if (!raw) return { ...DEFAULT_ONBOARDING_STATE };
    try {
      return { ...DEFAULT_ONBOARDING_STATE, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_ONBOARDING_STATE };
    }
  },

  async saveState(state: Partial<OnboardingState>): Promise<OnboardingState> {
    const current = await this.getState();
    const next = { ...current, ...state };
    await appSettingsService.setSetting(KEYS.STATE, JSON.stringify(next));
    return next;
  },

  async complete(): Promise<void> {
    await this.saveState({ completed: true });
  },

  async reset(): Promise<void> {
    await appSettingsService.setSetting(
      KEYS.STATE,
      JSON.stringify({ ...DEFAULT_ONBOARDING_STATE })
    );
  },

  async getBranding(): Promise<OrgBranding> {
    const raw = await appSettingsService.getSetting(KEYS.BRANDING);
    if (!raw) return { ...DEFAULT_BRANDING };
    try {
      return { ...DEFAULT_BRANDING, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_BRANDING };
    }
  },

  async saveBranding(branding: OrgBranding): Promise<OrgBranding> {
    await appSettingsService.setSetting(KEYS.BRANDING, JSON.stringify(branding));
    applyBranding(branding);
    return branding;
  },
};

/** Apply branding to the live document (title + accent colour). */
export const applyBranding = (branding: OrgBranding) => {
  try {
    if (branding.orgName) document.title = `${branding.orgName} — Workforce`;
    if (branding.primaryColor) {
      document.documentElement.style.setProperty('--brand-accent', branding.primaryColor);
    }
  } catch {
    /* non-fatal */
  }
};
