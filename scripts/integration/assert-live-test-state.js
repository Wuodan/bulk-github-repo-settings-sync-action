import * as fs from 'fs';

import {
  assert,
  createOctokit,
  getFileContent,
  getRepository,
  getTopics,
  info,
  listOpenPullRequestsForBranch,
  readIntegrationConfig
} from './helpers.js';

function parseIntegerOutput(name) {
  const value = process.env[name];
  assert(value !== undefined, `Missing action output env: ${name}`);
  const parsed = Number.parseInt(value, 10);
  assert(Number.isInteger(parsed), `Expected integer in ${name}, got: ${value}`);
  return parsed;
}

function parseResultsOutput() {
  const raw = process.env.ACTION_RESULTS;
  assert(raw, 'Missing ACTION_RESULTS output');
  return JSON.parse(raw);
}

function sortStrings(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

async function assertSettingsRepo(octokit, repoFullName, result) {
  const repository = await getRepository(octokit, repoFullName);

  assert(repository.allow_squash_merge === true, `${repoFullName} should have squash merge enabled`);
  assert(repository.allow_auto_merge === true, `${repoFullName} should have auto-merge enabled`);
  assert(repository.delete_branch_on_merge === true, `${repoFullName} should delete branches on merge`);

  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(
    result.subResults.some(subResult => subResult.kind === 'settings' && subResult.status === 'changed'),
    `${repoFullName} should include a changed settings sub-result`
  );
}

async function assertTopicsRepo(octokit, repoFullName, result) {
  const topics = await getTopics(octokit, repoFullName);
  const expectedTopics = ['integration-live', 'topics-check'];

  assert(
    JSON.stringify(sortStrings(topics)) === JSON.stringify(sortStrings(expectedTopics)),
    `${repoFullName} topics should be ${expectedTopics.join(', ')}`
  );

  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(
    result.subResults.some(subResult => subResult.kind === 'topics' && subResult.status === 'changed'),
    `${repoFullName} should include a changed topics sub-result`
  );
}

async function assertCodeownersRepo(octokit, repoFullName, result) {
  const pulls = await listOpenPullRequestsForBranch(octokit, repoFullName, 'codeowners-sync');
  assert(pulls.length === 1, `${repoFullName} should have exactly one open CODEOWNERS PR`);

  const branchContent = await getFileContent(octokit, repoFullName, '.github/CODEOWNERS', 'codeowners-sync');
  const expectedContent = fs.readFileSync('sample-configuration/integration-test/CODEOWNERS', 'utf8');

  assert(branchContent === expectedContent, `${repoFullName} CODEOWNERS content on PR branch should match fixture`);

  assert(result.success === true, `${repoFullName} result should be successful`);
  assert(result.hasWarnings === false, `${repoFullName} should not have warnings`);
  assert(
    result.subResults.some(subResult => subResult.kind === 'codeowners-sync' && subResult.status === 'changed'),
    `${repoFullName} should include a changed CODEOWNERS sub-result`
  );
}

async function main() {
  try {
    const octokit = createOctokit();
    const { repos } = readIntegrationConfig();
    const results = parseResultsOutput();

    assert(parseIntegerOutput('ACTION_UPDATED_REPOSITORIES') === 3, 'updated-repositories should equal 3');
    assert(parseIntegerOutput('ACTION_CHANGED_REPOSITORIES') === 3, 'changed-repositories should equal 3');
    assert(parseIntegerOutput('ACTION_UNCHANGED_REPOSITORIES') === 0, 'unchanged-repositories should equal 0');
    assert(parseIntegerOutput('ACTION_FAILED_REPOSITORIES') === 0, 'failed-repositories should equal 0');
    assert(parseIntegerOutput('ACTION_WARNING_REPOSITORIES') === 0, 'warning-repositories should equal 0');
    assert(results.length === repos.length, 'results output should include every configured repository');

    const resultsByRepo = new Map(results.map(result => [result.repository, result]));

    for (const repoConfig of repos) {
      const result = resultsByRepo.get(repoConfig.repo);
      assert(result, `Missing result entry for ${repoConfig.repo}`);

      if (repoConfig.repo.endsWith('/it-settings-a')) {
        await assertSettingsRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-topics-a')) {
        await assertTopicsRepo(octokit, repoConfig.repo, result);
      } else if (repoConfig.repo.endsWith('/it-codeowners-a')) {
        await assertCodeownersRepo(octokit, repoConfig.repo, result);
      } else {
        throw new Error(`No assertion scenario configured for ${repoConfig.repo}`);
      }
    }

    info('Live integration assertions passed.');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

await main();
