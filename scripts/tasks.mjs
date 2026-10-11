import { spawnSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
const task = process.argv[2];
const windows = process.platform === 'win32';
const venvPython = windows ? '.venv/Scripts/python.exe' : '.venv/bin/python';
const basePython = windows ? 'python' : 'python3';
const python = process.env.INAV_PYTHON || (existsSync(venvPython) ? venvPython : basePython);
// npm is npm.cmd on Windows, which Node only spawns through a shell; the arguments here are fixed literals.
const npm = (args, options = {}) => windows ? [`npm ${args.join(' ')}`, [], { ...options, shell: true }] : ['npm', args, options];
const env = { ...process.env, PYTHONPATH: 'backend' };
function run(cmd, args, extra = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', env, ...extra });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
if (task === 'setup') {
  run(basePython, ['-m', 'venv', '.venv']);
  run(venvPython, ['-m', 'pip', 'install', '-r', 'backend/requirements.txt']);
  run(...npm(['install']));
  run(...npm(['install', '--prefix', 'frontend']));
} else if (task === 'test') {
  run(python, ['-m', 'pytest', '-q', 'backend/tests']);
} else if (task === 'preflight') {
  run(python, ['scripts/preflight.py']);
  run(...npm(['--prefix', 'frontend', 'run', 'build']));
} else if (task === 'demo') {
  run(python, ['scripts/demo.py']);
} else if (task === 'dev') {
  const children = [spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000', '--reload', '--reload-dir', 'backend'], { stdio: 'inherit', env }), spawn(...npm(['--prefix', 'frontend', 'run', 'dev', '--', '--host', '127.0.0.1'], { stdio: 'inherit', env }))];
  let stopping = false;
  // On Windows a signal reaches only the shell/reloader, not vite or the uvicorn worker; kill the whole tree.
  const kill = child => windows ? spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) : child.kill('SIGTERM');
  const stop = () => { if (stopping) return; stopping = true; children.forEach(kill); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  children.forEach(child => {
    child.on('exit', code => { if (!stopping && code) process.exitCode = code; stop(); });
    child.on('error', () => { process.exitCode = 1; stop(); });
  });
} else { process.exit(1); }
