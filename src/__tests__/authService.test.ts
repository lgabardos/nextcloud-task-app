/**
 * Tests pour authService.ts
 *
 * Couvre :
 * - loginWithCredentials : nettoyage d'URL, gestion erreurs HTTP, génération app-password
 * - verifyCredentials
 * - saveCredentials / loadCredentials / clearCredentials
 */

import * as SecureStore from 'expo-secure-store';
import {
  loginWithCredentials,
  verifyCredentials,
  saveCredentials,
  loadCredentials,
  clearCredentials,
} from '../services/authService';

const mockCreds = {
  serverUrl: 'https://cloud.example.com',
  loginName: 'alice',
  appPassword: 'secret123',
};

beforeEach(() => {
  global.fetch = jest.fn();
  jest.clearAllMocks();
});

// ─── loginWithCredentials ─────────────────────────────────────────────────────

describe('loginWithCredentials', () => {
  it('nettoie le slash final de l\'URL serveur', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ status: 207, text: async () => '' }) // PROPFIND OK
      .mockResolvedValueOnce({ ok: false }); // OCS échoue → fallback

    const result = await loginWithCredentials('https://cloud.example.com/', 'alice', 'pass');
    expect(result.serverUrl).toBe('https://cloud.example.com');
  });

  it('lève une erreur lisible si le serveur est injoignable', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('fetch failed'));

    await expect(loginWithCredentials('https://down.example.com', 'alice', 'pass'))
      .rejects.toThrow('Impossible de joindre le serveur');
  });

  it('lève une erreur 401 avec message explicite', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 401 });

    await expect(loginWithCredentials('https://cloud.example.com', 'alice', 'mauvais-pass'))
      .rejects.toThrow('Identifiants incorrects');
  });

  it('lève une erreur 404 avec message explicite', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 404 });

    await expect(loginWithCredentials('https://cloud.example.com', 'alice', 'pass'))
      .rejects.toThrow('CalDAV introuvable');
  });

  it('lève une erreur générique pour tout autre code HTTP', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 503 });

    await expect(loginWithCredentials('https://cloud.example.com', 'alice', 'pass'))
      .rejects.toThrow('Erreur serveur (503)');
  });

  it('utilise l\'app-password OCS si disponible', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ status: 207, text: async () => '' }) // PROPFIND OK
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ocs: { data: { apppassword: 'app-token-xyz' } } }),
      });

    const result = await loginWithCredentials('https://cloud.example.com', 'alice', 'pass');
    expect(result.appPassword).toBe('app-token-xyz');
    expect(result.loginName).toBe('alice');
  });

  it('utilise le mot de passe en fallback si OCS échoue', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ status: 207, text: async () => '' }) // PROPFIND OK
      .mockResolvedValueOnce({ ok: false, status: 403 }); // OCS échoue

    const result = await loginWithCredentials('https://cloud.example.com', 'alice', 'pass');
    expect(result.appPassword).toBe('pass');
  });

  it('utilise le mot de passe en fallback si OCS lève une exception', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ status: 207, text: async () => '' })
      .mockRejectedValueOnce(new Error('OCS unreachable'));

    const result = await loginWithCredentials('https://cloud.example.com', 'alice', 'pass');
    expect(result.appPassword).toBe('pass');
  });
});

// ─── verifyCredentials ────────────────────────────────────────────────────────

describe('verifyCredentials', () => {
  it('retourne true pour 207 (Multi-Status)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 207 });
    expect(await verifyCredentials(mockCreds)).toBe(true);
  });

  it('retourne true pour 200', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 200 });
    expect(await verifyCredentials(mockCreds)).toBe(true);
  });

  it('retourne false pour 401', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 401 });
    expect(await verifyCredentials(mockCreds)).toBe(false);
  });

  it('retourne false si le réseau échoue', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    expect(await verifyCredentials(mockCreds)).toBe(false);
  });
});

// ─── SecureStore : save / load / clear ───────────────────────────────────────

describe('saveCredentials / loadCredentials / clearCredentials', () => {
  it('sauvegarde et recharge les credentials', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValueOnce(undefined);
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockCreds));

    await saveCredentials(mockCreds);
    const loaded = await loadCredentials();

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'nextcloud_credentials',
      JSON.stringify(mockCreds)
    );
    expect(loaded).toEqual(mockCreds);
  });

  it('retourne null si rien en SecureStore', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
    const result = await loadCredentials();
    expect(result).toBeNull();
  });

  it('retourne null si SecureStore lève une exception', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain error'));
    const result = await loadCredentials();
    expect(result).toBeNull();
  });

  it('appelle deleteItemAsync lors du clear', async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValueOnce(undefined);
    await clearCredentials();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('nextcloud_credentials');
  });

  it('ne lève pas d\'erreur si deleteItemAsync échoue', async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('err'));
    await expect(clearCredentials()).resolves.not.toThrow();
  });
});
