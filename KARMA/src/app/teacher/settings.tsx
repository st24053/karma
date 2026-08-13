import React, { useState } from 'react';
import { StyleSheet, useColorScheme, TouchableOpacity, View, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '../../_context'; // Adjust path if needed
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const { email, signOut } = useAuth();
  const systemScheme = useColorScheme();
  const colorScheme = (systemScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const currentColors = Colors[colorScheme];

  const [loadingOthers, setLoadingOthers] = useState(false);

  // 1. Local Sign Out (This device)
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      console.log('Supabase signout error:', err);
    } finally {
      signOut(); // Clears your auth context state & local storage
    }
  };

  // 2. Global Sign Out (All other active sessions on other devices)
  const handleSignOutOthers = async () => {
    setLoadingOthers(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Success', 'Signed out of all other active sessions across other devices.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to revoke other sessions.');
    } finally {
      setLoadingOthers(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        
        <ThemedView style={styles.centerSection}>
          <ThemedText style={styles.title}>Account Settings</ThemedText>
          <ThemedText style={[styles.subtitle, { color: currentColors.textSecondary }]}>
            Signed in as: <ThemedText style={{ fontWeight: '700' }}>{email || 'User'}</ThemedText>
          </ThemedText>

          <View style={styles.buttonContainer}>
            {/* SIGN OUT OF OTHER SESSIONS BUTTON */}
            <TouchableOpacity 
              style={[styles.button, styles.secondaryButton, { borderColor: currentColors.textSecondary }]}
              onPress={handleSignOutOthers}
              disabled={loadingOthers}
            >
              {loadingOthers ? (
                <ActivityIndicator color={currentColors.text} size="small" />
              ) : (
                <ThemedText style={[styles.buttonText, { color: currentColors.text }]}>
                  Sign out of all other sessions
                </ThemedText>
              )}
            </TouchableOpacity>

            {/* MAIN SIGN OUT BUTTON */}
            <TouchableOpacity 
              style={[styles.button, styles.dangerButton]}
              onPress={handleSignOut}
            >
              <ThemedText style={[styles.buttonText, { color: '#FFFFFF' }]}>
                Sign Out
              </ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>

      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: MaxContentWidth,
  },
  centerSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: Spacing.four,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 320,
    gap: Spacing.three,
  },
  button: {
    width: '100%',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  dangerButton: {
    backgroundColor: '#EF4444',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});