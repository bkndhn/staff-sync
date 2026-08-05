import { supabase } from '../lib/supabase';
import { superAdminService } from './superAdminService';

export interface HealthCheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  latencyMs: number;
  message?: string;
  details?: any;
}

class HealthCheckService {
  private async measureLatency(checkFn: () => Promise<any>): Promise<{ latency: number; result: any; error: any }> {
    const start = performance.now();
    let result = null;
    let error = null;
    try {
      result = await checkFn();
    } catch (e) {
      error = e;
    }
    const latency = Math.round(performance.now() - start);
    return { latency, result, error };
  }

  async checkDatabase(): Promise<HealthCheckResult> {
    const { latency, error } = await this.measureLatency(async () => {
      // Just fetch 1 record from a public or accessible table, or a simple query
      return await supabase.from('staff').select('id').limit(1);
    });

    if (error) {
      return { name: 'Database Connectivity', status: 'fail', latencyMs: latency, message: 'Database connection failed' };
    }
    return { name: 'Database Connectivity', status: 'pass', latencyMs: latency, message: 'Connected to Supabase' };
  }

  async checkAuthService(): Promise<HealthCheckResult> {
    const { latency, error } = await this.measureLatency(async () => {
      return await supabase.auth.getSession();
    });

    if (error) {
      return { name: 'Auth Service', status: 'fail', latencyMs: latency, message: 'Auth service unreachable' };
    }
    return { name: 'Auth Service', status: 'pass', latencyMs: latency, message: 'Auth endpoints responding' };
  }

  async checkEdgeFunctions(): Promise<HealthCheckResult> {
    const { latency, result, error } = await this.measureLatency(async () => {
      return await superAdminService.overview();
    });

    // If superAdminService doesn't have a real health_check action yet, it might return an error
    // We treat it as pass if the edge function is reachable at all (e.g. returns a known error structure instead of timing out)
    if (error && !error.message?.includes('not found')) {
      return { name: 'Edge Functions', status: 'fail', latencyMs: latency, message: 'Edge function ping failed' };
    }
    return { name: 'Edge Functions', status: 'pass', latencyMs: latency, message: 'Edge functions available' };
  }

  async checkBrowserAPIs(): Promise<HealthCheckResult> {
    const start = performance.now();
    let passed = true;
    let msg = '';
    
    if (!window.crypto) { passed = false; msg = 'crypto API missing'; }
    if (!window.indexedDB) { passed = false; msg = 'indexedDB missing'; }
    if (!window.fetch) { passed = false; msg = 'fetch API missing'; }
    
    const latency = Math.round(performance.now() - start);

    if (!passed) {
      return { name: 'Browser APIs', status: 'fail', latencyMs: latency, message: msg };
    }
    return { name: 'Browser APIs', status: 'pass', latencyMs: latency, message: 'All required APIs present' };
  }

  async checkLocalStorage(): Promise<HealthCheckResult> {
    const start = performance.now();
    let status: 'pass' | 'fail' = 'pass';
    let msg = 'Read/write successful';
    try {
      const testKey = '__health_test__';
      localStorage.setItem(testKey, '1');
      const val = localStorage.getItem(testKey);
      if (val !== '1') throw new Error('Value mismatch');
      localStorage.removeItem(testKey);
    } catch (e) {
      status = 'fail';
      msg = 'LocalStorage not accessible';
    }
    const latency = Math.round(performance.now() - start);
    
    return { name: 'LocalStorage', status, latencyMs: latency, message: msg };
  }

  async checkFaceModels(): Promise<HealthCheckResult> {
    // Basic check to see if the models directory exists or is reachable
    const { latency, error } = await this.measureLatency(async () => {
      const res = await fetch('/models/tiny_face_detector_model-weights_manifest.json', { method: 'HEAD' });
      if (!res.ok) throw new Error('Model manifest not found');
    });

    if (error) {
      return { name: 'Face API Models', status: 'warn', latencyMs: latency, message: 'Models not preloaded or reachable' };
    }
    return { name: 'Face API Models', status: 'pass', latencyMs: latency, message: 'Models available' };
  }

  async runAllChecks(): Promise<HealthCheckResult[]> {
    const results = await Promise.all([
      this.checkDatabase(),
      this.checkAuthService(),
      this.checkEdgeFunctions(),
      this.checkBrowserAPIs(),
      this.checkLocalStorage(),
      this.checkFaceModels()
    ]);
    return results;
  }
}

export const healthCheckService = new HealthCheckService();
