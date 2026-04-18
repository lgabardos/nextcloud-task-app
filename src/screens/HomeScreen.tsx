import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchTaskLists, TaskList } from '../services/calDavService';
import { clearCredentials } from '../services/authService';
import { useAppStore } from '../store/appStore';
import { Colors, Spacing, Radius } from '../utils/theme';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const credentials = useAppStore((s) => s.credentials);
  const taskLists = useAppStore((s) => s.taskLists);
  const tasksByList = useAppStore((s) => s.tasksByList);
  const setTaskLists = useAppStore((s) => s.setTaskLists);
  const setCredentials = useAppStore((s) => s.setCredentials);

  const loadLists = useCallback(async () => {
    if (!credentials) return;
    setError(null);
    try {
      const lists = await fetchTaskLists(credentials);
      setTaskLists(lists);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    }
  }, [credentials]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLists();
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
            setCredentials(null);
            setTaskLists([]);
            router.replace('/');
          },
        },
      ]
    );
  };

  const getTaskCount = (listId: string) => {
    const tasks = tasksByList[listId];
    if (!tasks) return null;
    const pending = tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length;
    return pending;
  };

  const renderList = ({ item }: { item: TaskList }) => {
    const color = item.color || Colors.accent;
    const count = getTaskCount(item.id);

    return (
      <TouchableOpacity
        style={styles.listCard}
        onPress={() => router.push(`/(app)/list/${item.id}?url=${encodeURIComponent(item.url)}&name=${encodeURIComponent(item.displayName)}&color=${encodeURIComponent(color)}`)}
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
          <Text style={styles.listUrl} numberOfLines={1}>{item.url.split('/dav/calendars/')[1] || item.url}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>Connecté à</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {credentials?.serverUrl.replace('https://', '').replace('http://', '')}
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>⏏</Text>
        </TouchableOpacity>
      </View>

      {/* Section title */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>MES LISTES</Text>
        <Text style={styles.sectionCount}>{taskLists.length} liste{taskLists.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠ {error}</Text>
          <TouchableOpacity onPress={loadLists}>
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
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
              <Text style={styles.emptyHint}>
                Créez des listes de tâches dans votre Nextcloud
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  headerSub: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
    maxWidth: 240,
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    fontSize: 18,
    color: Colors.textPrimary
  },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  sectionCount: {
    color: Colors.textMuted,
    fontSize: 12,
  },

  flatList: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },

  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  listColorBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  listContent: {
    flex: 1,
    padding: Spacing.md,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  listName: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  countText: {
    fontSize: 12,
    fontWeight: '800',
  },
  listUrl: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  chevron: {
    color: Colors.textMuted,
    fontSize: 24,
    paddingRight: Spacing.md,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.errorDim,
    borderRadius: Radius.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.error + '44',
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    flex: 1,
  },
  retryText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: Spacing.sm,
  },

  empty: {
    alignItems: 'center',
    paddingTop: 60,
    gap: Spacing.sm,
  },
  emptyIcon: { fontSize: 48 },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyHint: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
});
