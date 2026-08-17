import React, { useEffect, useState, useMemo } from 'react';
import { StyleSheet, useColorScheme, View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createClient } from '@supabase/supabase-js';

import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { Calendar } from '@/components/ui/calendar';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '../../_context';
import { supabase } from '@/lib/supabase';
 export type AttendanceRecord = {
  student_id: string;
  date: string; // YYYY-MM-DD
  status: string;
  line?: string | number;
};

export type CalendarRecord = {
  date: string; // YYYY-MM-DD
  day: number;
  week: number;
  term: number;
};

export type AttendanceIndicator = {
  id: string;
  label: string;
  color: string;
  description: string;
  isOutline?: boolean;
};

export default function AttendanceScreen() {
  const { email: userEmail } = useAuth();
  const systemScheme = useColorScheme();
  const colorScheme = (systemScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const currentColors = Colors[colorScheme];

  const [loading, setLoading] = useState<boolean>(true);
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [calendarData, setCalendarData] = useState<CalendarRecord[]>([]);

  const statusKeys: AttendanceIndicator[] = [
    { id: '1', label: 'Present', color: '#22C55E', description: 'Attended on time' },
    { id: '2', label: 'Late', color: '#3B82F6', description: 'Arrived after start' },
    { id: '3', label: 'Unjustified Absence', color: '#EF4444', description: 'Unexcused absence' },
    { id: '4', label: 'Justified Absence', color: '#EAB308', description: 'Excused absence' },
    { id: '5', label: 'Exam Leave', color: '#6B7280', description: 'Approved study/exam leave' },
    { id: '6', label: 'Not Done Yet', color: 'transparent', description: 'Pending mark / upcoming', isOutline: true },
  ];

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        // 1. Load full calendar metadata (date, day, week, term) sorted by date
        const { data: calRecords, error: calError } = await supabase
          .from('calendar')
          .select('date, day, week, term')
          .order('date', { ascending: true });

        if (calError) throw calError;
        if (calRecords) setCalendarData(calRecords as CalendarRecord[]);

        if (!userEmail) return;

        // 2. Look up student_id using user auth email
        const { data: studentInfo, error: studentError } = await supabase
          .from('student_personal_information')
          .select('student_id')
          .eq('email', userEmail)
          .single();

        if (studentError || !studentInfo?.student_id) {
          throw new Error(`Could not find student ID for ${userEmail}`);
        }

        // 3. Fetch attendance records matching student_id
        const { data: records, error: attendanceError } = await supabase
          .from('attendance')
          .select('student_id, date, status, line')
          .eq('student_id', studentInfo.student_id);

        if (attendanceError) throw attendanceError;
        if (records) setAttendanceData(records as AttendanceRecord[]);

      } catch (err) {
        console.error('Error loading attendance or calendar data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [userEmail]);

  // --- DYNAMIC TERM RESOLUTION & ATTENDANCE STATS ---
  const { currentTerm, currentWeek, stats } = useMemo(() => {
    const defaultRes = { currentTerm: 1, currentWeek: 1, stats: { weekRate: 'N/A', termRate: 'N/A', yearRate: 'N/A' } };

    if (!calendarData.length) return defaultRes;

    const todayStr = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();

    // 1. Find exact date match in calendar table
    let activeCalendarRecord = calendarData.find((c) => c.date === todayStr);
    console.log(activeCalendarRecord)
    // 2. If current date is between school holidays/breaks, round up to next upcoming date
    if (!activeCalendarRecord) {
      activeCalendarRecord = calendarData.find((c) => c.date > todayStr);

      // If current date is beyond maximum calendar date, pick the last recorded date
      if (!activeCalendarRecord) {
        activeCalendarRecord = calendarData[calendarData.length - 1];
      }
    }

    const resolvedTerm = activeCalendarRecord?.term ?? 1;
    const resolvedWeek = activeCalendarRecord?.week ?? 1;

    if (!attendanceData.length) {
      return { currentTerm: resolvedTerm, currentWeek: resolvedWeek, stats: defaultRes.stats };
    }

    // Helper: Counts as present if status is 'present' or 'late'
    const isPresent = (status: string) => {
      const normalized = (status || '').toLowerCase().trim();
      return normalized === 'present' || normalized === 'late';
    };

    // Fast lookup map for calendar metadata by date key
    const calMap = new Map<string, CalendarRecord>();
    calendarData.forEach((item) => calMap.set(item.date, item));

    let yearTotal = 0, yearPresent = 0;
    let weekTotal = 0, weekPresent = 0;
    let termTotal = 0, termPresent = 0;

    attendanceData.forEach((rec) => {
      if (!rec.date) return;

      const recYear = parseInt(rec.date.split('-')[0], 10);
      const calInfo = calMap.get(rec.date);

      // Filter: Year
      if (recYear === currentYear) {
        if (rec.status !== 'Not Done Yet') {
          yearTotal++;
        }
        if (isPresent(rec.status)) yearPresent++;
      }

      // Filter: Current Term & Week using calendar metadata match
      if (calInfo) {
        if (calInfo.term === resolvedTerm) {
          if (rec.status !== 'Not Done Yet') {
            termTotal++;
          }
          if (isPresent(rec.status)) termPresent++;
        }

        if (calInfo.term === resolvedTerm && calInfo.week === resolvedWeek) {
          if (rec.status !== 'Not Done Yet') {
            weekTotal++;
          }
          if (isPresent(rec.status)) weekPresent++;
        }
      }
    });

    const formatPct = (present: number, total: number) => 
      total > 0 ? `${Math.round((present / total) * 100)}%` : '100%';

    return {
      currentTerm: resolvedTerm,
      currentWeek: resolvedWeek,
      stats: {
        weekRate: formatPct(weekPresent, weekTotal),
        termRate: formatPct(termPresent, termTotal),
        yearRate: formatPct(yearPresent, yearTotal),
      },
    };
  }, [calendarData, attendanceData]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          
          {/* --- TIMETABLE CALENDAR --- */}
          <View style={[styles.contentBlockCard, { backgroundColor: currentColors.backgroundElement }]}>
            {loading ? (
              <ActivityIndicator size="large" color={currentColors.text} style={{ padding: Spacing.four }} />
            ) : (
              <Calendar mode="week" attendanceRecords={attendanceData} />
            )}
          </View>

          {/* --- ATTENDANCE RATES SUMMARY --- */}
          <View style={[styles.statsCard, { backgroundColor: currentColors.backgroundElement }]}>
            <ThemedText style={[styles.statsTitle, { color: currentColors.text }]}>
              Attendance Summary (Term {currentTerm}, Week {currentWeek})
            </ThemedText>

            <View style={styles.statsGrid}>
              <View style={[styles.statBox, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F1F5F9' }]}>
                <ThemedText style={[styles.statValue, { color: '#22C55E' }]}>
                  {stats.weekRate}
                </ThemedText>
                <ThemedText style={[styles.statLabel, { color: currentColors.textSecondary }]}>
                  This Week
                </ThemedText>
              </View>

              <View style={[styles.statBox, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F1F5F9' }]}>
                <ThemedText style={[styles.statValue, { color: '#3B82F6' }]}>
                  {stats.termRate}
                </ThemedText>
                <ThemedText style={[styles.statLabel, { color: currentColors.textSecondary }]}>
                  This Term
                </ThemedText>
              </View>

              <View style={[styles.statBox, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F1F5F9' }]}>
                <ThemedText style={[styles.statValue, { color: '#8B5CF6' }]}>
                  {stats.yearRate}
                </ThemedText>
                <ThemedText style={[styles.statLabel, { color: currentColors.textSecondary }]}>
                  This Year
                </ThemedText>
              </View>
            </View>
          </View>

          {/* --- ATTENDANCE STATUS KEY CARD --- */}
          <View style={[styles.keyCard, { backgroundColor: currentColors.backgroundElement }]}>
            <ThemedText style={[styles.keyCardTitle, { color: currentColors.text }]}>
              Key for Attendance Status
            </ThemedText>

            <View style={styles.legendGrid}>
              {statusKeys.map((item) => (
                <View key={item.id || item.label} style={styles.legendItem}>
                  <View 
                    style={[
                      styles.attendanceStatusDot, 
                      { 
                        backgroundColor: item.color,
                        borderWidth: item.isOutline ? 1.5 : 0,
                        borderColor: item.isOutline ? (colorScheme === 'dark' ? '#94A3B8' : '#64748B') : 'transparent'
                      }
                    ]} 
                  />
                  <View style={styles.legendTextWrapper}>
                    <ThemedText style={[styles.legendLabel, { color: currentColors.text }]}>
                      {item.label}
                    </ThemedText>
                    <ThemedText style={[styles.legendDesc, { color: currentColors.textSecondary }]}>
                      {item.description}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
          </View>

        </SafeAreaView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: { flexGrow: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.five,
    maxWidth: '96%',
    alignSelf: 'center',
    width: '100%',
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
  contentBlockCard: {
    width: '100%',
    borderRadius: Spacing.four,
    padding: Spacing.four,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  statsCard: {
    width: '100%',
    borderRadius: Spacing.four,
    padding: Spacing.four,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: Spacing.three,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.three,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  keyCard: {
    width: '100%',
    borderRadius: Spacing.four,
    padding: Spacing.four,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  keyCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: Spacing.three,
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    width: '47%',
    marginBottom: Spacing.one,
  },
  attendanceStatusDot: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
  },
  legendTextWrapper: {
    gap: 2,
    flex: 1,
  },
  legendLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  legendDesc: {
    fontSize: 11,
  },
});