import { useCallback, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { updateTaskStatus } from '../services/calDavService';
import { saveTasksToCache } from '../services/cacheService';
import {
  loadPendingActions,
  removePendingAction,
  PendingAction,
} from '../services/pendingActionsService';

/**
 * Hook qui flush la queue d'actions offline dès que le réseau revient.
 * À appeler dans HomeScreen (et optionnellement dans TaskListScreen).
 *
 * Retourne `syncPending()` à appeler manuellement après un refresh réseau réussi.
 */
export function useSyncPending() {
  const credentials = useAppStore((s) => s.credentials);
  const tasksByList = useAppStore((s) => s.tasksByList);
  const updateTask = useAppStore((s) => s.updateTask);
  const setOffline = useAppStore((s) => s.setOffline);
  const isSyncing = useRef(false);

  const syncPending = useCallback(async (): Promise<number> => {
    if (!credentials || isSyncing.current) return 0;
    const pending = await loadPendingActions();
    if (pending.length === 0) return 0;

    isSyncing.current = true;
    let synced = 0;
    const failed: PendingAction[] = [];

    for (const action of pending) {
      try {
        if (action.type === 'TOGGLE_COMPLETE') {
          // On retrouve la tâche dans le store (ou on reconstruit un objet minimal)
          const taskInStore = (tasksByList[action.listId] || []).find(
            (t) => t.url === action.taskUrl
          );

          if (!taskInStore) {
            // Tâche non trouvée en mémoire — on retire l'action silencieusement
            await removePendingAction(action.id);
            continue;
          }

          await updateTaskStatus(credentials, taskInStore, action.completed);

          // Mettre à jour le store pour refléter l'état confirmé
          updateTask(action.listId, {
            ...taskInStore,
            status: action.completed ? 'COMPLETED' : 'NEEDS-ACTION',
            percentComplete: action.completed ? 100 : 0,
          });

          await removePendingAction(action.id);
          synced++;
        }
      } catch {
        failed.push(action);
      }
    }

    // Sauvegarder le cache mis à jour pour chaque liste touchée
    const affectedLists = [...new Set(pending.map((a) => a.listId))];
    for (const listId of affectedLists) {
      const tasks = tasksByList[listId];
      if (tasks) await saveTasksToCache(listId, tasks);
    }

    if (failed.length === 0) {
      setOffline(false);
    }

    isSyncing.current = false;
    return synced;
  }, [credentials, tasksByList, updateTask, setOffline]);

  return { syncPending };
}
