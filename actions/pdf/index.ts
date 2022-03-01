import fs from 'fs';
import path from 'path';
import * as core from '@actions/core';
import { Octokit } from '@octokit/action';
import { pdf } from '@friends-library/doc-artifacts';
import { uploadFile } from '@friends-library/cloud';
import { genericDpc, DocPrecursor } from '@friends-library/types';
import { paperbackInterior } from '@friends-library/doc-manifests';
import { newOrModifiedFiles, latestCommitSha } from '../helpers';
import * as pr from '../pull-requests';

async function main(): Promise<void> {
  const COMMIT_SHA = latestCommitSha();
  const PR_NUM = await pr.number();
  if (!COMMIT_SHA || !PR_NUM) {
    return;
  }

  const { GITHUB_REPOSITORY = `` } = process.env;
  const [owner, repo] = GITHUB_REPOSITORY.split(`/`);
  const uploaded: [string, string][] = [];

  for (const file of newOrModifiedFiles()) {
    const filename = path.basename(file);
    const adoc = fs.readFileSync(file).toString();
    const dpc = dpcFromAdocFragment(adoc, file, owner, repo);
    try {
      const [manifest] = await paperbackInterior(dpc, {
        frontmatter: false,
        printSize: `m`,
        condense: false,
        allowSplits: false,
      });
      const pdfPath = await pdf(manifest, `doc_${Date.now()}`);
      const [, edition] = file.split(`/`);
      const cloudFilename = `${COMMIT_SHA.substring(0, 8)}--${edition}--${filename}`;
      const url = await uploadFile(pdfPath, `actions/${repo}/${PR_NUM}/${cloudFilename}`);
      uploaded.push([url, cloudFilename]);
    } catch (err) {
      core.setFailed(String(err));
      return;
    }
  }

  if (uploaded.length) {
    await pr.deleteBotCommentsContaining(`PDF Previews for commit`);
    await new Octokit().issues.createComment({
      owner,
      repo,
      issue_number: PR_NUM,
      body: `PDF Previews for commit ${COMMIT_SHA}:\n\n${uploaded
        .map(([url, filename]) => `* [${filename}](${url})`)
        .join(`\n`)}`,
    });
  }
}

main();

function dpcFromAdocFragment(
  adoc: string,
  path: string,
  owner: string,
  repo: string,
): DocPrecursor {
  const dpc = genericDpc();
  dpc.lang = owner === `biblioteca-de-los-amigos` ? `es` : `en`;
  dpc.asciidocFiles = [{ adoc, filename: path }];
  dpc.meta.title = `PR Preview`;
  dpc.meta.author.name = repo
    .split(`-`)
    .map(([first, ...rest]) => first.toUpperCase() + rest.join(``))
    .join(` `);
  return dpc;
}
