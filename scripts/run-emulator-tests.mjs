// Runs the security-rules tests against the Firestore emulator, on Windows, macOS and Linux.
//
// The emulator is a Java program. On a machine whose system language is Chinese (or another
// non-English locale) Java localizes some of the emulator's error replies, and the tests that
// compare those replies then fail for reasons unrelated to the rules. Forcing an English locale
// for the emulator's JVM keeps the results the same on every machine.
import { spawn } from 'node:child_process';

const english = '-Duser.language=en -Duser.country=US';
const env = {
  ...process.env,
  JAVA_TOOL_OPTIONS: [process.env.JAVA_TOOL_OPTIONS, english].filter(Boolean).join(' ')
};

const child = spawn(
  'npx',
  ['firebase-tools', 'emulators:exec', '--only', 'firestore', '--project', 'demo-lym-rules-test', 'npm test'],
  { stdio: 'inherit', env, shell: process.platform === 'win32' }
);
child.on('exit', code => process.exit(code ?? 1));
