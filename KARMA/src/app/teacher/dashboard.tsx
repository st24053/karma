import { StyleSheet, useColorScheme, View, useWindowDimensions, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { CalendarCheck, Dumbbell, GraduationCap, UsersRound, ChevronLeft, ChevronRight } from 'lucide-react-native';

// UPDATE THIS IMPORT: Import your teacher calendar component or the teacher variant calendar module
import { TeacherCalendar } from '@/components/ui/teacher-calendar'; 
import { supabase } from '@/lib/supabase'; // Adjust path
import { useAuth } from '../../_context';  // Adjust path
import { useState, useEffect } from 'react';
import { Announcements } from '@/components/ui/announcements';

export default function TeacherHomeScreen() {
  const systemScheme = useColorScheme();
  const colorScheme = (systemScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const currentColors = Colors[colorScheme];

  const { width: windowWidth } = useWindowDimensions();
  const isWideScreen = windowWidth >= 768;

  const [attendancePercentage, setAttendancePercentage] = useState<string>('--%');
  const [lastGrade, setLastGrade] = useState<string>('--');

  useEffect(() => {
    async function fetchDashboardStats() {
      // 1. Fetch total attendance stats across all students for the year
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select('status');

      if (!attendanceError && attendanceData && attendanceData.length > 0) {
        const validRecords = attendanceData.filter((rec) => {
          if (!rec.status) return false;
          const status = rec.status.toLowerCase().trim();
          return status !== 'not done yet' && status !== '';
        });

        const presentRecords = validRecords.filter((rec) => {
          const status = rec.status.toLowerCase().trim();
          return status === 'present' || status === 'late';
        });

        const total = validRecords.length;
        const present = presentRecords.length;

        if (total > 0) {
          const percentage = Math.round((present / total) * 100);
          setAttendancePercentage(`${percentage}%`);
        } else {
          setAttendancePercentage('--%');
        }
      }

      // 2. Fetch the last marked grade sorted by date_obtained descending
      const { data: gradeData, error: gradeError } = await supabase
        .from('grades')
        .select('grade')
        .neq('grade', 'Pending')
        .not('date_obtained', 'is', null)
        .order('date_obtained', { ascending: false })
        .limit(1);

      if (!gradeError && gradeData && gradeData.length > 0) {
        setLastGrade(gradeData[0].grade);
      }
    }

    fetchDashboardStats();
  }, []);

  const statsData = [
    {
      label: 'Attendance',
      stat: attendancePercentage,
      icon: CalendarCheck,
      iconBgColor: colorScheme === 'dark' ? '#142E1F' : '#B2E5C5',
      accentColor: colorScheme === 'dark' ? '#3CD070' : '#00A662',
    },
    {
      label: 'Last Grade Given',
      stat: lastGrade,
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
              Welcome back, Teacher!
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
            
            {/* --- ANNOUNCEMENTS ELEMENT (Left Column) --- */}
            <View style={[
              styles.contentBlockCard, 
              styles.announcementsBlock,
              { 
                backgroundColor: currentColors.backgroundElement,
                shadowColor: colorScheme === 'dark' ? '#000000' : '#0f172a',
              }
            ]}>
              <Announcements />
            </View>

            {/* --- TEACHER TIMETABLE & CALENDAR ELEMENT (Right Column - Fixed Size) --- */}
            <View style={[
              styles.contentBlockCard, 
              styles.calendarBlock,
              { 
                backgroundColor: currentColors.backgroundElement,
                shadowColor: colorScheme === 'dark' ? '#000000' : '#0f172a',
              }
            ]}>
              <TeacherCalendar mode="day" />
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
  blockTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dateNavigationCentered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    marginTop: Spacing.three,
    marginBottom: Spacing.four,
  },
  announcementInnerBox: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.four,
  },
  announcementHeader: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    textAlign: 'center',
  },
  dateTextUnified: {
    fontSize: 14,
    fontWeight: '700',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  authorText: {
    fontSize: 14,
    fontWeight: '500',
  },
  authorAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  dividerLine: {
    height: 1,
    marginVertical: Spacing.three,
    width: '60%',
    alignSelf: 'center',
  },
  bodyTextContent: {
    fontSize: 14,
    lineHeight: 22,
    opacity: 0.85,
    textAlign: 'center',
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
// Left side takes remaining flexible space
announcementsBlock: {
  flex: 1, 
  minWidth: 500,
},
// Right side stays locked to intrinsic width so the calendar is never squished
calendarBlock: {
  flexShrink: 0, 
  minWidth: 500, // Preserves full calendar dimensions
},
});