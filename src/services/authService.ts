import * as SecureStore from 'expo-secure-store';

export interface NextcloudCredentials {
  serverUrl: string;
  loginName: string;
  appPassword: string;
}

const CREDENTIALS_KEY = 'nextcloud_credentials';

/**
 * Login with direct basic auth.
 *
 * Login Flow v2 est conçu pour les navigateurs (il redirige vers une page web)
 * et génère des erreurs CORS dans une app native. Pour une app mobile avec
 * saisie user/pass, on utilise directement basic auth en vérifiant via CalDAV.
 *
 * On utilise aussi l'API OCS pour générer un vrai app-password dédié,
 * ce qui est plus propre que stocker le mot de passe principal.
 */
export async function loginWithCredentials(
  serverUrl: string,
  username: string,
  password: string
): Promise<NextcloudCredentials> {
  const cleanUrl = serverUrl.replace(/\/$/, '');
  const basicAuth = btoa(`${username}:${password}`);

  // Étape 1 : vérifier que les credentials sont valides via PROPFIND CalDAV
  const verifyUrl = `${cleanUrl}/remote.php/dav/`;
  let verifyResponse: Response;
  try {
    verifyResponse = await fetch(verifyUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Depth: '0',
        'Content-Type': 'application/xml',
        'OCS-APIREQUEST': 'true',
      },
      body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>`,
    });
  } catch (e: any) {
    throw new Error(`Impossible de joindre le serveur. Vérifiez l'URL.\n(${e.message})`);
  }

  if (verifyResponse.status === 401) {
    throw new Error('Identifiants incorrects. Vérifiez votre login et mot de passe.');
  }
  if (verifyResponse.status === 404) {
    throw new Error("CalDAV introuvable. Vérifiez l'URL de votre instance Nextcloud.");
  }
  if (verifyResponse.status !== 207 && verifyResponse.status !== 200) {
    throw new Error(`Erreur serveur (${verifyResponse.status}). Vérifiez l'URL.`);
  }

  // Étape 2 : tenter de créer un app-password via l'API OCS
  // Cela génère un token dédié à l'app (révocable depuis les paramètres Nextcloud)
  try {
    const appPassUrl = `${cleanUrl}/ocs/v2.php/core/apppassword`;
    const appPassResponse = await fetch(appPassUrl, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'OCS-APIREQUEST': 'true',
        Accept: 'application/json',
      },
    });

    if (appPassResponse.ok) {
      const data = await appPassResponse.json();
      const appPassword = data?.ocs?.data?.apppassword;
      if (appPassword) {
        return { serverUrl: cleanUrl, loginName: username, appPassword };
      }
    }
  } catch {
    // Silently ignore — fallback to using the password directly
  }

  // Fallback : utiliser le mot de passe directement (fonctionnel, moins idéal)
  return { serverUrl: cleanUrl, loginName: username, appPassword: password };
}

/**
 * Verify stored credentials are still valid
 */
export async function verifyCredentials(creds: NextcloudCredentials): Promise<boolean> {
  const { serverUrl, loginName, appPassword } = creds;
  const calDavUrl = `${serverUrl}/remote.php/dav/`;
  const basicAuth = btoa(`${loginName}:${appPassword}`);

  try {
    const response = await fetch(calDavUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Depth: '0',
        'Content-Type': 'application/xml',
        'OCS-APIREQUEST': 'true',
      },
      body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>`,
    });
    return response.status === 207 || response.status === 200;
  } catch {
    return false;
  }
}

export async function saveCredentials(creds: NextcloudCredentials): Promise<void> {
  await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(creds));
}

export async function loadCredentials(): Promise<NextcloudCredentials | null> {
  try {
    const raw = await SecureStore.getItemAsync(CREDENTIALS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearCredentials(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
  } catch {
    // ignore
  }
}
