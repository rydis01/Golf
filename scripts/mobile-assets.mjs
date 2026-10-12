import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'mobile');
mkdirSync(resolve(root, 'www/vendor'), { recursive: true });
copyFileSync(resolve(root, 'node_modules/@capacitor/core/dist/capacitor.js'), resolve(root, 'www/vendor/capacitor.js'));
copyFileSync(resolve(root, 'node_modules/@capacitor/core/LICENSE'), resolve(root, 'www/vendor/CAPACITOR-LICENSE.txt'));
