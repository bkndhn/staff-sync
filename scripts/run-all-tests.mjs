import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const suites = [
  { id: 'Test 1', name: 'Face Attendance Offline-First Recognition & Audio Feedback', script: 'test-suite-1.mjs' },
  { id: 'Test 2', name: 'Hardware Device Integration (eSSL / ZKTeco Biometric Sync)', script: 'test-suite-2.mjs' },
  { id: 'Test 3', name: 'Dashboard Real-Time Role Breakdown & 60s Polling', script: 'test-suite-3.mjs' },
  { id: 'Test 4', name: 'Mobile Viewport & 5+More Navigation Audit (393px width)', script: 'test-suite-4.mjs' },
];

function runSuite(suite) {
  return new Promise((resolve) => {
    console.log(`\n================================================================`);
    console.log(`▶ RUNNING [${suite.id}]: ${suite.name}`);
    console.log(`   Script: scripts/${suite.script}`);
    console.log(`================================================================`);

    const child = spawn('node', [join(__dirname, suite.script)], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (d) => {
      const str = d.toString();
      output += str;
      process.stdout.write(str);
    });

    child.stderr.on('data', (d) => {
      const str = d.toString();
      errorOutput += str;
      process.stderr.write(str);
    });

    child.on('close', (code) => {
      const passed = code === 0 && output.includes('✅ PASS');
      resolve({
        id: suite.id,
        name: suite.name,
        passed,
        exitCode: code,
        output
      });
    });
  });
}

async function main() {
  const startTime = Date.now();
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║        FULL END-TO-END VERIFICATION AUDIT (PORT 8080)            ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  const results = [];
  for (const s of suites) {
    const res = await runSuite(s);
    results.push(res);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                   FINAL VERIFICATION SCORECARD                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`Total Duration: ${durationSec}s\n`);

  let allPassed = true;
  for (const r of results) {
    const statusPill = r.passed ? '✅ PASS' : '❌ FAIL';
    if (!r.passed) allPassed = false;
    console.log(` [${r.id}] ${statusPill.padEnd(8)} : ${r.name}`);
  }

  console.log('\n------------------------------------------------------------------');
  if (allPassed) {
    console.log('🎉 OVERALL STATUS: ALL 4 VERIFICATION TEST SUITES PASSED! 🎉');
  } else {
    console.log('⚠️ OVERALL STATUS: ONE OR MORE SUITES FAILED');
  }
  console.log('------------------------------------------------------------------\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Master runner error:', err);
  process.exit(1);
});
