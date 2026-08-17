import { StyleSheet, useColorScheme, View, useWindowDimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { CalendarCheck, GraduationCap } from 'lucide-react-native';
import { Calendar } from '@/components/ui/calendar';
import { Announcements } from '@/components/ui/announcements'; // Adjust path if needed

import { supabase } from '@/lib/supabase'; // Adjust path
import { useAuth } from '../../_context';  // Adjust path
import React from 'react';

export default function HomeScreen() {
  const systemScheme = useColorScheme();
  const colorScheme = (systemScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const currentColors = Colors[colorScheme];

  const { width: windowWidth } = useWindowDimensions();
  const isWideScreen = windowWidth >= 768;
  const { email: userEmail } = useAuth();
  const [attendancePercentage, setAttendancePercentage] = useState<string>('--%');
  const [lastGrade, setLastGrade] = useState<string>('--');
  const [loadingStats, setLoadingStats] = useState<boolean>(true);

  useEffect(() => {
    async function fetchDashboardStats() {
      if (!userEmail) return;
      setLoadingStats(true);

      try {
        // 1. Get student_id using user email
        const { data: student, error: studentError } = await supabase
          .from('student_personal_information')
          .select('student_id, nsn')
          .eq('email', userEmail)
          .maybeSingle();

        if (studentError || !student?.student_id) {
          throw new Error('Student record not found.');
        }

        const studentId = student.student_id;
        const studentNsn = student.nsn;

        // 2. Fetch all attendance records for full-year calculation
        const { data: attendanceData, error: attendanceError } = await supabase
          .from('attendance')
          .select('status')
          .eq('student_id', studentId);

        if (!attendanceError && attendanceData && attendanceData.length > 0) {
          const presentCount = attendanceData.filter((rec) =>
            ['present', 'attended', 'late', 'tardy'].includes(rec.status?.toLowerCase())
          ).length;

          const totalAttendanceCount = attendanceData.filter((rec) =>
            !['not done yet', ''].includes(rec.status?.toLowerCase())
          ).length;

          const percentage = Math.round((presentCount / totalAttendanceCount) * 100);
          setAttendancePercentage(`${percentage}%`);
        } else {
          setAttendancePercentage('N/A');
        }

        // 3. Fetch latest grade
        const { data: gradeData, error: gradeError } = await supabase
          .from('grades')
          .select('grade, date_obtained')
          .eq('nsn', studentNsn)
          .order('date_obtained', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!gradeError && gradeData?.grade) {
          setLastGrade(gradeData.grade);
        } else {
          setLastGrade('N/A');
        }
      } catch (err) {
        console.error('Error fetching dashboard stats:', err);
      } finally {
        setLoadingStats(false);
      }
    }

    fetchDashboardStats();
  }, [userEmail]);

  const statsData = [
    {
      label: 'Attendance This Year',
      stat: loadingStats ? '...' : attendancePercentage,
      icon: CalendarCheck,
      iconBgColor: colorScheme === 'dark' ? '#142E1F' : '#B2E5C5',
      accentColor: colorScheme === 'dark' ? '#3CD070' : '#00A662',
    },
    {
      label: 'Last Grade',
      stat: loadingStats ? '...' : lastGrade,
      icon: GraduationCap,
      iconBgColor: colorScheme === 'dark' ? '#132548' : '#DBEAFE',
      accentColor: colorScheme === 'dark' ? '#60A5FA' : '#155DFC',
    },
  ];

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          
          {/* --- HEADER SECTION --- */}
          <View style={styles.headerSection}>
            <ThemedText style={[styles.welcomeText, { color: currentColors.bodyText }]}>
              Welcome back, User!
            </ThemedText>
          </View>

          {/* --- STATISTIC CARDS CONTAINERS --- */}
          <View style={[styles.gridContainer, { flexWrap: isWideScreen ? 'nowrap' : 'wrap' }]}>
            {statsData.map((card, index) => {
              const IconComponent = card.icon;
              return (
                <View 
                  key={index} 
                  style={[
                    styles.card, 
                    { 
                      backgroundColor: currentColors.backgroundElement,
                      shadowColor: colorScheme === 'dark' ? '#000000' : '#0f172a',
                      width: isWideScreen ? 'auto' : '48%',
                      flex: isWideScreen ? 1 : undefined,
                    }
                  ]}
                >
                  <View style={styles.cardTopRow}>
                    <View style={[styles.iconContainer, { backgroundColor: card.iconBgColor }]}>
                      <IconComponent size={28} color={card.accentColor} />
                    </View>
                    <ThemedText style={[styles.statValue, { color: card.accentColor }]}>
                      {card.stat}
                    </ThemedText>
                  </View>

                  <View style={styles.cardBottomRow}>
                    <ThemedText numberOfLines={1} style={[styles.cardLabel, { color: currentColors.bodyText }]}>
                      {card.label}
                    </ThemedText>
                  </View>
                </View>
              );
            })}
          </View>

          {/* --- LOWER DASHBOARD CONTENT BLOCKS --- */}
          <View style={[
            styles.lowerDashboardContainer, 
            { flexDirection: isWideScreen ? 'row' : 'column' }
          ]}>
            
            {/* --- ANNOUNCEMENTS ELEMENT (Flexible Left Column) --- */}
            <View style={[
              styles.contentBlockCard,
              styles.announcementsBlock,
              { 
                backgroundColor: currentColors.backgroundElement, 
                shadowColor: colorScheme === 'dark' ? '#000000' : '#0f172a' 
              }
            ]}>
              <Announcements />
            </View>

            {/* --- CALENDAR ELEMENT (Fixed Right Column) --- */}
            <View style={[
              styles.contentBlockCard,
              styles.calendarBlock,
              { 
                backgroundColor: currentColors.backgroundElement, 
                shadowColor: colorScheme === 'dark' ? '#000000' : '#0f172a' 
              }
            ]}>
              <Calendar mode="day" />
            </View>
          </View>

        </SafeAreaView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.five,
    maxWidth: '96%',
    alignSelf: 'center',
    width: '100%',
  },
  headerSection: {
    alignItems: 'center',
    marginTop: Spacing.five,
    marginBottom: Spacing.six,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  gridContainer: {
    flexDirection: 'row',
    gap: Spacing.four,
    width: '100%',
    marginBottom: Spacing.six,
  },
  card: {
    height: 160,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    justifyContent: 'space-between', 
    shadowOffset: { width: 0, height: 8 },  
    shadowOpacity: 0.05,                   
    shadowRadius: 12,                      
    elevation: 4,                          
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconContainer: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
  },
  cardBottomRow: {
    alignItems: 'flex-start',
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '700',
    opacity: 0.8,
  },
  lowerDashboardContainer: {
    width: '100%',
    gap: Spacing.five,
    alignItems: 'stretch', // Ensures uniform height alignment on wide screens
    marginBottom: Spacing.six,
  },
  contentBlockCard: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  announcementsBlock: {
    flex: 1,
    minWidth: 300,
  },
  calendarBlock: {
    flexShrink: 0,
    minWidth: 350, // Holds the full width of the calendar modal
  },
});