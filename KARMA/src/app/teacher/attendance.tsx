import React from 'react';
import { StyleSheet, ScrollView, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import TeacherCalendar from '@/components/ui/teacher-calendar'; // or { TeacherCalendar } depending on your file structure

export default function TeacherAttendanceScreen() {
  const systemScheme = useColorScheme();
  const colorScheme = (systemScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const currentColors = Colors[colorScheme];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: currentColors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Screen Header */}
        <View style={styles.header}>
          <ThemedText style={[styles.title, { color: currentColors.text }]}>
            Attendance Management
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: currentColors.textSecondary }]}>
            Select a class or tap any assigned timetable slot below to mark student attendance.
          </ThemedText>
        </View>

        {/* Teacher Calendar & Attendance Marking Component */}
        <TeacherCalendar mode="day" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContainer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
  },
  header: {
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: Spacing.one,
    lineHeight: 20,
  },
});