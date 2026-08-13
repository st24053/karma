import { StyleSheet, useColorScheme, View, useWindowDimensions, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { CalendarCheck, Dumbbell, GraduationCap, UsersRound, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Calendar } from '@/components/ui/calendar'; // Updated import path

export default function HomeScreen() {
  const systemScheme = useColorScheme();
  const colorScheme = (systemScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const currentColors = Colors[colorScheme];

  const { width: windowWidth } = useWindowDimensions();
  const isWideScreen = windowWidth >= 768;

  const statsData = [
    {
      label: 'Attendance',
      stat: '97%',
      icon: CalendarCheck,
      iconBgColor: colorScheme === 'dark' ? '#142E1F' : '#B2E5C5',
      accentColor: colorScheme === 'dark' ? '#3CD070' : '#00A662',
    },
    {
      label: 'Exercise This Week',
      stat: '234m',
      icon: Dumbbell,
      iconBgColor: colorScheme === 'dark' ? '#3A2312' : '#FFEDD4',
      accentColor: colorScheme === 'dark' ? '#FFA654' : '#FF8D28',
    },
    {
      label: 'Last Grade',
      stat: 'E',
      icon: GraduationCap,
      iconBgColor: colorScheme === 'dark' ? '#132548' : '#DBEAFE',
      accentColor: colorScheme === 'dark' ? '#60A5FA' : '#155DFC',
    },
    {
      label: 'Active Clubs',
      stat: '5',
      icon: UsersRound,
      iconBgColor: colorScheme === 'dark' ? '#2D163D' : '#F3E8FF',
      accentColor: colorScheme === 'dark' ? '#F472D0' : '#D732A8',
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
            
            {/* --- ANNOUNCEMENTS ELEMENT --- */}
            <View style={[
              styles.contentBlockCard, 
              { backgroundColor: currentColors.backgroundElement, flex: isWideScreen ? 1.1 : undefined, shadowColor: colorScheme === 'dark' ? '#000000' : '#0f172a' }
            ]}>
              <ThemedText style={[styles.blockTitle, { color: currentColors.text, textAlign: 'center' }]}>Announcements</ThemedText>
              
              <View style={styles.dateNavigationCentered}>
                <ChevronLeft size={16} color={currentColors.textSecondary} />
                <ThemedText style={[styles.dateTextUnified, { color: currentColors.text }]}>13th Of May, 2026</ThemedText>
                <ChevronRight size={16} color={currentColors.textSecondary} />
              </View>

              <View style={[styles.announcementInnerBox, { borderColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' }]}>
                <ThemedText style={[styles.announcementHeader, { color: currentColors.text }]}>
                  Regarding Year 13 Student Led Conferences
                </ThemedText>
                
                <View style={styles.authorRow}>
                  <ThemedText style={[styles.authorText, { color: currentColors.textSecondary }]}>by Mimi Moss</ThemedText>
                  <Image 
                    source={{ uri: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150' }} 
                    style={styles.authorAvatar} 
                  />
                </View>

                <View style={[styles.dividerLine, { backgroundColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' }]} />

                <ThemedText style={[styles.bodyTextContent, { color: currentColors.text }]}>
                  Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book.
                </ThemedText>
              </View>
            </View>

            {/* --- ATTENDANCE & TIMETABLE ELEMENT --- */}
            <View style={[
              styles.contentBlockCard, 
              { backgroundColor: currentColors.backgroundElement, flex: isWideScreen ? 0.9 : undefined, shadowColor: colorScheme === 'dark' ? '#000000' : '#0f172a' }
            ]}>
              {/* Renders the full synchronized calendar directly in Day Mode */}
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
    alignItems: 'flex-start',
    marginBottom: Spacing.six,
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
});