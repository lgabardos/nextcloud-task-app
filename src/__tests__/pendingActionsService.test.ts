/**
 * Tests pour pendingActionsService.ts
 *
 * Couvre toute la logique de la queue d'actions offline :
 * - enqueue / load / remove / clear
 * - déduplication (même état cible)
 * - annulation (états inverses)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadPendingActions,
  enqueuePendingAction,
  removePendingAction,
  clearPendingActions,
} from '../services/pendingActionsService';

const baseAction = {
  type: 'TOGGLE_COMPLETE' as const,
  taskUrl: 'https://cloud.example.com/dav/calendars/alice/work/task-1.ics',
  listId: 'work',
  completed: true,
};

beforeEach(async () => {
  // Vider AsyncStorage entre chaque test
  await AsyncStorage.clear();
});

// ─── loadPendingActions ───────────────────────────────────────────────────────

describe('loadPendingActions', () => {
  it('retourne un tableau vide si rien en storage', async () => {
    const result = await loadPendingActions();
    expect(result).toEqual([]);
  });

  it('retourne les actions stockées', async () => {
    const actions = [{ ...baseAction, id: 'id-1', createdAt: 1000 }];
    await AsyncStorage.setItem('offline:pendingActions', JSON.stringify(actions));

    const result = await loadPendingActions();
    expect(result).toHaveLength(1);
    expect(result[0].taskUrl).toBe(baseAction.taskUrl);
  });

  it('retourne un tableau vide si le JSON est corrompu', async () => {
    await AsyncStorage.setItem('offline:pendingActions', 'invalid-json{{{');
    const result = await loadPendingActions();
    expect(result).toEqual([]);
  });
});

// ─── enqueuePendingAction ─────────────────────────────────────────────────────

describe('enqueuePendingAction', () => {
  it('ajoute une nouvelle action', async () => {
    await enqueuePendingAction(baseAction);
    const result = await loadPendingActions();

    expect(result).toHaveLength(1);
    expect(result[0].taskUrl).toBe(baseAction.taskUrl);
    expect(result[0].completed).toBe(true);
    expect(result[0].id).toBeDefined();
    expect(result[0].createdAt).toBeGreaterThan(0);
  });

  it('ajoute plusieurs actions pour des tâches différentes', async () => {
    await enqueuePendingAction(baseAction);
    await enqueuePendingAction({
      ...baseAction,
      taskUrl: 'https://cloud.example.com/dav/calendars/alice/work/task-2.ics',
    });

    const result = await loadPendingActions();
    expect(result).toHaveLength(2);
  });

  it('ignore un doublon exact (même tâche, même état cible)', async () => {
    await enqueuePendingAction(baseAction);
    await enqueuePendingAction(baseAction); // doublon

    const result = await loadPendingActions();
    expect(result).toHaveLength(1);
  });

  it('annule les deux actions si états inverses (toggle → retoggle)', async () => {
    await enqueuePendingAction({ ...baseAction, completed: true });
    await enqueuePendingAction({ ...baseAction, completed: false }); // annulation

    const result = await loadPendingActions();
    expect(result).toHaveLength(0); // les deux s'annulent
  });

  it('attribue des IDs uniques à chaque action', async () => {
    await enqueuePendingAction(baseAction);
    await enqueuePendingAction({
      ...baseAction,
      taskUrl: 'https://cloud.example.com/dav/calendars/alice/work/task-other.ics',
    });

    const result = await loadPendingActions();
    expect(result[0].id).not.toBe(result[1].id);
  });
});

// ─── removePendingAction ──────────────────────────────────────────────────────

describe('removePendingAction', () => {
  it('supprime une action par son id', async () => {
    await enqueuePendingAction(baseAction);
    const before = await loadPendingActions();
    expect(before).toHaveLength(1);

    await removePendingAction(before[0].id);
    const after = await loadPendingActions();
    expect(after).toHaveLength(0);
  });

  it('ne fait rien si l\'id n\'existe pas', async () => {
    await enqueuePendingAction(baseAction);
    await removePendingAction('id-inexistant');

    const result = await loadPendingActions();
    expect(result).toHaveLength(1); // l'autre action est intacte
  });

  it('supprime seulement l\'action ciblée parmi plusieurs', async () => {
    await enqueuePendingAction(baseAction);
    await enqueuePendingAction({
      ...baseAction,
      taskUrl: 'https://cloud.example.com/dav/calendars/alice/work/task-2.ics',
    });

    const before = await loadPendingActions();
    expect(before).toHaveLength(2);

    await removePendingAction(before[0].id);
    const after = await loadPendingActions();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before[1].id);
  });
});

// ─── clearPendingActions ──────────────────────────────────────────────────────

describe('clearPendingActions', () => {
  it('vide toute la queue', async () => {
    await enqueuePendingAction(baseAction);
    await enqueuePendingAction({
      ...baseAction,
      taskUrl: 'https://cloud.example.com/dav/calendars/alice/work/task-2.ics',
    });

    await clearPendingActions();
    const result = await loadPendingActions();
    expect(result).toHaveLength(0);
  });

  it('ne plante pas si la queue est déjà vide', async () => {
    await expect(clearPendingActions()).resolves.not.toThrow();
  });
});

// ─── Scénarios offline réalistes ─────────────────────────────────────────────

describe('Scénarios offline', () => {
  it('scénario : marquer 3 tâches offline, une re-togglée', async () => {
    const task1 = { ...baseAction, taskUrl: 'task-1.ics' };
    const task2 = { ...baseAction, taskUrl: 'task-2.ics' };
    const task3 = { ...baseAction, taskUrl: 'task-3.ics' };

    await enqueuePendingAction(task1);
    await enqueuePendingAction(task2);
    await enqueuePendingAction(task3);
    // L'utilisateur re-coche task2 (annulation)
    await enqueuePendingAction({ ...task2, completed: false });

    const result = await loadPendingActions();
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.taskUrl)).toEqual(['task-1.ics', 'task-3.ics']);
  });

  it('scénario : queue vidée après sync réussie', async () => {
    await enqueuePendingAction(baseAction);
    const pending = await loadPendingActions();

    // Simuler le flush : retire chaque action une par une
    for (const action of pending) {
      await removePendingAction(action.id);
    }

    const after = await loadPendingActions();
    expect(after).toHaveLength(0);
  });
});
