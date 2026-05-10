

export interface SalaryCategory {
    id: string;
    name: string;
    key: string; // unique identifier for the field
}

export interface PartTimeRates {
    weekdayRate: number;
    sundayRate: number;
}

export interface StaffSalarySupplement {
    staffId: string;
    supplements: Record<string, number>; // key: amount
}

const STORAGE_KEYS = {
    LOCATIONS: 'staff_management_locations',
    SALARY_CATEGORIES: 'staff_management_salary_categories',
    SALARY_SUPPLEMENTS: 'staff_management_salary_supplements',
    PART_TIME_RATES: 'staff_management_part_time_rates'
};

const DEFAULT_LOCATIONS = ['Big Shop', 'Small Shop', 'Godown'];

const DEFAULT_SALARY_CATEGORIES: SalaryCategory[] = [
    { id: 'basic', name: 'Basic Salary', key: 'basicSalary' },
    { id: 'incentive', name: 'Incentive', key: 'incentive' },
    { id: 'hra', name: 'HRA', key: 'hra' }
];

const DEFAULT_PART_TIME_RATES: PartTimeRates = {
    weekdayRate: 350,
    sundayRate: 400
};

export const settingsService = {
    // Locations - Now async/fetched from DB via locationService
    // We keep these for type compatibility but they should be replaced in components
    getLocations(): string[] {
        // Fallback for sync calls, but components should use locationService
        const stored = localStorage.getItem(STORAGE_KEYS.LOCATIONS);
        return stored ? JSON.parse(stored) : DEFAULT_LOCATIONS;
    },

    // Legacy method - components should use locationService directly
    addLocation(location: string): string[] {
        console.warn('Use locationService.addLocation instead');
        const locations = this.getLocations();
        if (!locations.includes(location)) {
            const newLocations = [...locations, location];
            localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(newLocations));
            return newLocations;
        }
        return locations;
    },

    // Legacy method - components should use locationService directly
    updateLocation(oldLocation: string, newLocation: string): string[] {
        console.warn('Use locationService.updateLocation instead');
        const locations = this.getLocations();
        const index = locations.indexOf(oldLocation);
        if (index !== -1) {
            const newLocations = [...locations];
            newLocations[index] = newLocation;
            localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(newLocations));
            return newLocations;
        }
        return locations;
    },

    deleteLocation(location: string): string[] {
        const locations = this.getLocations();
        const newLocations = locations.filter(l => l !== location);
        localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(newLocations));
        return newLocations;
    },

    // Salary Categories
    getSalaryCategories(): SalaryCategory[] {
        const stored = localStorage.getItem(STORAGE_KEYS.SALARY_CATEGORIES);
        return stored ? JSON.parse(stored) : DEFAULT_SALARY_CATEGORIES;
    },

    addSalaryCategory(name: string): SalaryCategory[] {
        const categories = this.getSalaryCategories();
        const key = name.toLowerCase().replace(/\s+/g, '_');

        if (!categories.find(c => c.key === key)) {
            const newCategory = { id: key, name, key };
            const newCategories = [...categories, newCategory];
            localStorage.setItem(STORAGE_KEYS.SALARY_CATEGORIES, JSON.stringify(newCategories));
            return newCategories;
        }
        return categories;
    },

    updateSalaryCategory(id: string, name: string): SalaryCategory[] {
        const categories = this.getSalaryCategories();
        const index = categories.findIndex(c => c.id === id);
        if (index !== -1) {
            const newCategories = [...categories];
            newCategories[index] = { ...newCategories[index], name };
            localStorage.setItem(STORAGE_KEYS.SALARY_CATEGORIES, JSON.stringify(newCategories));
            return newCategories;
        }
        return categories;
    },

    deleteSalaryCategory(id: string): SalaryCategory[] {
        // Don't allow deleting default categories
        if (['basic', 'incentive', 'hra'].includes(id)) {
            return this.getSalaryCategories();
        }

        const categories = this.getSalaryCategories();
        const newCategories = categories.filter(c => c.id !== id);
        localStorage.setItem(STORAGE_KEYS.SALARY_CATEGORIES, JSON.stringify(newCategories));
        return newCategories;
    },

    // Staff Salary Supplements
    getStaffSupplements(): StaffSalarySupplement[] {
        const stored = localStorage.getItem(STORAGE_KEYS.SALARY_SUPPLEMENTS);
        return stored ? JSON.parse(stored) : [];
    },

    updateStaffSupplement(staffId: string, supplements: Record<string, number>) {
        const allSupplements = this.getStaffSupplements();
        const index = allSupplements.findIndex(s => s.staffId === staffId);

        let newSupplements;
        if (index !== -1) {
            newSupplements = [...allSupplements];
            newSupplements[index] = { staffId, supplements };
        } else {
            newSupplements = [...allSupplements, { staffId, supplements }];
        }

        localStorage.setItem(STORAGE_KEYS.SALARY_SUPPLEMENTS, JSON.stringify(newSupplements));
        return newSupplements;
    },

    getStaffSupplement(staffId: string): Record<string, number> {
        const all = this.getStaffSupplements();
        const staffData = all.find(s => s.staffId === staffId);
        return staffData ? staffData.supplements : {};
    },

    // Part-Time Salary Rates
    getPartTimeRates(): PartTimeRates {
        const stored = localStorage.getItem(STORAGE_KEYS.PART_TIME_RATES);
        return stored ? JSON.parse(stored) : DEFAULT_PART_TIME_RATES;
    },

    updatePartTimeRates(rates: PartTimeRates): PartTimeRates {
        localStorage.setItem(STORAGE_KEYS.PART_TIME_RATES, JSON.stringify(rates));
        return rates;
    }
};
