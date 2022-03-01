import fetch from 'cross-fetch';
import md5 from 'md5';
import * as core from '@actions/core';
import EVANS_BUILD_QUERY from '@friends-library/evans';
import * as cloud from '@friends-library/cloud';
import log from '@friends-library/slack';

type Metadata = { size: number; hash: string };

async function main(): Promise<void> {
  const buildData = await getApiBuildData();
  const lastBuildMeta = await getLastBuildMeta();
  if (!buildData || !lastBuildMeta) {
    return;
  }

  const hash = md5(JSON.stringify(buildData));
  if (buildData.length === lastBuildMeta.size && hash === lastBuildMeta.hash) {
    log.debug(`No republish of evans websites needed`);
    core.setOutput(`should_republish`, `false`);
    core.info(`Output \`should_republish\` set to \`false\``);
  } else {
    log.info(`Republish of evans websites needed`);
    core.setOutput(`should_republish`, `true`);
    core.info(`Output \`should_republish\` set to \`true\``);
    const newMeta: Metadata = { size: buildData.length, hash };
    core.setOutput(`build_meta`, JSON.stringify(newMeta));
    core.info(`Output \`build_meta\` set to \`${JSON.stringify(newMeta)}\``);
  }
}

async function getLastBuildMeta(): Promise<Metadata | null> {
  try {
    const buffer = await cloud.downloadFile(CLOUD_FILEPATH);
    return JSON.parse(buffer.toString());
  } catch (error: unknown) {
    reportError(`Error retrieving latest evans build cloud data: ${error}`);
    return null;
  }
}

async function getApiBuildData(): Promise<string | null> {
  const endpoint = process.env.INPUT_FLP_API_ENDPOINT;
  try {
    const res = await fetch(endpoint ?? ``, {
      method: `POST`,
      headers: {
        Authorization: `Bearer ${process.env.INPUT_FLP_API_TOKEN}`,
        'Content-Type': `application/json`,
      },
      body: JSON.stringify({ query: EVANS_BUILD_QUERY }),
    });
    const json: { data?: Record<string, any>; errors?: Array<{ message: string }> } =
      await res.json();
    if (json.errors) {
      reportError(`Got errors fetching evans build data: ${JSON.stringify(json.errors)}`);
      return null;
    }
    return JSON.stringify(json.data);
  } catch (error: unknown) {
    reportError(`Error fetching evans build data: ${error}`);
    return null;
  }
}

function reportError(message: string): void {
  core.error(message);
  core.setFailed(message);
  log.error(message);
}

const CLOUD_FILEPATH = `actions/latest-evans-build.json`;

main();
