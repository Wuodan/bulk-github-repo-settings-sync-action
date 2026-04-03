import {
  createOctokit,
  deleteBranchIfExists,
  deleteFileIfExists,
  ensureRepositoryInitialized,
  info,
  listOpenPullRequestsForBranch,
  paceMutation,
  readIntegrationConfig,
  replaceTopics,
  updateRepositorySettings,
  closePullRequest
} from './helpers.js';

async function resetSettingsRepo(octokit, repoFullName) {
  info(`Resetting settings baseline for ${repoFullName}`);
  await ensureRepositoryInitialized(octokit, repoFullName);
  await updateRepositorySettings(octokit, repoFullName, {
    allow_squash_merge: false,
    allow_auto_merge: false,
    delete_branch_on_merge: false
  });
}

async function resetTopicsRepo(octokit, repoFullName) {
  info(`Resetting topics baseline for ${repoFullName}`);
  await ensureRepositoryInitialized(octokit, repoFullName);
  await replaceTopics(octokit, repoFullName, []);
}

async function resetCodeownersRepo(octokit, repoFullName) {
  info(`Resetting CODEOWNERS baseline for ${repoFullName}`);

  const repository = await ensureRepositoryInitialized(octokit, repoFullName);
  const defaultBranch = repository.default_branch;

  const pulls = await listOpenPullRequestsForBranch(octokit, repoFullName, 'codeowners-sync');
  for (const pull of pulls) {
    info(`Closing existing PR #${pull.number} for ${repoFullName}`);
    await closePullRequest(octokit, repoFullName, pull.number);
  }

  await deleteBranchIfExists(octokit, repoFullName, 'codeowners-sync');
  await deleteFileIfExists(octokit, repoFullName, '.github/CODEOWNERS', defaultBranch);

  await paceMutation();
}

async function main() {
  try {
    const octokit = createOctokit();
    const { repos } = readIntegrationConfig();

    for (const repoConfig of repos) {
      const repoFullName = repoConfig.repo;

      if (repoFullName.endsWith('/it-settings-a')) {
        await resetSettingsRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-topics-a')) {
        await resetTopicsRepo(octokit, repoFullName);
      } else if (repoFullName.endsWith('/it-codeowners-a')) {
        await resetCodeownersRepo(octokit, repoFullName);
      } else {
        throw new Error(`No reset scenario configured for ${repoFullName}`);
      }
    }

    info('Integration test repositories reset successfully.');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

await main();
