import Constants from 'expo-constants';

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/lgabardos/nextcloud-task-app/releases/latest';
const RELEASES_PAGE = 'https://github.com/lgabardos/nextcloud-task-app/releases';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes?: string;
  publishedAt?: string;
}

function parseVersion(v: string): number[] {
  return v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
}

function isNewer(latest: string, current: string): boolean {
  const l = parseVersion(latest);
  const c = parseVersion(current);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const lv = l[i] ?? 0;
    const cv = c[i] ?? 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const currentVersion = Constants.expoConfig?.version ?? '1.0.0';

    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'NextcloudTasksApp',
      },
    });

    if (!response.ok) return null;

    const release = await response.json();
    const latestVersion: string = release.tag_name ?? '';
    if (!latestVersion) return null;

    return {
      available: isNewer(latestVersion, currentVersion),
      currentVersion,
      latestVersion,
      releaseUrl: release.html_url ?? RELEASES_PAGE,
      releaseNotes: release.body ?? undefined,
      publishedAt: release.published_at ?? undefined,
    };
  } catch {
    return null;
  }
}
