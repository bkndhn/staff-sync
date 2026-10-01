import { E2ETestRunner, sleep } from './e2e-runner.mjs';

async function test4() {
  console.log('🚀 Running Test 4: Mobile Viewport & 5+More Navigation Audit (393px width)');
  const runner = new E2ETestRunner();
  await runner.start();

  try {
    // 1. Set mobile viewport 393 x 852
    await runner.send('Emulation.setDeviceMetricsOverride', {
      width: 393,
      height: 852,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await sleep(1000);

    for (let i = 0; i < 20; i++) {
      if (await runner.evaluate(`!!document.querySelector('form')`)) break;
      await sleep(500);
    }

    // 2. Login as Admin
    console.log('📱 Logging in as Admin in mobile viewport (393px)...');
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
    await sleep(1500);

    // 3. Verify Admin Bottom Navigation
    const adminNavAudit = await runner.evaluate(`(function() {
      const navEl = document.querySelector('.mobile-nav');
      if (!navEl) return { error: 'mobile-nav container not found' };

      const buttons = Array.from(navEl.querySelectorAll('button'));
      const buttonLabels = buttons.map(b => b.innerText.trim().replace(/\\n/g, ' '));
      const hasOverflow = navEl.scrollWidth > navEl.clientWidth;

      const expectedPrimary = ['Dashboard', 'Attendance', 'Staff', 'Petty Cash', 'Payroll'];
      const hasAllPrimary = expectedPrimary.every(exp => buttonLabels.some(l => l.includes(exp)));
      const hasMoreButton = buttonLabels.some(l => l.includes('More'));
      const exactFivePlusMore = buttons.length === 6 && hasAllPrimary && hasMoreButton;

      return {
        clientWidth: navEl.clientWidth,
        scrollWidth: navEl.scrollWidth,
        hasOverflow,
        buttonsCount: buttons.length,
        buttonLabels,
        hasAllPrimary,
        hasMoreButton,
        exactFivePlusMore,
        viewportWidth: window.innerWidth,
      };
    })()`);
    console.log('Admin Mobile Nav Audit:', JSON.stringify(adminNavAudit, null, 2));

    // Tap More button in Admin nav
    console.log('📱 Tapping Admin "More" button...');
    await runner.evaluate(`(function() {
      const navEl = document.querySelector('.mobile-nav');
      const moreBtn = Array.from(navEl.querySelectorAll('button')).find(b => b.innerText.includes('More'));
      if (moreBtn) {
        for (const k in moreBtn) {
          if (k.startsWith('__reactProps$') && typeof moreBtn[k]?.onClick === 'function') {
            moreBtn[k].onClick({ stopPropagation() {}, preventDefault() {} });
            return true;
          }
        }
        moreBtn.click();
        return true;
      }
      return false;
    })()`);
    await sleep(1000);

    // Verify Admin More Sheet contents
    const adminMoreSheetAudit = await runner.evaluate(`(function() {
      const drawer = document.querySelector('div.fixed.inset-0.z-50') ||
                     Array.from(document.querySelectorAll('div')).find(d => d.innerText && d.innerText.includes('All Navigation'));
      if (!drawer) return { open: false };

      const hasDragHandle = !!drawer.querySelector('[class*="h-1.5"]') || !!document.querySelector('[class*="h-1.5"]');
      const hasGrid4 = !!drawer.querySelector('[class*="grid-cols-4"]');
      const hasThemeToggle = drawer.innerText.includes('Light Mode') || drawer.innerText.includes('Dark Mode');
      const hasLogout = drawer.innerText.includes('Logout');
      const secondaryButtons = Array.from(drawer.querySelectorAll('[class*="grid-cols-4"] button')).map(b => b.innerText.trim());

      return {
        open: true,
        hasDragHandle,
        hasGrid4,
        hasThemeToggle,
        hasLogout,
        secondaryModulesCount: secondaryButtons.length,
        sampleSecondaryModules: secondaryButtons.slice(0, 6)
      };
    })()`);
    console.log('Admin More Sheet Audit:', JSON.stringify(adminMoreSheetAudit, null, 2));

    // Close Admin More sheet
    await runner.evaluate(`(function() {
      const backdrop = document.querySelector('.fixed.inset-0.bg-black\\\\/60') || Array.from(document.querySelectorAll('div')).find(d => d.className && d.className.includes('bg-black/60'));
      if (backdrop) backdrop.click();
    })()`);
    await sleep(1000);

    // 4. Switch to Staff Portal
    console.log('📱 Switching session to Staff Portal via clean re-auth...');
    await runner.evaluate(`(function() {
      const nav = document.querySelector('nav') || document.querySelector('.mobile-nav');
      if (nav) {
        let curr = null;
        for (const k in nav) { if (k.startsWith('__reactFiber$')) { curr = nav[k]; break; } }
        while (curr) {
          if (curr.memoizedProps?.onLogout) {
            curr.memoizedProps.onLogout();
            return true;
          }
          curr = curr.return;
        }
      }
      return false;
    })()`);
    await sleep(1500);

    // Wait for Login form
    for (let i = 0; i < 20; i++) {
      if (await runner.evaluate(`!!document.querySelector('form')`)) break;
      await sleep(500);
    }

    // Login as Staff
    await runner.evaluate(`(function() {
      const form = document.querySelector('form');
      let fiber = null;
      for (const k in form) { if (k.startsWith('__reactFiber$')) { fiber = form[k]; break; } }
      let curr = fiber;
      while (curr) {
        if (curr.memoizedProps?.onLogin) {
          curr.memoizedProps.onLogin({
            email: 'staff@staffsync.app',
            role: 'staff',
            staffId: 'staff-demo-e2e',
            location: 'Main Branch',
            staffRecord: {
              id: 'staff-demo-e2e',
              name: 'Aarav Patel',
              designation: 'Sales Executive',
              location: 'Main Branch',
              department: 'Sales',
              isActive: true,
              type: 'full-time'
            }
          });
          return true;
        }
        curr = curr.return;
      }
      return false;
    })()`);
    await sleep(2500);

    // Verify Staff Portal Bottom Navigation
    const staffNavAudit = await runner.evaluate(`(function() {
      const bottomNav = Array.from(document.querySelectorAll('div.fixed.bottom-0')).find(el => el.innerText.includes('Overview') || el.innerText.includes('Attendance'));
      if (!bottomNav) return { error: 'Staff portal bottom nav not found' };

      const buttons = Array.from(bottomNav.querySelectorAll('button'));
      const buttonLabels = buttons.map(b => b.innerText.trim().replace(/\\n/g, ' '));
      const hasOverflow = bottomNav.scrollWidth > bottomNav.clientWidth;

      const expectedStaffPrimary = ['Overview', 'Attendance', 'Salary', 'Leave', 'Payslips'];
      const hasAllPrimary = expectedStaffPrimary.every(exp => buttonLabels.some(l => l.includes(exp)));
      const hasMoreButton = buttonLabels.some(l => l.includes('More'));
      const exactFivePlusMore = buttons.length === 6 && hasAllPrimary && hasMoreButton;

      return {
        clientWidth: bottomNav.clientWidth,
        scrollWidth: bottomNav.scrollWidth,
        hasOverflow,
        buttonsCount: buttons.length,
        buttonLabels,
        hasAllPrimary,
        hasMoreButton,
        exactFivePlusMore,
      };
    })()`);
    console.log('Staff Portal Nav Audit:', JSON.stringify(staffNavAudit, null, 2));

    // Tap More button in Staff Portal nav
    console.log('📱 Tapping Staff Portal "More" button...');
    await runner.evaluate(`(function() {
      const bottomNav = Array.from(document.querySelectorAll('div.fixed.bottom-0')).find(el => el.innerText.includes('Overview') || el.innerText.includes('Attendance'));
      const moreBtn = Array.from(bottomNav.querySelectorAll('button')).find(b => b.innerText.includes('More'));
      if (moreBtn) {
        for (const k in moreBtn) {
          if (k.startsWith('__reactProps$') && typeof moreBtn[k]?.onClick === 'function') {
            moreBtn[k].onClick({ stopPropagation() {}, preventDefault() {} });
            return true;
          }
        }
        moreBtn.click();
        return true;
      }
      return false;
    })()`);
    await sleep(1000);

    // Verify Staff Portal More Sheet contents
    const staffMoreSheetAudit = await runner.evaluate(`(function() {
      const drawer = Array.from(document.querySelectorAll('div')).find(d => d.innerText && d.innerText.includes('All Sections'));
      if (!drawer) return { open: false };

      const hasGrid4 = !!drawer.querySelector('[class*="grid-cols-4"]');
      const hasDragHandle = !!drawer.querySelector('[class*="h-1.5"]');
      const secondaryButtons = Array.from(drawer.querySelectorAll('[class*="grid-cols-4"] button')).map(b => b.innerText.trim());

      return {
        open: true,
        hasDragHandle,
        hasGrid4,
        secondaryModulesCount: secondaryButtons.length,
        sampleSecondaryModules: secondaryButtons.slice(0, 6)
      };
    })()`);
    console.log('Staff Portal More Sheet Audit:', JSON.stringify(staffMoreSheetAudit, null, 2));

    const adminNavPass = adminNavAudit.exactFivePlusMore && !adminNavAudit.hasOverflow && adminMoreSheetAudit.open && adminMoreSheetAudit.hasGrid4;
    const staffNavPass = staffNavAudit.exactFivePlusMore && !staffNavAudit.hasOverflow && staffMoreSheetAudit.open && staffMoreSheetAudit.hasGrid4;

    const pass = adminNavPass && staffNavPass;
    console.log(`\nTest 4 Result: ${pass ? '✅ PASS' : '❌ FAIL'}`);

  } finally {
    await runner.close();
  }
}

test4().catch(console.error);
