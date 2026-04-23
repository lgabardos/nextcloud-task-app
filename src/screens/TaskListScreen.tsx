import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  RefreshControl,
  Alert,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchTasks,
  createTask,
  updateTaskStatus,
  deleteTask,
  getPriorityInfo,
  formatDueDate,
  Task,
} from '../services/calDavService';
import { saveTasksToCache, loadTasksFromCache } from '../services/cacheService';
import { enqueuePendingAction } from '../services/pendingActionsService';
import { useSyncPending } from '../hooks/useSyncPending';
import { useAppStore } from '../store/appStore';
import { Button, Input } from '../components/UI';
import { Colors, Spacing, Radius } from '../utils/theme';

type FilterTab = 'pending' | 'completed' | 'all';

export default function TaskListScreen() {
  const params = useLocalSearchParams<{ id: string; url: string; name: string; color: string }>();
  const listId = params.id;
  const listUrl = decodeURIComponent(params.url || '');
  const listName = decodeURIComponent(params.name || 'Tâches');
  const listColor = decodeURIComponent(params.color || Colors.accent);

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>('pending');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSummary, setNewSummary] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<number>(0);
  const [adding, setAdding] = useState(false);

  const credentials = useAppStore((s) => s.credentials);
  const tasksByList = useAppStore((s) => s.tasksByList);
  const setTasksForList = useAppStore((s) => s.setTasksForList);
  const updateTask = useAppStore((s) => s.updateTask);
  const removeTask = useAppStore((s) => s.removeTask);
  const isOffline = useAppStore((s) => s.isOffline);

  const allTasks = tasksByList[listId] || [];

  const filteredTasks = allTasks.filter((t) => {
    if (filter === 'pending') return t.status !== 'COMPLETED' && t.status !== 'CANCELLED';
    if (filter === 'completed') return t.status === 'COMPLETED';
    return true;
  });

  const pendingCount = allTasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length;
  const completedCount = allTasks.filter((t) => t.status === 'COMPLETED').length;

  const loadTasks = useCallback(async () => {
    if (!credentials || !listUrl) return;
    setError(null);
    try {
      const tasks = await fetchTasks(credentials, listUrl);
      // Sort: pending first, then by priority, then by due date
      tasks.sort((a, b) => {
        if (a.status === 'COMPLETED' && b.status !== 'COMPLETED') return 1;
        if (a.status !== 'COMPLETED' && b.status === 'COMPLETED') return -1;
        const pa = a.priority || 10;
        const pb = b.priority || 10;
        if (pa !== pb) return pa - pb;
        return 0;
      });
      setTasksForList(listId, tasks);
      await saveTasksToCache(listId, tasks);
    } catch (e: any) {
      // Network failed — try cache
      const cached = await loadTasksFromCache(listId);
      if (cached && cached.length > 0) {
        setTasksForList(listId, cached);
        setError('📶 Hors-ligne — données depuis le cache');
      } else {
        setError(e.message || 'Erreur de chargement');
      }
    }
  }, [credentials, listUrl, listId]);

  useEffect(() => {
    if (!tasksByList[listId]) {
      loadTasks();
    }
  }, [loadTasks]);

  const { syncPending } = useSyncPending();

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTasks();
    // Si la connexion est revenue, rejouer les actions en attente
    const synced = await syncPending();
    if (synced > 0) {
      // Reload pour avoir l'état serveur à jour
      await loadTasks();
    }
    setRefreshing(false);
  };

  const handleToggle = async (task: Task) => {
    if (!credentials) return;
    const newCompleted = task.status !== 'COMPLETED';

    // Optimistic update (toujours, online ou offline)
    const optimisticTask = {
      ...task,
      status: (newCompleted ? 'COMPLETED' : 'NEEDS-ACTION') as Task['status'],
      percentComplete: newCompleted ? 100 : 0,
    };
    updateTask(listId, optimisticTask);

    if (isOffline) {
      // Mode hors-ligne : on enqueue l'action pour sync ultérieure
      await enqueuePendingAction({ type: 'TOGGLE_COMPLETE', taskUrl: task.url, listId, completed: newCompleted });
      // Mettre à jour le cache local avec le nouvel état
      const updatedTasks = (tasksByList[listId] || []).map((t) =>
        t.url === task.url ? optimisticTask : t
      );
      await saveTasksToCache(listId, updatedTasks);
      return;
    }

    try {
      await updateTaskStatus(credentials, task, newCompleted);
    } catch (e: any) {
      // Réseau perdu en cours de route — on enqueue et on garde l'état optimiste
      await enqueuePendingAction({ type: 'TOGGLE_COMPLETE', taskUrl: task.url, listId, completed: newCompleted });
      const updatedTasks = (tasksByList[listId] || []).map((t) =>
        t.url === task.url ? optimisticTask : t
      );
      await saveTasksToCache(listId, updatedTasks);
    }
  };

  const handleDelete = (task: Task) => {
    Alert.alert(
      'Supprimer la tâche',
      `Supprimer "${task.summary}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            if (!credentials) return;
            removeTask(listId, task.url);
            try {
              await deleteTask(credentials, task.url);
            } catch (e: any) {
              Alert.alert('Erreur', e.message);
              await loadTasks();
            }
          },
        },
      ]
    );
  };

  const handleAdd = async () => {
    if (!newSummary.trim() || !credentials) return;
    setAdding(true);
    try {
      await createTask(credentials, listUrl, {
        summary: newSummary.trim(),
        description: newDescription.trim() || undefined,
        priority: newPriority || undefined,
      });
      setNewSummary('');
      setNewDescription('');
      setNewPriority(0);
      setShowAddModal(false);
      await loadTasks();
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setAdding(false);
    }
  };

  const renderTask = ({ item }: { item: Task }) => {
    const isCompleted = item.status === 'COMPLETED';
    const priority = getPriorityInfo(item.priority);
    const due = formatDueDate(item.due);
    const isOverdue = item.due && !isCompleted && new Date() > parseDueDate(item.due);

    return (
      <View style={[styles.taskCard, isCompleted && styles.taskCardCompleted]}>
        {/* Checkbox */}
        <TouchableOpacity
          style={[styles.checkbox, isCompleted && { borderColor: listColor, backgroundColor: listColor + '22' }]}
          onPress={() => handleToggle(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {isCompleted && <Text style={[styles.checkmark, { color: listColor }]}>✓</Text>}
        </TouchableOpacity>

        {/* Content - tappable to open detail */}
        <TouchableOpacity
          style={styles.taskContent}
          onPress={() =>
            router.push(
              `/(app)/task/${encodeURIComponent(item.url)}?listId=${listId}&listColor=${encodeURIComponent(listColor)}`
            )
          }
          activeOpacity={0.7}
        >
          <Text style={[styles.taskSummary, isCompleted && styles.taskSummaryCompleted]} numberOfLines={2}>
            {item.summary}
          </Text>

          {item.description ? (
            <Text style={styles.taskDesc} numberOfLines={1}>{item.description}</Text>
          ) : null}

          <View style={styles.taskMeta}>
            {item.priority && item.priority > 0 ? (
              <View style={[styles.priorityDot, { backgroundColor: priority.color }]} />
            ) : null}
            {due ? (
              <Text style={[styles.taskDue, isOverdue && styles.taskDueOverdue]}>
                {isOverdue ? '⚠ ' : '📅 '}{due}
              </Text>
            ) : null}
            {item.categories?.map((cat) => (
              <View key={cat} style={styles.categoryTag}>
                <Text style={styles.categoryText}>{cat}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        {/* Delete */}
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.deleteBtnText}>×</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.headerDot, { backgroundColor: listColor }]} />
          <Text style={styles.headerTitle} numberOfLines={1}>{listName}</Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: listColor + '22', borderColor: listColor + '44' }]}
          onPress={() => setShowAddModal(true)}
        >
          <Text style={[styles.addBtnText, { color: listColor }]}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{pendingCount}</Text>
          <Text style={styles.statLabel}>En cours</Text>
        </View>
        <View style={[styles.statDivider]} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{completedCount}</Text>
          <Text style={styles.statLabel}>Terminées</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{allTasks.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.tabs}>
        {(['pending', 'completed', 'all'] as FilterTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, filter === tab && { ...styles.tabActive, borderColor: listColor }]}
            onPress={() => setFilter(tab)}
          >
            <Text style={[styles.tabText, filter === tab && { color: listColor }]}>
              {tab === 'pending' ? 'En cours' : tab === 'completed' ? 'Terminées' : 'Toutes'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠ {error}</Text>
          <TouchableOpacity onPress={loadTasks}>
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tasks */}
      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.url}
        renderItem={renderTask}
        contentContainerStyle={styles.flatList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={listColor}
            colors={[listColor]}
          />
        }
        ListEmptyComponent={
          !error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>
                {filter === 'completed' ? '🏆' : filter === 'pending' ? '✅' : '📝'}
              </Text>
              <Text style={styles.emptyText}>
                {refreshing ? 'Chargement…' :
                  filter === 'completed' ? 'Aucune tâche terminée' :
                  filter === 'pending' ? 'Toutes les tâches sont terminées !' :
                  'Aucune tâche'}
              </Text>
              {filter !== 'completed' && (
                <TouchableOpacity onPress={() => setShowAddModal(true)}>
                  <Text style={[styles.emptyAction, { color: listColor }]}>+ Ajouter une tâche</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
      />

      {/* Add task modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setShowAddModal(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Nouvelle tâche</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Input
                label="Titre"
                value={newSummary}
                onChangeText={setNewSummary}
                placeholder="Ex: Faire les courses"
                autoFocus
                returnKeyType="next"
              />

              <Input
                label="Description (optionnel)"
                value={newDescription}
                onChangeText={setNewDescription}
                placeholder="Détails..."
                multiline
                numberOfLines={3}
                style={{ height: 80, textAlignVertical: 'top' } as any}
              />

              <Text style={styles.priorityLabel}>PRIORITÉ</Text>
              <View style={styles.priorityRow}>
                {[
                  { value: 0, label: 'Aucune', color: Colors.textMuted },
                  { value: 1, label: 'Haute', color: Colors.priorityHigh },
                  { value: 5, label: 'Moyenne', color: Colors.priorityMedium },
                  { value: 9, label: 'Basse', color: Colors.priorityLow },
                ].map((p) => (
                  <TouchableOpacity
                    key={p.value}
                    style={[
                      styles.priorityBtn,
                      newPriority === p.value && {
                        backgroundColor: p.color + '22',
                        borderColor: p.color,
                      },
                    ]}
                    onPress={() => setNewPriority(p.value)}
                  >
                    <Text style={[styles.priorityBtnText, newPriority === p.value && { color: p.color }]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalActions}>
                <Button
                  label="Annuler"
                  onPress={() => setShowAddModal(false)}
                  variant="ghost"
                  style={{ flex: 1 }}
                />
                <Button
                  label="Créer"
                  onPress={handleAdd}
                  loading={adding}
                  disabled={!newSummary.trim()}
                  style={{ flex: 1, backgroundColor: listColor }}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function parseDueDate(dateStr: string): Date {
  const clean = dateStr.replace(/[TZ]/g, '').replace(/;.*$/, '');
  const year = parseInt(clean.substring(0, 4));
  const month = parseInt(clean.substring(4, 6)) - 1;
  const day = parseInt(clean.substring(6, 8));
  return new Date(year, month, day);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 40, height: 40,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  backText: { color: Colors.textPrimary, fontSize: 24, marginTop: -2 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerDot: { width: 10, height: 10, borderRadius: 5 },
  headerTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '800', flex: 1 },
  addBtn: {
    width: 40, height: 40,
    borderRadius: Radius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { fontSize: 24, fontWeight: '300', marginTop: -2 },

  statsRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { color: Colors.textPrimary, fontSize: 22, fontWeight: '800' },
  statLabel: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: Colors.border },

  tabs: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  tab: {
    flex: 1, paddingVertical: 8,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: 'transparent' },
  tabText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },

  flatList: { paddingHorizontal: Spacing.lg, paddingBottom: 100, gap: Spacing.sm },

  taskCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  taskCardCompleted: { opacity: 0.5 },
  checkbox: {
    width: 24, height: 24,
    borderRadius: 6,
    borderWidth: 2, borderColor: Colors.textMuted,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  checkmark: { fontSize: 14, fontWeight: '800' },
  taskContent: { flex: 1, gap: 4 },
  taskSummary: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  taskSummaryCompleted: { textDecorationLine: 'line-through', color: Colors.textMuted },
  taskDesc: { color: Colors.textSecondary, fontSize: 13 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  taskDue: { color: Colors.textMuted, fontSize: 11 },
  taskDueOverdue: { color: Colors.error },
  categoryTag: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  categoryText: { color: Colors.textMuted, fontSize: 10 },
  deleteBtn: {
    width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBtnText: { color: Colors.textMuted, fontSize: 22, fontWeight: '300' },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.errorDim,
    borderRadius: Radius.md,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
    padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.error + '44',
  },
  errorText: { color: Colors.error, fontSize: 13, flex: 1 },
  retryText: { color: Colors.accent, fontSize: 13, fontWeight: '700', marginLeft: Spacing.sm },

  empty: { alignItems: 'center', paddingTop: 60, gap: Spacing.sm },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: Colors.textSecondary, fontSize: 16, fontWeight: '600' },
  emptyAction: { fontSize: 15, fontWeight: '700', marginTop: 4 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 36, height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    color: Colors.textPrimary, fontSize: 20, fontWeight: '800',
    marginBottom: Spacing.lg,
  },
  priorityLabel: {
    color: Colors.textSecondary,
    fontSize: 12, fontWeight: '600', letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  priorityRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  priorityBtn: {
    flex: 1, paddingVertical: 8,
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center',
  },
  priorityBtnText: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
});
