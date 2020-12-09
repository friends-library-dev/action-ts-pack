import fs from 'fs';
import path from 'path';
import { red, green, magenta } from 'x-chalk';
import exec from 'x-exec';

const ROOT_DIR = path.resolve(__dirname, '..');
const ACTIONS_DIR = path.resolve(ROOT_DIR, `actions`);
let [task, action = `all`] = process.argv.slice(2);

if (task !== `build` && task !== `watch`) {
  abort(`invalid task: build | watch`);
}

if (action !== `all`) {
  action = action.replace(/^actions\//, ``).replace(/\/$/, ``);
  if (!fs.existsSync(`${ACTIONS_DIR}/${action}/action.yml`)) {
    abort(`unknown sub-action: ${action}`);
  }
}

if (action == `all`) {
  fs.readdirSync(ACTIONS_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .forEach((dirent) => bundle(dirent.name));
} else {
  bundle(action);
}

function bundle(action: string) {
  if (task === `build`) {
    magenta(`bundling <${action}> for production\n`);
  } else {
    green(`bundling <${action}> for dev in watch mode...`);
  }
  const dir = `${ACTIONS_DIR}/${action}`;
  const last = task === `build` ? `--minify` : `--watch`;
  exec.out(
    `npx ncc build ${dir}/index.ts --out ${dir}/bundled --quiet ${last}`,
    ROOT_DIR,
  );
}

function abort(msg: string): never {
  red(`${msg}\n`);
  process.exit(1);
}
