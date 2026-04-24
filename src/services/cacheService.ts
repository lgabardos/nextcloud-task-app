import AsyncStorage from '@react-native-async-storage/async-storage';
import { TaskList, Task } from './calDavService';

const KEYS = {
  taskLists: 'cache:taskLists',
  taskPrefix: 'cache:tasks:',
  lastSync: 'cache:lastSync',
};

export interface CacheData {
  taskLists: TaskList[];
  tasksByList: Record<string, Task[]>;
  lastSync: number | null;
}

export async function saveTaskListsToCache(lists: TaskList[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.taskLists, JSON.stringify(lists));
    await AsyncStorage.setItem(KEYS.lastSync, String(Date.now()));
  } catch {
    // Cache non-critique, on ignore les erreurs
  }
}

export async function loadTaskListsFromCache(): Promise<TaskList[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.taskLists);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveTasksToCache(listId: string, tasks: Task[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.taskPrefix + listId, JSON.stringify(tasks));
  } catch {
    // ignore
  }
}

export async function loadTasksFromCache(listId: string): Promise<Task[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.taskPrefix + listId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function getLastSync(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.lastSync);
    if (!raw) return null;
    return parseInt(raw, 10);
  } catch {
    return null;
  }
}

export function formatLastSync(timestamp: number | null): string {
  if (!timestamp) return 'Jamais synchronisé';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (minutes < 1) return 'À l\'instant';
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (hours < 24) return `Il y a ${hours}h`;
  return new Date(timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export async function clearAllCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith('cache:'));
    await AsyncStorage.multiRemove(cacheKeys);
  } catch {
    // ignore
  }
}
