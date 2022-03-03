import fs from 'fs';
import fetch from 'cross-fetch';
import isEqual from 'lodash.isequal';
import * as core from '@actions/core';
import { QUERY, sortFriends } from '@friends-library/evans';
import * as cloud from '@friends-library/cloud';
import log from '@friends-library/slack';

type Friend = ReturnType<typeof sortFriends>[number];

async function main(): Promise<void> {
  core.setOutput(`build_data_cloud_filepath`, CLOUD_FILEPATH);
  core.info(`Output \`build_data_cloud_filepath\` set to \`${CLOUD_FILEPATH}\``);

  const apiFriends = await getApiFriends();
  const lastBuildFriends = await getLastBuildFriends();
  if (!apiFriends || !lastBuildFriends) {
    return;
  }

  if (isEqual(apiFriends, lastBuildFriends)) {
    core.setOutput(`should_republish`, `false`);
    core.info(`Output \`should_republish\` set to \`false\``);
  } else {
    core.setOutput(`should_republish`, `true`);
    core.info(`Output \`should_republish\` set to \`true\``);
    const filePath = `${process.cwd()}/data.json`;
    fs.writeFileSync(filePath, JSON.stringify(apiFriends));
    await cloud.uploadFile(filePath, CLOUD_FILEPATH);
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

// the evans build query pulls in data that doesn't ultimately get rendered
// like draft friends and documents, so pruning out some of these entities
// prevents unnecessary republishing while we're doing intake, prep, etc.
function normalize(unsorted: Friend[]): Friend[] {
  let friends = sortFriends(unsorted);
  friends = friends.filter(
    // query doesn't have friend.published, so fake it by looking for description = TODO
    (friend) => friend.hasNonDraftDocument && friend.description.trim().length > 5,
  );
  for (const friend of friends) {
    friend.documents = friend.documents.filter((d) => d.hasNonDraftEdition);
  }
  return friends;
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
    return normalize(json.data.friends);
  } catch (error: unknown) {
    reportError(`Error fetching evans build data: ${error}`);
    return null;
  }
}

function reportError(message: string): void {
  core.error(message);
  core.setFailed(message);
  log.error(`Error in cron-invoked github action \`should-republish-evans\`: ${message}`);
}

const CLOUD_FILEPATH = `actions/latest-evans-build.json`;

main();
