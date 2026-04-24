import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'offline:pendingActions';

export type PendingActionType = 'TOGGLE_COMPLETE';

export interface PendingAction {
  id: string;               // unique id for dedup
  type: PendingActionType;
  taskUrl: string;
  listId: string;
  completed: boolean;       // target state
  createdAt: number;
}

export async function loadPendingActions(): Promise<PendingAction[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function enqueuePendingAction(
  action: Omit<PendingAction, 'id' | 'createdAt'>
): Promise<void> {
  try {
    const existing = await loadPendingActions();

    // Si une action existe déjà pour cette tâche, on la remplace
    // (ex: toggle → toggle : les deux s'annulent, on supprime)
    const sameTask = existing.find((a) => a.taskUrl === action.taskUrl);
    let updated: PendingAction[];

    if (sameTask) {
      if (sameTask.completed === action.completed) {
        // Même état cible — doublon, on ignore
        return;
      } else {
        // État inverse — les deux s'annulent, on retire l'action
        updated = existing.filter((a) => a.taskUrl !== action.taskUrl);
      }
    } else {
      updated = [
        ...existing,
        {
          ...action,
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          createdAt: Date.now(),
        },
      ];
    }

    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export async function removePendingAction(id: string): Promise<void> {
  try {
    const existing = await loadPendingActions();
    const updated = existing.filter((a) => a.id !== id);
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export async function clearPendingActions(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
