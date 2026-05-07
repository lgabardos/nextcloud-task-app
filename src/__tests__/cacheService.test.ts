/**
 * Tests pour cacheService.ts
 *
 * Couvre :
 * - save/load des task lists
 * - save/load des tâches par liste
 * - getLastSync
 * - formatLastSync
 * - clearAllCache
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveTaskListsToCache,
  loadTaskListsFromCache,
  saveTasksToCache,
  loadTasksFromCache,
  getLastSync,
  formatLastSync,
  clearAllCache,
} from '../services/cacheService';
import type { TaskList, Task } from '../services/calDavService';

const mockLists: TaskList[] = [
  { id: 'work', url: 'https://cloud.example.com/dav/calendars/alice/work/', displayName: 'Travail', color: '#6366F1' },
  { id: 'perso', url: 'https://cloud.example.com/dav/calendars/alice/perso/', displayName: 'Personnel' },
];

const mockTask: Task = {
  id: 'task-1.ics',
  url: 'https://cloud.example.com/dav/calendars/alice/work/task-1.ics',
  uid: 'abc-123',
  summary: 'Faire les courses',
  status: 'NEEDS-ACTION',
  calendarUrl: 'https://cloud.example.com/dav/calendars/alice/work/',
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

// ─── Task lists ───────────────────────────────────────────────────────────────

describe('saveTaskListsToCache / loadTaskListsFromCache', () => {
  it('sauvegarde et recharge les listes correctement', async () => {
    await saveTaskListsToCache(mockLists);
    const result = await loadTaskListsFromCache();

    expect(result).toHaveLength(2);
    expect(result![0].id).toBe('work');
    expect(result![1].displayName).toBe('Personnel');
  });

  it('retourne null si rien en cache', async () => {
    const result = await loadTaskListsFromCache();
    expect(result).toBeNull();
  });

  it('met à jour lastSync lors de la sauvegarde', async () => {
    const before = Date.now();
    await saveTaskListsToCache(mockLists);
    const ts = await getLastSync();

    expect(ts).not.toBeNull();
    expect(ts!).toBeGreaterThanOrEqual(before);
    expect(ts!).toBeLessThanOrEqual(Date.now());
  });

  it('écrase les listes précédentes', async () => {
    await saveTaskListsToCache(mockLists);
    await saveTaskListsToCache([mockLists[0]]); // seulement 1

    const result = await loadTaskListsFromCache();
    expect(result).toHaveLength(1);
  });
});

// ─── Tasks par liste ──────────────────────────────────────────────────────────

describe('saveTasksToCache / loadTasksFromCache', () => {
  it('sauvegarde et recharge les tâches d\'une liste', async () => {
    await saveTasksToCache('work', [mockTask]);
    const result = await loadTasksFromCache('work');

    expect(result).toHaveLength(1);
    expect(result![0].uid).toBe('abc-123');
    expect(result![0].summary).toBe('Faire les courses');
  });

  it('retourne null si aucun cache pour cette liste', async () => {
    const result = await loadTasksFromCache('liste-inconnue');
    expect(result).toBeNull();
  });

  it('isole les caches par listId', async () => {
    await saveTasksToCache('work', [mockTask]);
    await saveTasksToCache('perso', [{ ...mockTask, id: 'task-perso.ics', summary: 'Tâche perso' }]);

    const work = await loadTasksFromCache('work');
    const perso = await loadTasksFromCache('perso');

    expect(work![0].summary).toBe('Faire les courses');
    expect(perso![0].summary).toBe('Tâche perso');
  });

  it('sauvegarde un tableau vide sans erreur', async () => {
    await saveTasksToCache('work', []);
    const result = await loadTasksFromCache('work');
    expect(result).toEqual([]);
  });
});

// ─── clearAllCache ────────────────────────────────────────────────────────────

describe('clearAllCache', () => {
  it('supprime toutes les clés cache:', async () => {
    await saveTaskListsToCache(mockLists);
    await saveTasksToCache('work', [mockTask]);

    await clearAllCache();

    expect(await loadTaskListsFromCache()).toBeNull();
    expect(await loadTasksFromCache('work')).toBeNull();
    expect(await getLastSync()).toBeNull();
  });

  it('ne supprime pas les clés hors cache:', async () => {
    await AsyncStorage.setItem('autre:donnee', 'conservée');
    await saveTaskListsToCache(mockLists);

    await clearAllCache();

    const other = await AsyncStorage.getItem('autre:donnee');
    expect(other).toBe('conservée');
  });
});

// ─── formatLastSync ───────────────────────────────────────────────────────────

describe('formatLastSync', () => {
  it('retourne "Jamais synchronisé" pour null', () => {
    expect(formatLastSync(null)).toBe('Jamais synchronisé');
  });

  it('retourne "À l\'instant" pour moins d\'une minute', () => {
    expect(formatLastSync(Date.now() - 30_000)).toBe("À l'instant");
  });

  it('retourne "Il y a N min" pour moins d\'une heure', () => {
    const result = formatLastSync(Date.now() - 5 * 60_000); // 5 min
    expect(result).toBe('Il y a 5 min');
  });

  it('retourne "Il y a Nh" pour moins de 24h', () => {
    const result = formatLastSync(Date.now() - 3 * 3_600_000); // 3h
    expect(result).toBe('Il y a 3h');
  });

  it('retourne une date formatée pour plus de 24h', () => {
    const ts = Date.now() - 2 * 24 * 3_600_000; // 2 jours
    const result = formatLastSync(ts);
    // Doit contenir au moins l'année
    expect(result).toMatch(/^\d{2} \w+, \d{2}:\d{2}$/);
  });
});
