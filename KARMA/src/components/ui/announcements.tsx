import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  useColorScheme,
  Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '../../_context'; // Adjust path as needed

interface AnnouncementItem {
  id?: string;
  created_at: string;
  teacher_code: string;
  title: string;
  announcement: string;
  first_name_preferred?: string;
  last_name_legal?: string;
  teacherName?: string;
  avatarUrl?: string;
}

export function Announcements() {
  const systemScheme = useColorScheme();
  const colorScheme = (systemScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const currentColors = Colors[colorScheme];

  const { email: userEmail, role } = useAuth(); // Retrieve user email and role (or role check)

  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Teacher status check
  const [isTeacher, setIsTeacher] = useState<boolean>(false);
  const [currentTeacherCode, setCurrentTeacherCode] = useState<string | null>(null);

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [titleText, setTitleText] = useState('');
  const [announcementText, setAnnouncementText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    checkTeacherStatusAndFetch();
  }, [userEmail]);

  const checkTeacherStatusAndFetch = async () => {
    setLoading(true);

    // 1. Check if the logged-in user exists in teacher_personal_information
    if (userEmail) {
      const { data: teacherData } = await supabase
        .from('teacher_personal_information')
        .select('teacher_code')
        .ilike('teacher_email', userEmail.trim())
        .maybeSingle();

      if (teacherData?.teacher_code) {
        setIsTeacher(true);
        setCurrentTeacherCode(teacherData.teacher_code);
      } else if (role === 'teacher') {
        // Fallback check if your auth context maintains a role parameter
        setIsTeacher(true);
      }
    }

    // 2. Fetch all announcements
    await fetchAnnouncements();
  };

  const fetchAnnouncements = async () => {
    const { data: rawAnnouncements, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !rawAnnouncements) {
      console.error('Error fetching announcements:', error);
      setLoading(false);
      return;
    }

    // Collect teacher codes for announcements where name columns might be empty
    const missingNameTeacherCodes = Array.from(
      new Set(
        rawAnnouncements
          .filter((a) => !a.first_name_preferred && !a.last_name_legal && a.teacher_code)
          .map((a) => a.teacher_code)
      )
    );

    let teacherMap: Record<string, string> = {};
    if (missingNameTeacherCodes.length > 0) {
      const { data: teachers } = await supabase
        .from('teacher_personal_information')
        .select('teacher_code, first_name_preferred, last_name_legal')
        .in('teacher_code', missingNameTeacherCodes);

      if (teachers) {
        teachers.forEach((t) => {
          const firstName = t.first_name_preferred || '';
          const lastName = t.last_name_legal || '';
          teacherMap[t.teacher_code] = `${firstName} ${lastName}`.trim();
        });
      }
    }

    const enrichedAnnouncements: AnnouncementItem[] = rawAnnouncements.map((item) => {
      const { data: photoData } = supabase.storage
        .from('id_photos')
        .getPublicUrl(`staff/${item.teacher_code}.jpg`);

      // 1. Primary choice: Use names directly from the announcements table
      const directName = `${item.first_name_preferred || ''} ${item.last_name_legal || ''}`.trim();

      // 2. Fallback choice: Use queried teacher details or teacher_code
      const fallbackName = teacherMap[item.teacher_code] || item.teacher_code || 'Staff Member';

      return {
        ...item,
        teacherName: directName.length > 0 ? directName : fallbackName,
        avatarUrl: photoData?.publicUrl,
      };
    });

    setAnnouncements(enrichedAnnouncements);
    setLoading(false);
  };

  const handleCreateAnnouncement = async () => {
    if (!titleText.trim() || !announcementText.trim()) return;

    setIsSubmitting(true);

    try {
      let codeToUse = currentTeacherCode;

      // Ensure teacher_code is resolved if not previously set
      if (!codeToUse && userEmail) {
        const { data: teacherData, error: teacherErr } = await supabase
          .from('teacher_personal_information')
          .select('teacher_code')
          .ilike('teacher_email', userEmail.trim())
          .maybeSingle();

        if (teacherErr || !teacherData?.teacher_code) {
          throw new Error(`Teacher account not found for ${userEmail}`);
        }
        codeToUse = teacherData.teacher_code;
      }

      if (!codeToUse) {
        throw new Error('Unable to identify teacher credentials.');
      }

      // Fetch teacher names to store alongside the new announcement
      const { data: teacherInfo } = await supabase
        .from('teacher_personal_information')
        .select('first_name_preferred, last_name_legal')
        .eq('teacher_code', codeToUse)
        .maybeSingle();

      // Insert title, announcement, teacher_code, and teacher names
      const { error: insertErr } = await supabase.from('announcements').insert({
        teacher_code: codeToUse,
        title: titleText.trim(),
        announcement: announcementText.trim(),
        first_name_preferred: teacherInfo?.first_name_preferred || null,
        last_name_legal: teacherInfo?.last_name_legal || null,
      });

      if (insertErr) {
        throw insertErr;
      }

      setTitleText('');
      setAnnouncementText('');
      setIsModalOpen(false);
      setCurrentIndex(0);
      await fetchAnnouncements();
    } catch (err: any) {
      console.error('Error posting announcement:', err.message);
      Alert.alert('Error', err.message || 'Failed to post announcement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentItem = announcements[currentIndex];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <View style={styles.container}>
      {/* Header Row with conditional Add Button for Teachers */}
      <View style={styles.headerRow}>
        <ThemedText style={[styles.blockTitle, { color: currentColors.text }]}>
          Announcements
        </ThemedText>

        {isTeacher && (
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: currentColors.textSelected }]}
            onPress={() => setIsModalOpen(true)}
          >
            <Plus size={18} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={currentColors.textSelected} style={{ marginVertical: 20 }} />
      ) : announcements.length === 0 ? (
        <ThemedText style={[styles.emptyText, { color: currentColors.textSecondary }]}>
          No announcements available.
        </ThemedText>
      ) : (
        <>
          {/* Navigation Controls */}
          <View style={styles.dateNavigationCentered}>
            <TouchableOpacity
              disabled={currentIndex === announcements.length - 1}
              onPress={() => setCurrentIndex((prev) => Math.min(announcements.length - 1, prev + 1))}
            >
              <ChevronLeft
                size={18}
                color={
                  currentIndex === announcements.length - 1
                    ? currentColors.textSecondary + '40'
                    : currentColors.text
                }
              />
            </TouchableOpacity>

            <ThemedText style={[styles.dateTextUnified, { color: currentColors.text }]}>
              {currentItem ? formatDate(currentItem.created_at) : ''}
            </ThemedText>

            <TouchableOpacity
              disabled={currentIndex === 0}
              onPress={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            >
              <ChevronRight
                size={18}
                color={
                  currentIndex === 0
                    ? currentColors.textSecondary + '40'
                    : currentColors.text
                }
              />
            </TouchableOpacity>
          </View>

          {/* Announcement Card Box displaying Title and Content */}
          <View
            style={[
              styles.announcementInnerBox,
              { borderColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' },
            ]}
          >
            {currentItem?.title ? (
              <ThemedText style={[styles.announcementHeader, { color: currentColors.text }]}>
                {currentItem.title}
              </ThemedText>
            ) : null}

            <View style={styles.authorRow}>
              {currentItem?.avatarUrl ? (
                <Image source={{ uri: currentItem.avatarUrl }} style={styles.authorAvatar} />
              ) : (
                <View
                  style={[
                    styles.authorAvatar,
                    { backgroundColor: currentColors.textSecondary + '30' },
                  ]}
                />
              )}
              <ThemedText style={[styles.authorText, { color: currentColors.textSecondary }]}>
                by {currentItem?.teacherName}
              </ThemedText>
            </View>

            <View
              style={[
                styles.dividerLine,
                { backgroundColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' },
              ]}
            />

            <ThemedText style={[styles.bodyTextContent, { color: currentColors.text }]}>
              {currentItem?.announcement}
            </ThemedText>
          </View>
        </>
      )}

        {/* --- CREATE ANNOUNCEMENT MODAL --- */}
        <Modal visible={isModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View
            style={[
                styles.modalContent,
                { backgroundColor: currentColors.backgroundElement },
            ]}
            >
            <View style={styles.modalHeader}>
                <ThemedText style={[styles.modalTitle, { color: currentColors.text }]}>
                New Announcement
                </ThemedText>
                <TouchableOpacity onPress={() => setIsModalOpen(false)}>
                <X size={20} color={currentColors.textSecondary} />
                </TouchableOpacity>
            </View>

            <TextInput
                placeholder="Title"
                placeholderTextColor={currentColors.textSecondary}
                maxLength={50}
                style={[
                styles.titleInput,
                {
                    color: currentColors.text,
                    borderColor: colorScheme === 'dark' ? '#334155' : '#CBD5E1',
                },
                ]}
                value={titleText}
                onChangeText={setTitleText}
            />

            <TextInput
                multiline
                numberOfLines={10} // Increased lines for larger display
                maxLength={500}
                placeholder="Write your announcement here..."
                placeholderTextColor={currentColors.textSecondary}
                style={[
                styles.textArea,
                {
                    color: currentColors.text,
                    borderColor: colorScheme === 'dark' ? '#334155' : '#CBD5E1',
                },
                ]}
                value={announcementText}
                onChangeText={setAnnouncementText}
            />

            <TouchableOpacity
                disabled={isSubmitting || !titleText.trim() || !announcementText.trim()}
                style={[
                styles.postButton,
                {
                    backgroundColor: currentColors.textSelected,
                    opacity: isSubmitting || !titleText.trim() || !announcementText.trim() ? 0.5 : 1,
                },
                ]}
                onPress={handleCreateAnnouncement}
            >
                {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                <ThemedText style={styles.postButtonText}>Post Announcement</ThemedText>
                )}
            </TouchableOpacity>
            </View>
        </View>
        </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  blockTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    marginVertical: Spacing.four,
    fontSize: 14,
  },
  dateNavigationCentered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    marginTop: Spacing.two,
    marginBottom: Spacing.four,
  },
  dateTextUnified: {
    fontSize: 14,
    fontWeight: '700',
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
    marginBottom: Spacing.two,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  authorText: {
    fontSize: 14,
    fontWeight: '600',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalContent: {
    width: '100%',
    maxWidth: 480,
    borderRadius: Spacing.four,
    padding: Spacing.five,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  titleInput: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    fontSize: 15,
    marginBottom: Spacing.three,
  },
    textArea: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    textAlignVertical: 'top',
    height: 220, // Increased height from 120 to 220
    fontSize: 14,
    marginBottom: Spacing.four,
    },
  postButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  postButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});