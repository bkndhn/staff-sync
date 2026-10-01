import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9222;

class E2ETestRunner {
  constructor(port) {
    this.port = port || (9220 + Math.floor(Math.random() * 300));
    this.profileDir = mkdtempSync(join(tmpdir(), 'edge-e2e-runner-'));
    this.edgeProcess = null;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
    this.consoleLogs = [];
    this.networkRequests = [];
  }

  async start() {
    this.edgeProcess = spawn(EDGE_PATH, [
      `--remote-debugging-port=${this.port}`,
      '--headless=new',
      `--user-data-dir=${this.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-gpu',
      'http://localhost:8080/'
    ], { stdio: 'ignore' });

    let wsUrl = null;
    for (let i = 0; i < 50; i++) {
      try {
        const pagesRes = await fetch(`http://127.0.0.1:${this.port}/json`);
        if (pagesRes.ok) {
          const pages = await pagesRes.json();
          const target = pages.find(p => p.type === 'page') || pages[0];
          if (target && target.webSocketDebuggerUrl) {
            wsUrl = target.webSocketDebuggerUrl;
            break;
          }
        }
      } catch {}
      await sleep(300);
    }

    if (!wsUrl) throw new Error('Failed to find localhost target');
    this.ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      } else if (data.method === 'Console.messageAdded') {
        const text = data.params.message.text;
        this.consoleLogs.push({ source: 'console', text });
        if (text.includes('FaceAttendance') || text.includes('Offline') || text.includes('Sync') || text.includes('Browser') || text.includes('punch')) {
          console.log('   [Browser Log]', text);
        }
      } else if (data.method === 'Runtime.consoleAPICalled') {
        const text = data.params.args?.map(a => a.value ?? a.description ?? '').join(' ');
        this.consoleLogs.push({ source: 'runtime', type: data.params.type, text });
        if (text.includes('FaceAttendance') || text.includes('Offline') || text.includes('Sync') || text.includes('Browser') || text.includes('punch')) {
          console.log('   [Runtime ' + data.params.type + ']', text);
        }
      } else if (data.method === 'Network.requestWillBeSent') {
        const req = data.params.request;
        this.networkRequests.push({ url: req.url, method: req.method, headers: req.headers });
      }
    };

    await this.send('Page.navigate', { url: 'http://localhost:8080/' });

    await this.send('Runtime.enable');
    await this.send('Console.enable');
    await this.send('Page.enable');
    await this.send('Network.enable');

    console.log('⏳ Waiting for application bundle hydration...');
    await sleep(3000);
  }

  send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error('Evaluation failed: ' + (res.exceptionDetails.text || res.exceptionDetails.exception?.description));
    }
    return res.result?.value;
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
    if (this.edgeProcess?.pid) {
      try {
        spawn('taskkill', ['/F', '/PID', String(this.edgeProcess.pid), '/T'], { stdio: 'ignore' });
      } catch {}
      this.edgeProcess.kill();
    }
    try {
      rmSync(this.profileDir, { recursive: true, force: true });
    } catch {}
  }
}

export { E2ETestRunner, sleep };
