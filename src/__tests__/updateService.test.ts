/**
 * Tests pour updateService.ts
 *
 * On teste la logique de comparaison de versions sémantiques
 * et le comportement de checkForUpdate avec fetch mocké.
 */

// On exporte les fonctions internes via un re-export pour les tester
// Comme parseVersion/isNewer sont privées, on les teste via checkForUpdate

describe("checkForUpdate — comparaison de versions", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.resetModules();
  });

  const mockRelease = (tagName: string) => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: tagName,
        html_url:
          "https://github.com/lgabardos/nextcloud-task-app/releases/tag/" +
          tagName,
        body: "Notes de version",
        published_at: "2025-07-01T00:00:00Z",
      }),
    });
  };

  it("détecte une mise à jour disponible (patch)", async () => {
    jest.mock("expo-constants", () => ({
      default: { expoConfig: { version: "1.0.0" } },
    }));
    mockRelease("v1.0.1");

    const { checkForUpdate } = require("../services/updateService");
    const result = await checkForUpdate();
    expect(result?.available).toBe(true);
    expect(result?.latestVersion).toBe("v1.0.1");
    expect(result?.currentVersion).toBe("1.0.0");
  });

  it("détecte une mise à jour disponible (minor)", async () => {
    jest.mock("expo-constants", () => ({
      default: { expoConfig: { version: "1.0.0" } },
    }));
    mockRelease("v1.1.0");

    const { checkForUpdate } = require("../services/updateService");
    const result = await checkForUpdate();
    expect(result?.available).toBe(true);
  });

  it("détecte une mise à jour disponible (major)", async () => {
    jest.mock("expo-constants", () => ({
      default: { expoConfig: { version: "1.5.3" } },
    }));
    mockRelease("v2.0.0");

    const { checkForUpdate } = require("../services/updateService");
    const result = await checkForUpdate();
    expect(result?.available).toBe(true);
  });

  it("retourne available=false si même version", async () => {
    jest.mock("expo-constants", () => ({
      expoConfig: { version: "1.2.3" },
    }));
    mockRelease("v1.2.3");

    const { checkForUpdate } = require("../services/updateService");
    const result = await checkForUpdate();
    expect(result?.available).toBe(false);
  });

  it("retourne available=false si version locale plus récente", async () => {
    jest.mock("expo-constants", () => ({
      expoConfig: { version: "2.0.0" },
    }));
    mockRelease("v1.9.9");

    const { checkForUpdate } = require("../services/updateService");
    const result = await checkForUpdate();
    expect(result?.available).toBe(false);
  });

  it('fonctionne sans préfixe "v" dans le tag', async () => {
    jest.mock("expo-constants", () => ({
      default: { expoConfig: { version: "1.0.0" } },
    }));
    mockRelease("1.2.0"); // sans "v"

    const { checkForUpdate } = require("../services/updateService");
    const result = await checkForUpdate();
    expect(result?.available).toBe(true);
  });

  it("retourne null si le réseau échoue", async () => {
    jest.mock("expo-constants", () => ({
      default: { expoConfig: { version: "1.0.0" } },
    }));
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

    const { checkForUpdate } = require("../services/updateService");
    const result = await checkForUpdate();
    expect(result).toBeNull();
  });

  it("retourne null si la réponse GitHub est non-ok", async () => {
    jest.mock("expo-constants", () => ({
      default: { expoConfig: { version: "1.0.0" } },
    }));
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const { checkForUpdate } = require("../services/updateService");
    const result = await checkForUpdate();
    expect(result).toBeNull();
  });

  it("retourne null si tag_name est absent", async () => {
    jest.mock("expo-constants", () => ({
      default: { expoConfig: { version: "1.0.0" } },
    }));
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: "https://github.com" }), // pas de tag_name
    });

    const { checkForUpdate } = require("../services/updateService");
    const result = await checkForUpdate();
    expect(result).toBeNull();
  });

  it("inclut releaseNotes et publishedAt dans le résultat", async () => {
    jest.mock("expo-constants", () => ({
      default: { expoConfig: { version: "1.0.0" } },
    }));
    mockRelease("v1.1.0");

    const { checkForUpdate } = require("../services/updateService");
    const result = await checkForUpdate();
    expect(result?.releaseNotes).toBe("Notes de version");
    expect(result?.publishedAt).toBe("2025-07-01T00:00:00Z");
    expect(result?.releaseUrl).toContain("v1.1.0");
  });
});
