import * as core from '@actions/core';
import { latestCommitSha } from '../helpers';
import * as pr from '../pull-requests';

// @ts-ignore no ts or @types/netlify pkg
import NetlifyAPI from 'netlify';

async function main(): Promise<void> {
  const {
    INPUT_NETLIFY_API_TOKEN: token,
    INPUT_SITE_ID: siteId,
    INPUT_BUILD_DIR: buildDir,
    INPUT_FUNCTIONS_DIR: fnsDir,
    GITHUB_WORKSPACE: workspaceRoot,
    GITHUB_REF,
  } = process.env;

  const client = new NetlifyAPI(token);
  const shortSha = (latestCommitSha() || ``).substring(0, 8);
  const prData = await pr.data();

  let message = `cron auto publish @${new Date().toISOString()}`;
  let draft = false;

  if (prData) {
    const refIsNotMaster = GITHUB_REF !== `refs/heads/master`;
    draft = refIsNotMaster;
    const { number: prNumber, title: prTitle } = prData;
    message = `Push commit @${shortSha}`;
    if (prNumber && refIsNotMaster) {
      message = `PR #${prNumber}@${shortSha} "${prTitle}"`;
    } else if (prNumber && !refIsNotMaster) {
      message = `Merge PR#${prNumber}@${shortSha} to master`;
    }
  }

  core.info(`GITHUB_REF: ${GITHUB_REF}`);
  core.info(`Deploying build dir: \`${workspaceRoot}/${buildDir}\``);
  core.info(`Deploying fns dir: \`${fnsDir ? `${workspaceRoot}/${fnsDir}` : `<none>`}\``);
  core.info(`Deploying with message: "${message}"`);
  core.info(`Deploying as draft: \`${draft}\``);

  try {
    const res = await client.deploy(siteId, `${workspaceRoot}/${buildDir}`, {
      message,
      draft,
      ...(fnsDir ? { fnDir: `${workspaceRoot}/${fnsDir}` } : {}),
      statusCb: (status: any) => status.type !== `hashing` && core.debug(status.msg),
    });

    const url = res.deploy.deploy_ssl_url;
    core.setOutput(`url`, url);
    core.info(`Output \`url\` set to ${url}`);
  } catch (error) {
    core.setFailed(String(error));
  }
}

main();
