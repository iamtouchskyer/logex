import { describe, it, expect } from 'vitest'
import { Octokit } from '@octokit/rest'
import { resolveGitHubToken } from '../../lib/github-token.js'
import { DATA_REPO_OWNER, DATA_REPO_NAME, DATA_REPO_BRANCH } from '../publish.js'

/**
 * Live GitHub integration test for the publish pipeline. Gated on
 * RUN_GITHUB_INTEGRATION=1 so it never touches the real repo during
 * normal `npm test` runs.
 *
 * Writes a disposable `staging/e2e-{ts}.json`, confirms GET returns it,
 * then deletes it — cleanup wrapped in try/finally so it runs even on
 * assertion failure.
 */
describe.skipIf(!process.env.RUN_GITHUB_INTEGRATION)('publish integration (live GitHub)', () => {
  it('round-trips staging/e2e-{ts}.json: create → GET → delete', async () => {
    const token = resolveGitHubToken()
    const octokit = new Octokit({ auth: token })

    const ts = Date.now()
    const stagingPath = `staging/e2e-${ts}.json`
    const payload = { ts, marker: 'logex-integration-test' }
    const contentB64 = Buffer.from(JSON.stringify(payload)).toString('base64')

    let createdSha: string | null = null
    try {
      const create = await octokit.rest.repos.createOrUpdateFileContents({
        owner: DATA_REPO_OWNER,
        repo: DATA_REPO_NAME,
        path: stagingPath,
        message: `test: integration staging ${ts}`,
        content: contentB64,
        branch: DATA_REPO_BRANCH,
      })
      createdSha = create.data.content?.sha ?? null
      expect(createdSha).toBeTruthy()

      const get = await octokit.rest.repos.getContent({
        owner: DATA_REPO_OWNER,
        repo: DATA_REPO_NAME,
        path: stagingPath,
        ref: DATA_REPO_BRANCH,
      })
      const data = get.data as { content?: string; encoding?: string }
      expect(data.encoding).toBe('base64')
      const decoded = Buffer.from(data.content ?? '', 'base64').toString('utf-8')
      expect(JSON.parse(decoded)).toEqual(payload)
    } finally {
      if (createdSha) {
        try {
          await octokit.rest.repos.deleteFile({
            owner: DATA_REPO_OWNER,
            repo: DATA_REPO_NAME,
            path: stagingPath,
            message: `test: integration cleanup ${ts}`,
            sha: createdSha,
            branch: DATA_REPO_BRANCH,
          })
        } catch (e) {
          // surface cleanup failure but don't mask the original assertion
          process.stderr.write(
            `WARN: cleanup failed for ${stagingPath}: ${(e as Error).message}\n`,
          )
        }
      }
    }
  }, 30_000)
})
