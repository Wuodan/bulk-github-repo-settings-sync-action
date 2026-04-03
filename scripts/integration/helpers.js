import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

function writeLine(stream, message) {
  stream.write(`${message}\n`);
}

export function info(message) {
  writeLine(process.stdout, message);
}

export function errorLine(message) {
  writeLine(process.stderr, message);
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export function getApiUrl() {
  return process.env.INTEGRATION_API_URL?.trim() || 'https://api.github.com';
}

export function createOctokit() {
  return new Octokit({
    auth: getRequiredEnv('INTEGRATION_GH_TOKEN'),
    baseUrl: getApiUrl()
  });
}

export function readIntegrationConfig() {
  const configPath = path.resolve('sample-configuration/integration-test/repos.yml');
  const configContent = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(configContent);

  assert(config && Array.isArray(config.repos), `Invalid integration config at ${configPath}`);

  return {
    path: configPath,
    repos: config.repos
  };
}

export function getRepoParts(repoFullName) {
  const [owner, repo] = repoFullName.split('/');
  assert(owner && repo, `Invalid repository name: ${repoFullName}`);
  return { owner, repo };
}

export async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function paceMutation() {
  await sleep(1000);
}

export async function getRepository(octokit, repoFullName) {
  const { owner, repo } = getRepoParts(repoFullName);
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data;
}

export async function ensureRepositoryInitialized(octokit, repoFullName) {
  const repository = await getRepository(octokit, repoFullName);

  if (repository.default_branch && repository.size > 0) {
    return repository;
  }

  const { owner, repo } = getRepoParts(repoFullName);
  const branch = repository.default_branch || 'main';

  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: 'README.md',
    message: 'chore: initialize integration test repository',
    content: Buffer.from(`# ${repo}\n`).toString('base64'),
    branch
  });
  await paceMutation();

  return getRepository(octokit, repoFullName);
}

export async function updateRepositorySettings(octokit, repoFullName, settings) {
  const { owner, repo } = getRepoParts(repoFullName);
  await octokit.rest.repos.update({
    owner,
    repo,
    ...settings
  });
  await paceMutation();
}

export async function replaceTopics(octokit, repoFullName, names) {
  const { owner, repo } = getRepoParts(repoFullName);
  await octokit.rest.repos.replaceAllTopics({
    owner,
    repo,
    names
  });
  await paceMutation();
}

export async function getTopics(octokit, repoFullName) {
  const { owner, repo } = getRepoParts(repoFullName);
  const { data } = await octokit.rest.repos.getAllTopics({ owner, repo });
  return data.names || [];
}

export async function listOpenPullRequestsForBranch(octokit, repoFullName, branchName) {
  const { owner, repo } = getRepoParts(repoFullName);
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    head: `${owner}:${branchName}`
  });
  return data;
}

export async function closePullRequest(octokit, repoFullName, pullNumber) {
  const { owner, repo } = getRepoParts(repoFullName);
  await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: pullNumber,
    state: 'closed'
  });
  await paceMutation();
}

export async function deleteBranchIfExists(octokit, repoFullName, branchName) {
  const { owner, repo } = getRepoParts(repoFullName);

  try {
    await octokit.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branchName}`
    });
    await paceMutation();
  } catch (caughtError) {
    if (caughtError.status !== 422 && caughtError.status !== 409 && caughtError.status !== 404) {
      throw caughtError;
    }
  }
}

export async function deleteFileIfExists(octokit, repoFullName, filePath, branch) {
  const { owner, repo } = getRepoParts(repoFullName);

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch
    });

    await octokit.rest.repos.deleteFile({
      owner,
      repo,
      path: filePath,
      message: `chore: remove ${filePath} for integration reset`,
      sha: data.sha,
      branch
    });
    await paceMutation();
  } catch (caughtError) {
    if (caughtError.status !== 404) {
      throw caughtError;
    }
  }
}

export async function getFileContent(octokit, repoFullName, filePath, ref) {
  const { owner, repo } = getRepoParts(repoFullName);
  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: filePath,
    ref
  });

  return Buffer.from(data.content, 'base64').toString('utf8');
}
