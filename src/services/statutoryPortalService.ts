import { dataApi } from '../lib/dataApi';

export interface StatutoryPortalConfig {
  id?: string;
  visiblePages: {
    dashboard: boolean;
    staff: boolean;
    attendance: boolean;
    salary: boolean;
    reports: boolean;
    leave: boolean;
    profile: boolean;
    settings: boolean;
    action_center: boolean;
  };
  dashboardWidgets: {
    staffCount: boolean;
    attendance: boolean;
    salary: boolean;
    breaks: boolean;
    charts: boolean;
    recentActivity: boolean;
    quickActions: boolean;
  };
  dataVisibility: {
    salary: boolean;
    attendance: boolean;
    contact: boolean;
    employeeId: boolean;
    department: boolean;
    designation: boolean;
    documents: boolean;
    leave: boolean;
  };
}

export const DEFAULT_STATUTORY_CONFIG: StatutoryPortalConfig = {
  visiblePages: {
    dashboard: true, staff: true, attendance: true, salary: true,
    reports: false, leave: false, profile: false, settings: false, action_center: false,
  },
  dashboardWidgets: {
    staffCount: true, attendance: true, salary: true,
    breaks: false, charts: true, recentActivity: true, quickActions: true,
  },
  dataVisibility: {
    salary: true, attendance: true, contact: true, employeeId: true,
    department: true, designation: true, documents: true, leave: true,
  },
};

// All reads/writes go through the session-validated data-api edge function.
// Direct anon writes to statutory_portal_config are blocked by RLS — only
// admin sessions can mutate the row.
export const statutoryPortalService = {
  async load(): Promise<StatutoryPortalConfig> {
    try {
      const { data } = await dataApi
        .from('statutory_portal_config')
        .select('id, visible_pages, dashboard_widgets, data_visibility')
        .limit(1)
        .maybeSingle();
      if (data) {
        const cfg: StatutoryPortalConfig = {
          id: (data as any).id,
          visiblePages: { ...DEFAULT_STATUTORY_CONFIG.visiblePages, ...((data as any).visible_pages || {}) },
          dashboardWidgets: { ...DEFAULT_STATUTORY_CONFIG.dashboardWidgets, ...((data as any).dashboard_widgets || {}) },
          dataVisibility: { ...DEFAULT_STATUTORY_CONFIG.dataVisibility, ...((data as any).data_visibility || {}) },
        };
        return cfg;
      }
    } catch (err) {
      console.warn('statutoryPortalService.load failed, using defaults', err);
    }
    return DEFAULT_STATUTORY_CONFIG;
  },

  // Removed loadCached, components should await load()
  async loadCached(): Promise<StatutoryPortalConfig> {
    return this.load();
  },

  async save(cfg: StatutoryPortalConfig): Promise<StatutoryPortalConfig> {
    const payload = {
      visible_pages: cfg.visiblePages,
      dashboard_widgets: cfg.dashboardWidgets,
      data_visibility: cfg.dataVisibility,
    };
    if (cfg.id) {
      await dataApi.from('statutory_portal_config').update(payload).eq('id', cfg.id);
    } else {
      const { data } = await dataApi
        .from('statutory_portal_config')
        .insert(payload)
        .select()
        .single();
      if (data) cfg.id = (data as any).id;
    }
    return cfg;
  },
};
