import React, { useRef } from 'react';
import { View, StyleSheet, Pressable, Animated, useColorScheme, Image } from 'react-native';
import { Slot, usePathname, useRouter, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '../../constants/theme'; 
import { useAuth } from '../../_context'; 
import { 
  Home, 
  Settings, 
  User, 
  CalendarCheck, 
  HeartPulse, 
  GraduationCap, 
  UsersRound, 
  FileSpreadsheet 
} from 'lucide-react-native';

function NavButton({ item, isActive, currentColors }: { item: any; isActive: boolean; currentColors: any }) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const IconComponent = item.icon;
  const router = useRouter();

  const handleHoverIn = () => {
    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 180,
      useNativeDriver: false,
    }).start();
  };

  const handleHoverOut = () => {
    Animated.timing(animatedValue, {
      toValue: 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  };

  const animatedBackgroundColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,0,0,0)', currentColors.backgroundSelected],
  });

  return (
    <Pressable
      onPress={() => router.push(item.href as any)}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={() => [
        styles.navLinkContainer,
        isActive && { backgroundColor: currentColors.backgroundSelected }
      ]}
    >
      <Animated.View style={[styles.navLink, { backgroundColor: animatedBackgroundColor }]}>
        <IconComponent 
          size={20} 
          color={isActive ? currentColors.textSelected : currentColors.text} 
        />
        <ThemedText style={[styles.linkText, { color: isActive ? currentColors.textSelected : currentColors.text }]}>
          {item.label}
        </ThemedText>
      </Animated.View>
    </Pressable>
  );
}

export default function TeacherLayout() {
  const systemScheme = useColorScheme();
  const colorScheme = (systemScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  
  const currentColors = Colors[colorScheme];
  const pathname = usePathname();
  const { email } = useAuth();

  const navItems = [
    { label: 'Home', href: '/teacher/dashboard', icon: Home },
    { label: 'Attendance', href: '/teacher/attendance', icon: CalendarCheck },
    { label: 'Markbook', href: '/teacher/markbook', icon: GraduationCap },
    { label: 'Reports', href: '/teacher/reports', icon: FileSpreadsheet },
    { label: 'Clubs', href: '/teacher/clubs', icon: UsersRound },
    { label: 'Pastoral', href: '/teacher/pastoral', icon: HeartPulse },
    { label: 'Profile', href: '/teacher/profile', icon: User },
    { label: 'Settings', href: '/teacher/settings', icon: Settings },
  ];

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={[styles.container, { backgroundColor: currentColors.background }]}>
        
        <ThemedView type="backgroundElement" style={styles.sidebar}>  
          <View style={styles.headerArea}>
            <ThemedText style={[styles.logoText, { color: currentColors.text }]}>
              KARMA
            </ThemedText>
            
            <View style={styles.imageRow}>
              <Image 
                source={require('../../../assets/images/pfp.jpg')}
                style={styles.profilePic} 
              />
              <View style={[styles.verticalDivider, { backgroundColor: currentColors.textSecondary }]} />
              <Image 
                source={require('../../../assets/images/osc_logo.png')}
                style={styles.logoImg} 
              />
            </View>

            {/* User Email Row Display */}
            {email && (
              <ThemedText style={[styles.emailDisplay, { color: currentColors.textSecondary }]}>
                {email}
              </ThemedText>
            )}
          </View>

          <View style={styles.navLinksContainer}>
            {navItems.map((item) => (
              <NavButton 
                key={item.href}
                item={item}
                isActive={pathname === item.href}
                currentColors={currentColors}
              />
            ))}
          </View>
        </ThemedView>

        <View style={styles.content}>
          <Slot />
        </View>
        
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 260, padding: Spacing.four, gap: Spacing.five },
  headerArea: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three, marginBottom: Spacing.two },
  imageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  profilePic: { width: 80, height: 80, borderRadius: 40 },
  verticalDivider: { width: 1, height: 36, marginHorizontal: Spacing.four },
  logoImg: { width: 80, height: 80, resizeMode: 'contain' },
  logoText: { fontWeight: '800', fontSize: 26, letterSpacing: 2, textAlign: 'center' },
  emailDisplay: { fontSize: 13, fontWeight: '500', marginTop: Spacing.one, textAlign: 'center' },
  navLinksContainer: { gap: Spacing.two },
  navLinkContainer: { borderRadius: Spacing.two, overflow: 'hidden' },
  navLink: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.three, paddingHorizontal: Spacing.three, borderRadius: Spacing.two, gap: Spacing.three },
  linkText: { fontSize: 15, fontWeight: '500' },
  content: { flex: 1 },
});