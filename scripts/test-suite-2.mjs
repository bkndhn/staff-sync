import { E2ETestRunner, sleep } from './e2e-runner.mjs';

async function test2() {
  console.log('🚀 Running Test 2: Hardware Device Integration (eSSL / ZKTeco Biometric Sync)');
  const runner = new E2ETestRunner();
  await runner.start();

  try {
    for (let i = 0; i < 20; i++) {
      if (await runner.evaluate(`!!document.querySelector('form')`)) break;
      await sleep(500);
    }
    // Login
    await runner.evaluate(`(function() {
      const form = document.querySelector('form');
      let fiber = null;
      for (const k in form) { if (k.startsWith('__reactFiber$')) { fiber = form[k]; break; } }
      let curr = fiber;
      while (curr) {
        if (curr.memoizedProps?.onLogin) {
          curr.memoizedProps.onLogin({
            email: 'admin@staffsync.app',
            role: 'admin',
            location: 'Main Branch'
          });
          return true;
        }
        curr = curr.return;
      }
    })()`);
    await sleep(2000);

    // Skip onboarding
    await runner.evaluate(`(function() {
      const skipBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Skip for now'));
      if (skipBtn) skipBtn.click();
    })()`);
    await sleep(1000);

    // Setup fetch interceptor and userPreferencesService mock BEFORE Settings mounts
    await runner.evaluate(`(async function() {
      window.__devicePullCalls = [];
      const origFetch = window.fetch;
      window.fetch = async function(url, opts) {
        const urlStr = String(url || '');
        if (urlStr.includes('/functions/v1/device-pull')) {
          let bodyObj = null;
          try { bodyObj = typeof opts?.body === 'string' ? JSON.parse(opts.body) : opts?.body; } catch {}
          window.__devicePullCalls.push({
            url: urlStr,
            headers: opts?.headers,
            body: bodyObj
          });
          return new Response(JSON.stringify({
            ok: true,
            fetched: 14,
            inserted: 12,
            skipped: 2
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return origFetch(url, opts);
      };

      const { userPreferencesService } = await import('./src/services/userPreferencesService.ts');
      userPreferencesService.getPreference = async function(key, def) {
        if (key === 'biometricConfig') {
          return {
            provider: 'zkbiotime',
            serverUrl: 'https://demo-biotime.zkteco.com/api',
            apiKey: 'zk-demo-token-9988',
            locationCode: ''
          };
        }
        return def;
      };
    })()`);

    // Click Settings / switchTab('Settings')
    const switchedToSettings = await runner.evaluate(`(function() {
      const el = document.querySelector('aside') || document.querySelector('nav');
      if (el) {
        for (const k in el) {
          if (k.startsWith('__reactFiber$')) {
            let curr = el[k];
            while (curr) {
              if (curr.memoizedProps?.setActiveTab) {
                curr.memoizedProps.setActiveTab('Settings');
                return true;
              }
              curr = curr.return;
            }
          }
        }
      }
      const btn = Array.from(document.querySelectorAll('aside button, button')).find(b => b.title === 'Settings' || b.innerText.includes('Settings'));
      if (btn) { btn.click(); return true; }
      return false;
    })()`);
    console.log('Switched to Settings:', switchedToSettings);
    await sleep(3500);

    // Expand "Attendance & Devices" accordion section (retry loop for Suspense chunk)
    let accordionOpened = false;
    for (let i = 0; i < 20; i++) {
      const found = await runner.evaluate(`(function() {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
          b.innerText.includes('Attendance & Devices') || 
          b.querySelector('h2')?.innerText?.includes('Attendance & Devices')
        );
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()`);
      if (found) {
        accordionOpened = true;
        break;
      }
      await sleep(500);
    }
    console.log('Opened Attendance & Devices accordion:', accordionOpened);
    await sleep(1500);

    // Now test Cloud API and Sync Now
    const result = await runner.evaluate(`(async function() {
      const checks = {};

      // 1. Click Cloud API tab in DeviceIntegration
      const cloudApiTab = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Cloud API'));
      checks.hasCloudApiTab = !!cloudApiTab;
      if (cloudApiTab) {
        cloudApiTab.click();
        await new Promise(r => setTimeout(r, 600));
      }

      // 2. Verify Provider selection buttons: eSSL, ZKTeco, Realtime, Custom
      const allButtons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim());
      checks.providers = {
        essl: allButtons.some(b => b.includes('eSSL eTimeTrack')),
        zkbiotime: allButtons.some(b => b.includes('ZKTeco BioTime')),
        realtime: allButtons.some(b => b.includes('Realtime Cloud')),
        custom: allButtons.some(b => b.includes('Custom / Other')),
      };

      // 3. Verify Server URL and API Key inputs
      const urlInput = document.querySelector('input[type="url"]');
      const keyInput = document.querySelector('input[placeholder*="API key"]');
      checks.hasUrlInput = !!urlInput;
      checks.hasKeyInput = !!keyInput;

      // 4. Check "Sync Now" button
      const syncNowBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Sync Now'));
      checks.hasSyncNowButton = !!syncNowBtn;
      checks.syncNowEnabled = syncNowBtn ? !syncNowBtn.disabled : false;

      // 5. Click "Sync Now" to trigger dispatch via dataApi / edge function
      if (syncNowBtn) {
        let btnFiber = null;
        for (const k in syncNowBtn) if (k.startsWith('__reactFiber$')) { btnFiber = syncNowBtn[k]; break; }
        if (btnFiber?.memoizedProps?.onClick) {
          await btnFiber.memoizedProps.onClick();
        } else {
          syncNowBtn.click();
        }
        await new Promise(r => setTimeout(r, 1200));
      }

      // 6. Verify invocation args from window.__devicePullCalls
      const lastCall = (window.__devicePullCalls || []).slice(-1)[0];
      checks.dispatchedEdgeFunction = !!lastCall && lastCall.url.includes('device-pull');
      checks.payloadProvider = lastCall?.body?.provider;
      checks.payloadServerUrl = lastCall?.body?.serverUrl;

      // 7. Verify live summary pill rendered in DOM
      const pillDiv = Array.from(document.querySelectorAll('div')).find(d => 
        d.className?.includes('rounded-xl') && d.innerText.includes('Fetched:')
      );
      checks.summaryPillRendered = !!pillDiv;
      checks.summaryPillText = pillDiv ? pillDiv.innerText.trim() : null;

      // Test valid summary pill format regex (use [0-9]+ to avoid template literal backslash escaping)
      checks.validPillFormat = /Fetched: [0-9]+/.test(checks.summaryPillText || '') && 
                               /Inserted: [0-9]+/.test(checks.summaryPillText || '') && 
                               /Skipped: [0-9]+/.test(checks.summaryPillText || '');


      return checks;
    })()`);

    console.log('Test 2 Detailed Results:', JSON.stringify(result, null, 2));

    const pass = accordionOpened &&
                 result.hasCloudApiTab &&
                 result.providers.essl &&
                 result.providers.zkbiotime &&
                 result.providers.realtime &&
                 result.providers.custom &&
                 result.hasUrlInput &&
                 result.hasKeyInput &&
                 result.hasSyncNowButton &&
                 result.syncNowEnabled &&
                 result.summaryPillRendered &&
                 result.validPillFormat;

    console.log(`\nTest 2 Result: ${pass ? '✅ PASS' : '❌ FAIL'}`);

  } finally {
    await runner.close();
  }
}

test2().catch(console.error);
