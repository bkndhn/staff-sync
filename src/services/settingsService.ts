import { appSettingsService } from './appSettingsService';
import { DEFAULT_TDS_POLICY, setRuntimeTdsPolicy, type TdsPolicy } from '../utils/statutoryDeductions';

export interface PartTimeRates {
    weekdayRate: number;
    sundayRate: number;
}

const STORAGE_KEYS = {
    PART_TIME_RATES: 'staff_management_part_time_rates',
    REQUIRE_GEOFENCE: 'staff_management_require_geofence',
    PUNCTUALITY_POLICY: 'staff_management_punctuality_policy',
    TDS_POLICY: 'staff_management_tds_policy'
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
    },

    // Org-wide late / early punctuality deduction switches
    async getPunctualityPolicy(): Promise<PunctualityPolicySetting> {
        const stored = await appSettingsService.getSetting(STORAGE_KEYS.PUNCTUALITY_POLICY);
        if (!stored) return DEFAULT_PUNCTUALITY_POLICY;
        try {
            return { ...DEFAULT_PUNCTUALITY_POLICY, ...JSON.parse(stored) };
        } catch {
            return DEFAULT_PUNCTUALITY_POLICY;
        }
    },

    async setPunctualityPolicySetting(policy: PunctualityPolicySetting): Promise<void> {
        await appSettingsService.setSetting(STORAGE_KEYS.PUNCTUALITY_POLICY, JSON.stringify(policy));
    },

    /**
     * Income-tax (TDS) policy — each client decides whether TDS is deducted at
     * all and whether it follows the statutory slabs or a flat percentage.
     */
    async getTdsPolicy(): Promise<TdsPolicy> {
        const stored = await appSettingsService.getSetting(STORAGE_KEYS.TDS_POLICY);
        if (!stored) return { ...DEFAULT_TDS_POLICY };
        try {
            return { ...DEFAULT_TDS_POLICY, ...JSON.parse(stored) };
        } catch {
            return { ...DEFAULT_TDS_POLICY };
        }
    },

    async setTdsPolicy(policy: TdsPolicy): Promise<void> {
        await appSettingsService.setSetting(STORAGE_KEYS.TDS_POLICY, JSON.stringify(policy));
        setRuntimeTdsPolicy(policy);
    },

    /** Load the saved policy into the shared payroll runtime. Safe to call repeatedly. */
    async primeTdsPolicy(): Promise<TdsPolicy> {
        const policy = await this.getTdsPolicy();
        setRuntimeTdsPolicy(policy);
        return policy;
    }
};

