import React, { useState, useEffect } from 'react';
import { appSettingsService } from '../services/appSettingsService';
import { Layers, Check, X, ShieldAlert } from 'lucide-react';

export const FeatureTogglesPanel: React.FC = () => {
    const [features, setFeatures] = useState({
        payroll: true,
        biometrics: true,
        statutory: true,
        accommodation: true
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadFeatures = async () => {
            setLoading(true);
            const [payroll, biometrics, statutory, accommodation] = await Promise.all([
                appSettingsService.getEnablePayrollModule(),
                appSettingsService.getEnableBiometricsModule(),
                appSettingsService.getEnableStatutoryCompliance(),
                appSettingsService.getEnableAccommodationTracking()
            ]);
            setFeatures({ payroll, biometrics, statutory, accommodation });
            setLoading(false);
        };
        loadFeatures();
    }, []);

    const toggleFeature = async (key: keyof typeof features, enabled: boolean) => {
        const newFeatures = { ...features, [key]: enabled };
        setFeatures(newFeatures);
        
        switch (key) {
            case 'payroll': await appSettingsService.setEnablePayrollModule(enabled); break;
            case 'biometrics': await appSettingsService.setEnableBiometricsModule(enabled); break;
            case 'statutory': await appSettingsService.setEnableStatutoryCompliance(enabled); break;
            case 'accommodation': await appSettingsService.setEnableAccommodationTracking(enabled); break;
        }
    };

    if (loading) return <div className="text-white/50 text-sm">Loading feature toggles...</div>;

    const FeatureToggle = ({ title, description, flagKey }: { title: string, description: string, flagKey: keyof typeof features }) => {
        const isEnabled = features[flagKey];
        return (
            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)]">
                <div className="flex-1 pr-4">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">{description}</p>
                </div>
                <button
                    onClick={() => toggleFeature(flagKey, !isEnabled)}
                    className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${isEnabled ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-white/20'}`}
                >
                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-0'} flex items-center justify-center`}>
                        {isEnabled ? <Check size={10} className="text-emerald-500" /> : <X size={10} className="text-gray-400" />}
                    </div>
                </button>
            </div>
        );
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-600 dark:text-amber-400 text-xs">
                <ShieldAlert size={16} className="shrink-0" />
                <p><strong>Super Admin Only:</strong> Disabling a module hides its associated fields and tables globally. No data is deleted.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FeatureToggle 
                    title="Payroll Module" 
                    description="Enable salary calculations, hikes, advances, and payroll reporting." 
                    flagKey="payroll" 
                />
                <FeatureToggle 
                    title="Biometrics & Kiosk" 
                    description="Enable facial recognition kiosk settings and anti-spoofing controls." 
                    flagKey="biometrics" 
                />
                <FeatureToggle 
                    title="Statutory Compliance" 
                    description="Enable PF, ESI tracking, and statutory deduction fields." 
                    flagKey="statutory" 
                />
                <FeatureToggle 
                    title="Accommodation Tracking" 
                    description="Enable fields for staff housing and accommodation allowances." 
                    flagKey="accommodation" 
                />
            </div>
        </div>
    );
};
export default FeatureTogglesPanel;
