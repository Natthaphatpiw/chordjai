import {randomBytes,scryptSync} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
// Never changes .env or the database. Output files are ignored by Git.
const folder=resolve('local-secrets');await mkdir(folder,{recursive:true,mode:0o700});
const username='chordjai-admin',password=randomBytes(24).toString('base64url'),salt=randomBytes(16).toString('hex');
const hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
const envFile=resolve(folder,'dashboard-backend.env'),loginFile=resolve(folder,'dashboard-login.md');
await writeFile(envFile,`ADMIN_DASHBOARD_USERNAME=${username}\nADMIN_DASHBOARD_PASSWORD_HASH=${hash}\nADMIN_DASHBOARD_ORIGIN=https://admin.chordjai.life\n`,{mode:0o600,flag:'wx'});
await writeFile(loginFile,`# ChordJai Dashboard credentials\n\nURL: https://admin.chordjai.life/dashboard\n\nUsername: ${username}\n\nPassword: ${password}\n\nCopy the variables from dashboard-backend.env into the backend Vercel project, then redeploy. This file and the env file are local and Git-ignored. No database or live environment has been changed.\n`,{mode:0o600,flag:'wx'});
console.log('Created local-secrets/dashboard-login.md and local-secrets/dashboard-backend.env (mode 0600). No plaintext password printed.');
