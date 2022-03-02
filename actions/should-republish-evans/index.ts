import fs from 'fs';
import fetch from 'cross-fetch';
import isEqual from 'lodash.isequal';
import * as core from '@actions/core';
import { QUERY, sortFriends } from '@friends-library/evans';
import * as cloud from '@friends-library/cloud';
import log from '@friends-library/slack';

// type Metadata = { size: number; hash: string };
type Friend = ReturnType<typeof sortFriends>[number];

async function main(): Promise<void> {
  const apiFriends = await getApiFriends();
  const lastBuildFriends = await getLastBuildFriends();
  if (!apiFriends || !lastBuildFriends) {
    return;
  }

  // const hash = md5(JSON.stringify(buildData));
  if (isEqual(apiFriends, lastBuildFriends)) {
    log.debug(`No republish of evans websites needed`);
    core.setOutput(`should_republish`, `false`);
    core.info(`Output \`should_republish\` set to \`false\``);
  } else {
    log.info(`Republish of evans websites needed`);
    core.setOutput(`should_republish`, `true`);
    const tmpPath = `${process.cwd()}/data.json`;
    fs.writeFileSync(tmpPath, JSON.stringify(apiFriends));
    await cloud.uploadFile(tmpPath, CLOUD_FILEPATH);
    // cloud.up
    // core.info(`Output \`should_republish\` set to \`true\``);
    // const newMeta: Metadata = { size: buildData.length, hash };
    // core.setOutput(`build_meta`, JSON.stringify(newMeta));
    // core.info(`Output \`build_meta\` set to \`${JSON.stringify(newMeta)}\``);
  }
}

async function getLastBuildFriends(): Promise<Friend[] | null> {
  try {
    const buffer = await cloud.downloadFile(CLOUD_FILEPATH);
    return JSON.parse(buffer.toString());
  } catch (error: unknown) {
    reportError(`Error retrieving latest evans build cloud data: ${error}`);
    return null;
  }
}

async function getApiFriends(): Promise<Friend[] | null> {
  const endpoint = process.env.INPUT_FLP_API_ENDPOINT;
  try {
    const res = await fetch(endpoint ?? ``, {
      method: `POST`,
      headers: {
        Authorization: `Bearer ${process.env.INPUT_FLP_API_TOKEN}`,
        'Content-Type': `application/json`,
      },
      body: JSON.stringify({ query: QUERY }),
    });
    const json: {
      data?: { friends: Friend[] };
      errors?: Array<{ message: string }>;
    } = await res.json();
    if (json.errors || !json.data) {
      reportError(`Got errors fetching evans build data: ${JSON.stringify(json.errors)}`);
      return null;
    }
    return sortFriends(json.data.friends);
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
