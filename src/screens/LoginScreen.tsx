import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { loginWithCredentials, saveCredentials } from '../services/authService';
import { useAppStore } from '../store/appStore';
import { Button, Input } from '../components/UI';
import { Colors, Spacing, Radius } from '../utils/theme';

export default function LoginScreen() {
  const [serverUrl, setServerUrl] = useState('https://');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setCredentials = useAppStore((s) => s.setCredentials);

  function validate() {
    const errs: Record<string, string> = {};
    if (!serverUrl || serverUrl === 'https://') errs.serverUrl = 'URL requise';
    else if (!serverUrl.startsWith('http')) errs.serverUrl = 'URL invalide (doit commencer par https://)';
    if (!username.trim()) errs.username = 'Identifiant requis';
    if (!password) errs.password = 'Mot de passe requis';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleLogin() {
    if (!validate()) return;
    setLoading(true);
    setErrors({});

    try {
      const creds = await loginWithCredentials(
        serverUrl.trim(),
        username.trim(),
        password
      );
      await saveCredentials(creds);
      setCredentials(creds);
      router.replace('/(app)/home');
    } catch (error: any) {
      setErrors({ general: error.message || 'Impossible de se connecter au serveur.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoIcon}>☁</Text>
            </View>
            <Text style={styles.appName}>Nextcloud</Text>
            <Text style={styles.appSubtitle}>Tasks</Text>
            <Text style={styles.tagline}>Gérez vos tâches CalDAV</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {errors.general && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>⚠ {errors.general}</Text>
              </View>
            )}

            <Input
              label="URL du serveur"
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="https://cloud.monserveur.fr"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="next"
              error={errors.serverUrl}
            />

            <Input
              label="Identifiant"
              value={username}
              onChangeText={setUsername}
              placeholder="admin"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              error={errors.username}
            />

            <Input
              label="Mot de passe"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              error={errors.password}
            />

            <Button
              label="Se connecter"
              onPress={handleLogin}
              loading={loading}
              style={styles.loginButton}
            />

            <Text style={styles.hint}>
              💡 Vos identifiants sont stockés de manière sécurisée sur l'appareil. L'app tente de générer un mot de passe d'application dédié via l'API Nextcloud.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },

  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 48,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: Radius.xl,
    backgroundColor: Colors.accentGlow,
    borderWidth: 1,
    borderColor: Colors.accent + '44',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  logoIcon: {
    fontSize: 40,
  },
  appName: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  appSubtitle: {
    color: Colors.textPrimary,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 2,
  },
  tagline: {
    color: Colors.textMuted,
    fontSize: 14,
    marginTop: 6,
  },

  form: {
    gap: 0,
  },

  errorBanner: {
    backgroundColor: Colors.errorDim,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.error + '44',
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorBannerText: {
    color: Colors.error,
    fontSize: 13,
    lineHeight: 20,
  },

  loginButton: {
    marginTop: Spacing.sm,
  },

  hint: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
});
