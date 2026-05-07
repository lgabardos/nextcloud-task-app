// Mocks pour les modules natifs non disponibles dans l'environnement Jest

// expo-secure-store
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// expo-constants
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: { version: '1.0.0' },
  },
  expoConfig: { version: '1.0.0' },
}));

// @react-native-async-storage/async-storage
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
    getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    removeItem: jest.fn((key: string) => {
      delete store[key];
      return Promise.resolve();
    }),
    getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
    multiRemove: jest.fn((keys: string[]) => {
      keys.forEach((k) => delete store[k]);
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach((k) => delete store[k]);
      return Promise.resolve();
    }),
    __store: store,
  };
});

// Silence console.error dans les tests (erreurs React attendues)
global.console.error = jest.fn();
