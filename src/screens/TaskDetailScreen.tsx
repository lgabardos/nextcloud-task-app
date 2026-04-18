import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Task, updateTaskStatus, deleteTask, getPriorityInfo, formatDueDate } from '../../src/services/calDavService';
import { useAppStore } from '../../src/store/appStore';
import { Button } from '../../src/components/UI';
import { Colors, Spacing, Radius } from '../../src/utils/theme';

export default function TaskDetailScreen() {
  const params = useLocalSearchParams<{
    taskUrl: string;
    listId: string;
    listColor: string;
  }>();

  const listId = params.listId;
  const taskUrl = decodeURIComponent(params.taskUrl || '');
  const listColor = decodeURIComponent(params.listColor || Colors.accent);

  const credentials = useAppStore((s) => s.credentials);
  const tasksByList = useAppStore((s) => s.tasksByList);
  const updateTaskInStore = useAppStore((s) => s.updateTask);
  const removeTask = useAppStore((s) => s.removeTask);

  const task = (tasksByList[listId] || []).find((t) => t.url === taskUrl);

  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!task) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Tâche introuvable</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>← Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isCompleted = task.status === 'COMPLETED';
  const priority = getPriorityInfo(task.priority);
  const due = formatDueDate(task.due);

  const handleToggle = async () => {
    if (!credentials) return;
    setToggling(true);
    const newCompleted = !isCompleted;
    updateTaskInStore(listId, { ...task, status: newCompleted ? 'COMPLETED' : 'NEEDS-ACTION' });
    try {
      await updateTaskStatus(credentials, task, newCompleted);
    } catch (e: any) {
      updateTaskInStore(listId, task);
      Alert.alert('Erreur', e.message);
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Supprimer', `Supprimer "${task.summary}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          if (!credentials) return;
          setDeleting(true);
          try {
            await deleteTask(credentials, task.url);
            removeTask(listId, task.url);
            router.back();
          } catch (e: any) {
            Alert.alert('Erreur', e.message);
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détail</Text>
          <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} disabled={deleting}>
            <Text style={styles.deleteBtnText}>{deleting ? '…' : '🗑'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Status banner */}
          <TouchableOpacity
            style={[
              styles.statusBanner,
              isCompleted
                ? { backgroundColor: listColor + '22', borderColor: listColor + '44' }
                : { backgroundColor: Colors.bgCard, borderColor: Colors.border },
            ]}
            onPress={handleToggle}
            disabled={toggling}
            activeOpacity={0.75}
          >
            <View style={[styles.statusCheck, isCompleted && { borderColor: listColor, backgroundColor: listColor + '33' }]}>
              {isCompleted && <Text style={[styles.statusCheckmark, { color: listColor }]}>✓</Text>}
            </View>
            <Text style={[styles.statusLabel, isCompleted && { color: listColor }]}>
              {toggling ? 'Mise à jour…' : isCompleted ? 'Terminée — Appuyer pour rouvrir' : 'En cours — Appuyer pour terminer'}
            </Text>
          </TouchableOpacity>

          {/* Title */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>TITRE</Text>
            <Text style={[styles.taskTitle, isCompleted && styles.taskTitleCompleted]}>
              {task.summary}
            </Text>
          </View>

          {/* Description */}
          {task.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>DESCRIPTION</Text>
              <View style={styles.descBox}>
                <Text style={styles.descText}>{task.description}</Text>
              </View>
            </View>
          ) : null}

          {/* Meta grid */}
          <View style={styles.metaGrid}>
            {/* Priority */}
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>PRIORITÉ</Text>
              <View style={styles.metaRow}>
                <View style={[styles.priorityDot, { backgroundColor: priority.color }]} />
                <Text style={[styles.metaValue, { color: priority.color }]}>{priority.label}</Text>
              </View>
            </View>

            {/* Status */}
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>STATUT</Text>
              <Text style={styles.metaValue}>
                {task.status === 'COMPLETED' ? '✅ Terminée' :
                  task.status === 'IN-PROCESS' ? '⚙️ En cours' :
                  task.status === 'CANCELLED' ? '🚫 Annulée' :
                  '📋 À faire'}
              </Text>
            </View>

            {/* Due date */}
            {due ? (
              <View style={styles.metaCard}>
                <Text style={styles.metaLabel}>ÉCHÉANCE</Text>
                <Text style={styles.metaValue}>📅 {due}</Text>
              </View>
            ) : null}

            {/* Completion */}
            {task.percentComplete !== undefined ? (
              <View style={styles.metaCard}>
                <Text style={styles.metaLabel}>AVANCEMENT</Text>
                <Text style={styles.metaValue}>{task.percentComplete}%</Text>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${task.percentComplete}%` as any,
                        backgroundColor: listColor,
                      },
                    ]}
                  />
                </View>
              </View>
            ) : null}
          </View>

          {/* Categories */}
          {task.categories && task.categories.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>CATÉGORIES</Text>
              <View style={styles.categoryRow}>
                {task.categories.map((cat) => (
                  <View key={cat} style={[styles.categoryTag, { borderColor: listColor + '44', backgroundColor: listColor + '11' }]}>
                    <Text style={[styles.categoryText, { color: listColor }]}>{cat}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Timestamps */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>INFORMATIONS</Text>
            <View style={styles.infoBox}>
              {task.created ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Créée</Text>
                  <Text style={styles.infoVal}>{formatICalDate(task.created)}</Text>
                </View>
              ) : null}
              {task.lastModified ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Modifiée</Text>
                  <Text style={styles.infoVal}>{formatICalDate(task.lastModified)}</Text>
                </View>
              ) : null}
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>ID</Text>
                <Text style={styles.infoVal} numberOfLines={1}>{task.uid}</Text>
              </View>
            </View>
          </View>

          {/* Action */}
          <Button
            label={isCompleted ? 'Marquer comme à faire' : 'Marquer comme terminée'}
            onPress={handleToggle}
            loading={toggling}
            style={{ marginTop: Spacing.sm, backgroundColor: isCompleted ? Colors.bgElevated : listColor }}
          />
          <Button
            label="Supprimer la tâche"
            onPress={handleDelete}
            variant="danger"
            loading={deleting}
            style={{ marginTop: Spacing.sm }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatICalDate(dateStr: string): string {
  try {
    const clean = dateStr.replace(/Z$/, '').replace('T', '');
    const y = clean.substring(0, 4);
    const mo = clean.substring(4, 6);
    const d = clean.substring(6, 8);
    const h = clean.substring(8, 10) || '00';
    const mi = clean.substring(10, 12) || '00';
    return `${d}/${mo}/${y} ${h}:${mi}`;
  } catch {
    return dateStr;
  }
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
  headerTitle: { flex: 1, color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  deleteBtn: {
    width: 40, height: 40,
    backgroundColor: Colors.errorDim,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.error + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBtnText: { fontSize: 18 },

  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 60 },

  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  statusCheck: {
    width: 28, height: 28,
    borderRadius: 8, borderWidth: 2, borderColor: Colors.textMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  statusCheckmark: { fontSize: 16, fontWeight: '800' },
  statusLabel: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600', flex: 1 },

  section: { marginBottom: Spacing.lg },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: 11, fontWeight: '700', letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  taskTitle: { color: Colors.textPrimary, fontSize: 22, fontWeight: '800', lineHeight: 28 },
  taskTitleCompleted: { textDecorationLine: 'line-through', color: Colors.textSecondary },

  descBox: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
  },
  descText: { color: Colors.textSecondary, fontSize: 14, lineHeight: 22 },

  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  metaCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
  },
  metaLabel: {
    color: Colors.textMuted,
    fontSize: 10, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaValue: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },

  progressBar: {
    height: 4, backgroundColor: Colors.border,
    borderRadius: 2, marginTop: 6, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },

  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  categoryTag: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1,
  },
  categoryText: { fontSize: 12, fontWeight: '700' },

  infoBox: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  infoKey: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  infoVal: { color: Colors.textSecondary, fontSize: 12, maxWidth: '65%', textAlign: 'right' },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  notFoundText: { color: Colors.textSecondary, fontSize: 16 },
  backLink: { color: Colors.accent, fontSize: 15, fontWeight: '700' },
});
