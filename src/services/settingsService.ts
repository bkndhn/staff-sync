import { appSettingsService } from './appSettingsService';

export interface PartTimeRates {
    weekdayRate: number;
    sundayRate: number;
}

const STORAGE_KEYS = {
    PART_TIME_RATES: 'staff_management_part_time_rates',
    REQUIRE_GEOFENCE: 'staff_management_require_geofence',
    PUNCTUALITY_POLICY: 'staff_management_punctuality_policy'
};

export interface PunctualityPolicySetting {
    disableLateDeductionForAll: boolean;
    disableEarlyDeductionForAll: boolean;
}

export const DEFAULT_PUNCTUALITY_POLICY: PunctualityPolicySetting = {
    disableLateDeductionForAll: false,
    disableEarlyDeductionForAll: false
};


export const DEFAULT_PART_TIME_RATES: PartTimeRates = {
    weekdayRate: 350,
    sundayRate: 400
};

export const settingsService = {
    // Flex Payroll Rates
    async getPartTimeRates(): Promise<PartTimeRates> {
        const stored = await appSettingsService.getSetting(STORAGE_KEYS.PART_TIME_RATES);
        return stored ? JSON.parse(stored) : DEFAULT_PART_TIME_RATES;
    },

    async updatePartTimeRates(rates: PartTimeRates): Promise<PartTimeRates> {
        await appSettingsService.setSetting(STORAGE_KEYS.PART_TIME_RATES, JSON.stringify(rates));
        return rates;
    },

    async getRequireGeofence(): Promise<boolean> {
        const stored = await appSettingsService.getSetting(STORAGE_KEYS.REQUIRE_GEOFENCE);
        return stored ? JSON.parse(stored) : false;
    },

    async setRequireGeofence(require: boolean): Promise<void> {
        await appSettingsService.setSetting(STORAGE_KEYS.REQUIRE_GEOFENCE, JSON.stringify(require));
    }
};
