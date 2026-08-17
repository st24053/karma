import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Animated, useColorScheme, Image } from 'react-native';
import { Slot, usePathname, useRouter, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '../../constants/theme'; 
import { useAuth } from '../../_context'; 
import { supabase } from '@/lib/supabase';
import { 
  Home, 
  Settings, 
  CalendarCheck, 
  GraduationCap
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
          size={22} 
          color={isActive ? currentColors.textSelected : currentColors.text} 
        />
        <ThemedText style={[styles.linkText, { color: isActive ? currentColors.textSelected : currentColors.text }]}>
          {item.label}
        </ThemedText>
      </Animated.View>
    </Pressable>
  );
}

export default function StudentLayout() {
  const systemScheme = useColorScheme();
  const colorScheme = (systemScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  
  const currentColors = Colors[colorScheme];
  const pathname = usePathname();
  const { email } = useAuth();

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    async function loadStudentPhoto() {
      if (!email) return;

      try {
        const { data: student, error: studentError } = await supabase
          .from('student_personal_information')
          .select('student_id')
          .eq('email', email)
          .maybeSingle();

        if (studentError || !student?.student_id) return;

        const { data: storageData, error: storageError } = await supabase
          .storage
          .from('id_photos')
          .createSignedUrl(`students/${student.student_id}.jpg`, 3600);

        if (!storageError && storageData?.signedUrl) {
          setPhotoUrl(storageData.signedUrl);
        }
      } catch (err) {
        console.error('Unexpected error fetching student photo:', err);
      }
    }

    loadStudentPhoto();
  }, [email]);

  const navItems = [
    { label: 'Home', href: '/student/dashboard', icon: Home },
    { label: 'Attendance', href: '/student/attendance', icon: CalendarCheck },
    { label: 'Grades', href: '/student/grades', icon: GraduationCap },
    { label: 'Settings', href: '/student/settings', icon: Settings },
  ];

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={[styles.wrapper, { backgroundColor: currentColors.background }]}>
        <View style={styles.container}>
          
          <ThemedView type="backgroundElement" style={styles.sidebar}>  
            <View style={styles.headerArea}>
              <ThemedText style={[styles.logoText, { color: currentColors.text }]}>
                KARMA
              </ThemedText>
              
              <View style={styles.imageRow}>
                <Image 
                  source={
                    photoUrl 
                      ? { uri: photoUrl }
                      : require('../../../assets/images/pfp.jpg')
                  }
                  style={styles.profilePic} 
                />
                <View style={[styles.verticalDivider, { backgroundColor: currentColors.textSecondary }]} />
                <Image 
                  source={require('../../../assets/images/osc_logo.png')}
                  style={styles.logoImg} 
                />
              </View>

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
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    width: '100%',
  },
  container: { 
    flex: 1, 
    flexDirection: 'row',
    width: '100%',
    maxWidth: 1440,
    marginHorizontal: 'auto',
  },
  sidebar: { 
    width: '20%',
    minWidth: 220,
    maxWidth: 280,
    flexShrink: 0,
    padding: Spacing.four, 
    gap: Spacing.five 
  },
  headerArea: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: Spacing.three, 
    marginBottom: Spacing.two 
  },
  imageRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  profilePic: { 
    width: 72, 
    height: 72, 
    borderRadius: 36 
  },
  verticalDivider: { 
    width: 1, 
    height: 36, 
    marginHorizontal: Spacing.three 
  },
  logoImg: { 
    width: 72, 
    height: 72, 
    resizeMode: 'contain' 
  },
  logoText: { 
    fontWeight: '800', 
    fontSize: 28, 
    letterSpacing: 2, 
    textAlign: 'center' 
  },
  emailDisplay: { 
    fontSize: 14, 
    fontWeight: '500', 
    marginTop: Spacing.one, 
    textAlign: 'center' 
  },
  navLinksContainer: { 
    gap: Spacing.two 
  },
  navLinkContainer: { 
    borderRadius: Spacing.two, 
    overflow: 'hidden' 
  },
  navLink: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 12, 
    paddingHorizontal: 14, 
    borderRadius: Spacing.two, 
    gap: Spacing.three 
  },
  linkText: { 
    fontSize: 16, 
    fontWeight: '600' 
  },
  content: { 
    flex: 1,
    minWidth: 0,
  },
});