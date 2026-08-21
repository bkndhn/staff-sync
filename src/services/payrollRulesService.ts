import { supabase as supabaseTyped } from '../lib/supabase';

// `payroll_rules` is not present in the generated Supabase types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseTyped as any;

export const payrollRulesService = {
  async getPayrollRules(): Promise<Record<string, string>> {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return {};

      const { data, error } = await supabase
        .from('payroll_rules')
        .select('rule_key, expression');

      if (error) {
        console.error('Error fetching payroll rules:', error);
        return {};
      }

      const rules: Record<string, string> = {};
      if (data) {
        data.forEach((rule: any) => {
          rules[rule.rule_key] = rule.expression;
        });
      }
      return rules;
    } catch (err) {
      console.error('Failed to fetch payroll rules:', err);
      return {};
    }
  },

  async savePayrollRule(rule_key: string, expression: string, description?: string): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    
    // Get tenant ID
    const { data: tenantData } = await supabase
      .from('app_users')
      .select('tenant_id')
      .eq('auth_id', userData.user.id)
      .single();
      
    if (!tenantData?.tenant_id) return;

    if (!expression || expression.trim() === '') {
       // Delete the rule if it's empty
       await supabase
         .from('payroll_rules')
         .delete()
         .eq('tenant_id', tenantData.tenant_id)
         .eq('rule_key', rule_key);
       return;
    }

    const { error } = await supabase
      .from('payroll_rules')
      .upsert({
        tenant_id: tenantData.tenant_id,
        rule_key,
        expression,
        description,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id, rule_key' });

    if (error) {
      console.error('Error saving payroll rule:', error);
      throw error;
    }
  }
};
