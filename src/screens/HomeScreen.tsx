import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Pressable,
  Linking,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchTaskLists, createTaskList, deleteTaskList, TaskList } from '../services/calDavService';
import { clearCredentials } from '../services/authService';
import {
  saveTaskListsToCache,
  loadTaskListsFromCache,
  getLastSync,
  formatLastSync,
  clearAllCache,
} from '../services/cacheService';
import { loadPendingActions, clearPendingActions } from '../services/pendingActionsService';
import { checkForUpdate, UpdateInfo } from '../services/updateService';
import { useSyncPending } from '../hooks/useSyncPending';
import { useAppStore } from '../store/appStore';
import { Colors, Spacing, Radius } from '../utils/theme';
import { ChevronRight, LogOut } from 'lucide-react-native';

const LIST_COLORS = [
  '#00C6BE', '#6366F1', '#EC4899', '#F59E0B',
  '#22C55E', '#EF4444', '#8B5CF6', '#0EA5E9',
  '#F97316', '#14B8A6',
];

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add list modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState(LIST_COLORS[0]);
  const [adding, setAdding] = useState(false);

  // Update banner
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  // Pending offline actions
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const credentials = useAppStore((s) => s.credentials);
  const taskLists = useAppStore((s) => s.taskLists);
  const tasksByList = useAppStore((s) => s.tasksByList);
  const setTaskLists = useAppStore((s) => s.setTaskLists);
  const setCredentials = useAppStore((s) => s.setCredentials);
  const isOffline = useAppStore((s) => s.isOffline);
  const setOffline = useAppStore((s) => s.setOffline);
  const lastSync = useAppStore((s) => s.lastSync);
  const setLastSync = useAppStore((s) => s.setLastSync);

  const { syncPending } = useSyncPending();

  // Load lists — network first, cache fallback
  const loadLists = useCallback(async (silent = false) => {
    if (!credentials) return;
    if (!silent) setError(null);

    try {
      const lists = await fetchTaskLists(credentials);
      setTaskLists(lists);
      setOffline(false);
      const now = Date.now();
      setLastSync(now);
      await saveTaskListsToCache(lists);
    } catch (e: any) {
      // Network failed — try cache
      const cached = await loadTaskListsFromCache();
      if (cached && cached.length > 0) {
        setTaskLists(cached);
        setOffline(true);
        const ts = await getLastSync();
        setLastSync(ts);
        if (!silent) setError('Mode hors-ligne — données depuis le cache');
      } else {
        setOffline(true);
        if (!silent) setError(e.message || 'Erreur de chargement');
      }
    }
  }, [credentials]);

  // Check for update on mount
  useEffect(() => {
    checkForUpdate().then((info) => {
      if (info?.available) setUpdateInfo(info);
    });
  }, []);

  // Load on mount (from cache instantly, then refresh from network)
  useEffect(() => {
    async function init() {
      // Show cache immediately
      const cached = await loadTaskListsFromCache();
      if (cached && cached.length > 0) {
        setTaskLists(cached);
        const ts = await getLastSync();
        setLastSync(ts);
      }
      // Count pending actions
      const pending = await loadPendingActions();
      setPendingCount(pending.length);
      // Then fetch fresh data
      await loadLists(true);
    }
    init();
  }, [loadLists]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLists(false);

    // Si on vient de retrouver le réseau, flush la queue
    const pending = await loadPendingActions();
    if (pending.length > 0 && !isOffline) {
      setSyncing(true);
      const synced = await syncPending();
      if (synced > 0) {
        const remaining = await loadPendingActions();
        setPendingCount(remaining.length);
      }
      setSyncing(false);
    }

    const updated = await loadPendingActions();
    setPendingCount(updated.length);
    setRefreshing(false);
  };

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Voulez-vous vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnexion',
          style: 'destructive',
          onPress: async () => {
            await clearCredentials();
            await clearAllCache();
            await clearPendingActions();
            setCredentials(null);
            setTaskLists([]);
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleAddList = async () => {
    if (!newListName.trim() || !credentials) return;
    setAdding(true);
    try {
      const newList = await createTaskList(credentials, newListName.trim(), newListColor);
      setTaskLists([...taskLists, newList]);
      await saveTaskListsToCache([...taskLists, newList]);
      setNewListName('');
      setNewListColor(LIST_COLORS[0]);
      setShowAddModal(false);
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteList = (item: TaskList) => {
    Alert.alert(
      'Supprimer la liste',
      `Supprimer "${item.displayName}" et toutes ses tâches ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            if (!credentials) return;
            try {
              await deleteTaskList(credentials, item.url);
              const updated = taskLists.filter((l) => l.id !== item.id);
              setTaskLists(updated);
              await saveTaskListsToCache(updated);
            } catch (e: any) {
              Alert.alert('Erreur', e.message);
            }
          },
        },
      ]
    );
  };

  const getTaskCount = (listId: string) => {
    const tasks = tasksByList[listId];
    if (!tasks) return null;
    return tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length;
  };

  const renderList = ({ item }: { item: TaskList }) => {
    const color = item.color || Colors.accent;
    const count = getTaskCount(item.id);

    return (
      <TouchableOpacity
        style={styles.listCard}
        onPress={() =>
          router.push(
            `/(app)/list/${item.id}?url=${encodeURIComponent(item.url)}&name=${encodeURIComponent(item.displayName)}&color=${encodeURIComponent(color)}`
          )
        }
        onLongPress={() => handleDeleteList(item)}
        delayLongPress={600}
        activeOpacity={0.75}
      >
        <View style={[styles.listColorBar, { backgroundColor: color }]} />
        <View style={styles.listContent}>
          <View style={styles.listHeader}>
            <Text style={styles.listName} numberOfLines={1}>{item.displayName}</Text>
            {count !== null && (
              <View style={[styles.countBadge, { backgroundColor: color + '22' }]}>
                <Text style={[styles.countText, { color }]}>{count}</Text>
              </View>
            )}
          </View>
          <Text style={styles.listUrl} numberOfLines={1}>
            {item.url.split('/dav/calendars/')[1] || item.url}
          </Text>
        </View>
        <Text style={styles.chevron}><ChevronRight color={styles.chevron.color} size={styles.chevron.fontSize} /></Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      {/* Update banner */}
      {updateInfo?.available && (
        <TouchableOpacity
          style={styles.updateBanner}
          onPress={() => Linking.openURL(updateInfo.releaseUrl)}
          activeOpacity={0.8}
        >
          <Text style={styles.updateIcon}>🆕</Text>
          <View style={styles.updateText}>
            <Text style={styles.updateTitle}>
              Mise à jour disponible — v{updateInfo.latestVersion}
            </Text>
            <Text style={styles.updateSub}>Appuyez pour télécharger</Text>
          </View>
          <Text style={styles.updateChevron}><ChevronRight color={styles.chevron.color} size={styles.chevron.fontSize} /></Text>
        </TouchableOpacity>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>Connecté à</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {credentials?.serverUrl.replace('https://', '').replace('http://', '')}
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}><LogOut color={styles.logoutText.color} size={styles.logoutText.fontSize} /></Text>
        </TouchableOpacity>
      </View>

      {/* Offline + sync bar */}
      {(isOffline || lastSync || pendingCount > 0) && (
        <View style={[styles.syncBar, isOffline && styles.syncBarOffline]}>
          <Text style={[styles.syncText, isOffline && styles.syncTextOffline]}>
            {syncing
              ? '🔄 Synchronisation en cours…'
              : isOffline
              ? `📶 Hors-ligne · ${formatLastSync(lastSync)}`
              : `✓ ${formatLastSync(lastSync)}`}
          </Text>
          {pendingCount > 0 && !syncing && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>
                {pendingCount} action{pendingCount > 1 ? 's' : ''} en attente
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Section title + add button */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>MES LISTES</Text>
        <View style={styles.sectionRight}>
          <Text style={styles.sectionCount}>{taskLists.length} liste{taskLists.length !== 1 ? 's' : ''}</Text>
          <TouchableOpacity
            style={styles.addListBtn}
            onPress={() => setShowAddModal(true)}
            disabled={isOffline}
          >
            <Text style={[styles.addListBtnText, isOffline && { opacity: 0.4 }]}>+ Nouvelle</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Error */}
      {error && (
        <View style={[styles.errorBanner, isOffline && styles.offlineBanner]}>
          <Text style={[styles.errorText, isOffline && styles.offlineText]}>{error}</Text>
          {!isOffline && (
            <TouchableOpacity onPress={() => loadLists(false)}>
              <Text style={styles.retryText}>Réessayer</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* List */}
      <FlatList
        data={taskLists}
        keyExtractor={(item) => item.id}
        renderItem={renderList}
        contentContainerStyle={styles.flatList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.accent}
            colors={[Colors.accent]}
          />
        }
        ListEmptyComponent={
          !error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>
                {refreshing ? 'Chargement…' : 'Aucune liste de tâches trouvée'}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(true)} disabled={isOffline}>
                <Text style={[styles.emptyAction, isOffline && { opacity: 0.4 }]}>
                  + Créer une liste
                </Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />

      {/* Long press hint */}
      {taskLists.length > 0 && (
        <Text style={styles.longPressHint}>Appui long sur une liste pour la supprimer</Text>
      )}

      {/* Add list modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAddModal(false)} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Nouvelle liste</Text>

          <Text style={styles.inputLabel}>NOM DE LA LISTE</Text>
          <TextInput
            style={styles.textInput}
            value={newListName}
            onChangeText={setNewListName}
            placeholder="Ex: Travail, Personnel…"
            placeholderTextColor={Colors.textMuted}
            selectionColor={Colors.accent}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleAddList}
          />

          <Text style={styles.inputLabel}>COULEUR</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorScroll}>
            {LIST_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: c },
                  newListColor === c && styles.colorSwatchSelected,
                ]}
                onPress={() => setNewListColor(c)}
              >
                {newListColor === c && <Text style={styles.colorCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Preview */}
          <View style={[styles.listPreview, { borderColor: Colors.border }]}>
            <View style={[styles.listColorBar, { backgroundColor: newListColor }]} />
            <Text style={styles.listPreviewName}>{newListName || 'Nom de la liste'}</Text>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalBtn, styles.modalBtnCancel]}
              onPress={() => { setShowAddModal(false); setNewListName(''); }}
            >
              <Text style={styles.modalBtnCancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modalBtn,
                { backgroundColor: newListColor },
                (!newListName.trim() || adding) && styles.modalBtnDisabled,
              ]}
              onPress={handleAddList}
              disabled={!newListName.trim() || adding}
            >
              <Text style={styles.modalBtnCreateText}>
                {adding ? 'Création…' : 'Créer'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  // Update banner
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#22C55E33',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    gap: Spacing.sm,
  },
  updateIcon: { fontSize: 18 },
  updateText: { flex: 1 },
  updateTitle: { color: '#22C55E', fontSize: 13, fontWeight: '700' },
  updateSub: { color: '#22C55E99', fontSize: 11, marginTop: 1 },
  updateChevron: { color: '#22C55E', fontSize: 20 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  headerSub: { color: Colors.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  headerTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  logoutBtn: {
    width: 40, height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  logoutText: { fontSize: 18, color: Colors.textPrimary },

  // Sync bar
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    marginBottom: 4,
  },
  syncBarOffline: {
    backgroundColor: '#1A1500',
    borderBottomWidth: 1,
    borderBottomColor: '#F59E0B22',
  },
  syncText: { color: Colors.textMuted, fontSize: 11 },
  syncTextOffline: { color: '#F59E0B' },
  pendingBadge: {
    backgroundColor: '#F59E0B22',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#F59E0B44',
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: Spacing.sm,
  },
  pendingBadgeText: { color: '#F59E0B', fontSize: 10, fontWeight: '700' },

  // Section row
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  sectionTitle: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sectionCount: { color: Colors.textMuted, fontSize: 12 },
  addListBtn: {
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: Colors.accentGlow,
    borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.accent + '44',
  },
  addListBtnText: { color: Colors.accent, fontSize: 12, fontWeight: '700' },

  flatList: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.sm },

  listCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  listColorBar: { width: 4, alignSelf: 'stretch' },
  listContent: { flex: 1, padding: Spacing.md },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  listName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700', flex: 1 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  countText: { fontSize: 12, fontWeight: '800' },
  listUrl: { color: Colors.textMuted, fontSize: 12, marginTop: 3 },
  chevron: { color: Colors.textMuted, fontSize: 24, paddingRight: Spacing.md },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.errorDim, borderRadius: Radius.md,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '44',
  },
  offlineBanner: { backgroundColor: '#1A1500', borderColor: '#F59E0B44' },
  errorText: { color: Colors.error, fontSize: 13, flex: 1 },
  offlineText: { color: '#F59E0B' },
  retryText: { color: Colors.accent, fontSize: 13, fontWeight: '700', marginLeft: Spacing.sm },

  empty: { alignItems: 'center', paddingTop: 60, gap: Spacing.sm },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: Colors.textSecondary, fontSize: 16, fontWeight: '600' },
  emptyAction: { color: Colors.accent, fontSize: 15, fontWeight: '700', marginTop: 4 },

  longPressHint: {
    color: Colors.textMuted, fontSize: 11,
    textAlign: 'center', paddingBottom: 12,
  },

  // Modal
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    borderTopWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, paddingBottom: 40,
  },
  modalHandle: {
    width: 36, height: 4, backgroundColor: Colors.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.lg,
  },
  modalTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '800', marginBottom: Spacing.lg },
  inputLabel: {
    color: Colors.textSecondary, fontSize: 11, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
  },
  textInput: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    height: 52, paddingHorizontal: Spacing.md,
    color: Colors.textPrimary, fontSize: 15,
    marginBottom: Spacing.lg,
  },
  colorScroll: { marginBottom: Spacing.lg },
  colorSwatch: {
    width: 36, height: 36, borderRadius: 18,
    marginRight: 10, alignItems: 'center', justifyContent: 'center',
  },
  colorSwatchSelected: {
    borderWidth: 3, borderColor: Colors.textPrimary,
    transform: [{ scale: 1.15 }],
  },
  colorCheck: { color: '#fff', fontSize: 16, fontWeight: '800' },

  listPreview: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md, borderWidth: 1,
    overflow: 'hidden', marginBottom: Spacing.lg, height: 48,
  },
  listPreviewName: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700', paddingHorizontal: Spacing.md },

  modalActions: { flexDirection: 'row', gap: Spacing.sm },
  modalBtn: { flex: 1, height: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  modalBtnCancelText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '700' },
  modalBtnCreateText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  modalBtnDisabled: { opacity: 0.4 },
});
