import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { useColorScheme } from 'react-native';
import { AuthProvider, useAuth } from '../_context'; // Updated path assuming you renamed context to _context.tsx

function RootLayoutNavigation() {
  const { role } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const currentGroup = segments[0] as string | undefined;

    // Protect routing logic
    if (!role && (currentGroup === 'student' || currentGroup === 'teacher')) {
      router.replace('/');
    } else if (role === 'student' && currentGroup !== 'student') {
      router.replace('/student/dashboard');
    } else if (role === 'teacher' && currentGroup !== 'teacher') {
      router.replace('/teacher/dashboard');
    }
  }, [role, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="student" />
      <Stack.Screen name="teacher" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RootLayoutNavigation />
      </ThemeProvider>
    </AuthProvider>
  );
}