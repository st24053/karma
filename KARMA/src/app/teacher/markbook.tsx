import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  TextInput,
  useColorScheme,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import {
  ChevronDown,
  Plus,
  CheckCircle2,
  FileText,
  Award,
  BookOpen,
  ClipboardList,
  X,
  Check,
  Square,
  CheckSquare,
  User,
} from 'lucide-react-native';

import { supabase } from '../../lib/supabase';

// --- DATABASE TYPES ---

type GradeType = 'E' | 'M' | 'A' | 'N' | 'Not Submitted' | 'Pending';
type TabCategory = 'internals' | 'externals' | 'uegs' | 'classTests';

export type AssessmentStatus =
  | 'Results entered and published'
  | 'In moderation'
  | 'Results entered, not published'
  | 'Standard not assessed yet';

export interface DatabaseStandard {
  as: string;
  standard_name: string;
  credits?: number;
  is_external?: boolean;
}

export interface DatabaseClassStandard {
  assessment_id: string;
  class_id: string;
  as: string;
  assessment_type: string;
  standards?: DatabaseStandard;
}

export interface DatabaseGrade {
  id?: string;
  assessment_id: string;
  nsn: string;
  grade: GradeType;
  status: AssessmentStatus;
}

export interface Student {
  student_id: string;
  nsn: string;
  name: string;
  photoUrl?: string;
}

export interface ClassGroup {
  id: string;
  name: string;
  subject: string;
  teacher_code?: string;
  students: Student[];
}

// --- CONSTANTS ---

const GRADE_COLORS: Record<GradeType, { bg: string; text: string }> = {
  E: { bg: '#DCFCE7', text: '#15803D' },
  M: { bg: '#DBEAFE', text: '#1D4ED8' },
  A: { bg: '#FEF9C3', text: '#A16207' },
  N: { bg: '#FEE2E2', text: '#B91C1C' },
  'Not Submitted': { bg: '#F3F4F6', text: '#4B5563' },
  Pending: { bg: '#F3E8FF', text: '#6B21A8' },
};

const STATUS_OPTIONS: AssessmentStatus[] = [
  'Standard not assessed yet',
  'Results entered, not published',
  'In moderation',
  'Results entered and published',
];

const STATUS_BADGE_STYLE: Record<AssessmentStatus, { bg: string; text: string }> = {
  'Standard not assessed yet': { bg: '#F3F4F6', text: '#4B5563' },
  'Results entered, not published': { bg: '#FEF3C7', text: '#B45309' },
  'In moderation': { bg: '#DBEAFE', text: '#1D4ED8' },
  'Results entered and published': { bg: '#DCFCE7', text: '#15803D' },
};

export default function TeacherMarkbook() {
  const systemScheme = useColorScheme();
  const isDark = systemScheme === 'dark';

  // --- STATES ---
  const [loading, setLoading] = useState<boolean>(true);
  const [teacherCode, setTeacherCode] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabCategory>('internals');

  // Database tables states
  const [classStandards, setClassStandards] = useState<DatabaseClassStandard[]>([]);
  const [grades, setGrades] = useState<DatabaseGrade[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);

  // Status Selector Modal state
  const [statusModalTarget, setStatusModalTarget] = useState<{ nsn: string; currentStatus: AssessmentStatus } | null>(null);

  // Modals & Form state
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const [addStandardModalVisible, setAddStandardModalVisible] = useState(false);
  const [newASCode, setNewASCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newCredits, setNewCredits] = useState('');

  // --- STEP 1: Fetch teacher_code by matching Auth User email with teacher_personal_information ---
  useEffect(() => {
    const fetchTeacherCodeAndClasses = async () => {
      setLoading(true);
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError || !userData?.user?.email) {
          console.error('Error fetching authenticated user:', userError);
          setLoading(false);
          return;
        }

        const userEmail = userData.user.email;

        // Fetch teacher_code from teacher_personal_information table
        const { data: teacherData, error: teacherError } = await supabase
          .from('teacher_personal_information')
          .select('teacher_code')
          .eq('teacher_email', userEmail)
          .maybeSingle();

        if (teacherError) {
          console.error('Error fetching teacher_code:', teacherError);
          setLoading(false);
          return;
        }

        if (!teacherData?.teacher_code) {
          console.warn('No matching teacher_code found for email:', userEmail);
          setClasses([]);
          setSelectedClassId('');
          setLoading(false);
          return;
        }

        const resolvedTeacherCode = teacherData.teacher_code;
        setTeacherCode(resolvedTeacherCode);

        // --- STEP 2: Fetch classes matching the resolved teacher_code ---
        const { data, error } = await supabase
          .from('classes')
          .select(`
            id,
            subject,
            level,
            teacher_code,
            classes_students (
              student_personal_information!student_id (
                student_id,
                nsn,
                first_name_preferred,
                last_name_legal
              )
            )
          `)
          .eq('teacher_code', resolvedTeacherCode);

        if (error) {
          console.error('Error fetching classes for teacher:', error);
          setLoading(false);
          return;
        }

        if (data && data.length > 0) {
          const rawStudents: { student_id: string; nsn: string; fullName: string; classId: string }[] = [];

          data.forEach((cls: any) => {
            (cls.classes_students || []).forEach((cs: any) => {
              const info = Array.isArray(cs.student_personal_information)
                ? cs.student_personal_information[0]
                : cs.student_personal_information;

              if (info) {
                const fullName = `${info.first_name_preferred || ''} ${info.last_name_legal || ''}`.trim();
                const studentNSN = String(info.nsn);
                rawStudents.push({
                  student_id: String(info.student_id),
                  nsn: studentNSN,
                  fullName: fullName || `Student ${studentNSN}`,
                  classId: String(cls.id),
                });
              }
            });
          });

          const uniqueStudentIds = Array.from(new Set(rawStudents.map((s) => s.student_id)));
          const filePaths = uniqueStudentIds.map((id) => `students/${id}.jpg`);

          const { data: signedData, error: signedErr } = await supabase.storage
            .from('id_photos')
            .createSignedUrls(filePaths, 3600);

          if (signedErr) {
            console.warn('Error fetching signed URLs from id_photos:', signedErr);
          }

          const photoUrlMap = new Map<string, string>();
          uniqueStudentIds.forEach((id) => {
            const path = `students/${id}.jpg`;
            const signedItem = signedData?.find((item) => item.path === path);
            if (signedItem?.signedUrl) {
              photoUrlMap.set(id, signedItem.signedUrl);
            }
          });

          const formattedClasses: ClassGroup[] = data.map((cls: any) => {
            const students: Student[] = (cls.classes_students || [])
              .map((cs: any) => {
                const info = Array.isArray(cs.student_personal_information)
                  ? cs.student_personal_information[0]
                  : cs.student_personal_information;

                if (!info) return null;

                const fullName = `${info.first_name_preferred || ''} ${info.last_name_legal || ''}`.trim();
                const studentNSN = String(info.nsn);
                const sId = String(info.student_id);

                return {
                  student_id: sId,
                  nsn: studentNSN,
                  name: fullName || `Student ${studentNSN}`,
                  photoUrl: photoUrlMap.get(sId),
                };
              })
              .filter((s: Student | null): s is Student => s !== null);

            return {
              id: String(cls.id),
              name: cls.subject,
              subject: cls.subject,
              teacher_code: cls.teacher_code,
              students,
            };
          });

          setClasses(formattedClasses);
          setSelectedClassId(formattedClasses[0].id);
        } else {
          setClasses([]);
          setSelectedClassId('');
        }
      } catch (err) {
        console.error('Error in fetchTeacherCodeAndClasses:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTeacherCodeAndClasses();
  }, []);

  // --- DATA FETCHING FOR MARKBOOK ---
  const fetchMarkbookData = async (classId: string) => {
    if (!classId) return;
    setLoading(true);
    try {
      const numericClassId = parseInt(classId.replace(/\D/g, ''), 10);

      const { data: classStdsData, error: stdsError } = await supabase
        .from('classes_standards')
        .select(`
          assessment_id,
          class_id,
          as,
          assessment_type,
          standards ( as, standard_name, credits, is_external )
        `)
        .eq('class_id', isNaN(numericClassId) ? classId : numericClassId);

      if (stdsError) {
        console.error('Supabase query error (standards):', stdsError);
      }

      const formattedStandards = (classStdsData || []).map((cs: any) => ({
        ...cs,
        standards: Array.isArray(cs.standards) ? cs.standards[0] : cs.standards,
      }));

      const assessmentIds = formattedStandards.map((cs) => cs.assessment_id);
      let gradesData: DatabaseGrade[] = [];

      if (assessmentIds.length > 0) {
        const { data: fetchedGrades, error: gradesError } = await supabase
          .from('grades')
          .select('*')
          .in('assessment_id', assessmentIds);

        if (gradesError) {
          console.error('Supabase query error (grades):', gradesError);
        } else {
          gradesData = fetchedGrades || [];
        }
      }

      setClassStandards(formattedStandards);
      setGrades(gradesData);
    } catch (error) {
      console.error('Failed to load markbook data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedClassId) {
      fetchMarkbookData(selectedClassId);
    }
  }, [selectedClassId]);

  // Dynamic Theme Colors
  const theme = {
    bg: isDark ? '#0F172A' : '#F8FAFC',
    card: isDark ? '#1E293B' : '#FFFFFF',
    text: isDark ? '#F8FAFC' : '#0F172A',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    border: isDark ? '#334155' : '#E2E8F0',
    primary: '#3B82F6',
    modalBg: isDark ? '#1E293B' : '#FFFFFF',
  };

  // --- COMPUTED PROPERTIES ---

  const currentClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || classes[0],
    [classes, selectedClassId]
  );

  const getTabCategory = (cs: DatabaseClassStandard): TabCategory => {
    const type = (cs.assessment_type || '').trim();
    const isExternal = Boolean(cs.standards?.is_external);

    if (type === 'Official AS') {
      return isExternal ? 'externals' : 'internals';
    }
    if (type === 'UEG') {
      return 'uegs';
    }
    if (type === 'EOTT') {
      return 'classTests';
    }
    return 'classTests';
  };

  const filteredClassStandards = useMemo(
    () => classStandards.filter((cs) => getTabCategory(cs) === activeTab),
    [classStandards, activeTab]
  );

  useEffect(() => {
    if (filteredClassStandards.length > 0) {
      const exists = filteredClassStandards.some((cs) => cs.assessment_id === selectedAssessmentId);
      if (!exists) {
        setSelectedAssessmentId(filteredClassStandards[0].assessment_id);
      }
    } else {
      setSelectedAssessmentId(null);
    }
  }, [filteredClassStandards, selectedAssessmentId]);

  const selectedClassStandard = useMemo(
    () => classStandards.find((cs) => cs.assessment_id === selectedAssessmentId),
    [classStandards, selectedAssessmentId]
  );

  const selectedGradesMap = useMemo(() => {
    if (!selectedAssessmentId) return new Map<string, DatabaseGrade>();
    const map = new Map<string, DatabaseGrade>();
    grades
      .filter((g) => g.assessment_id === selectedAssessmentId)
      .forEach((g) => map.set(String(g.nsn), g));
    return map;
  }, [grades, selectedAssessmentId]);

  // --- HANDLERS ---

  const handleToggleEnrollment = async (nsn: string, isEnrolled: boolean) => {
    if (!selectedAssessmentId) return;

    if (!isEnrolled) {
      const newPayload: DatabaseGrade = {
        assessment_id: selectedAssessmentId,
        nsn: String(nsn),
        grade: 'Pending',
        status: 'Standard not assessed yet',
      };

      setGrades((prev) => [...prev, newPayload]);

      const { error } = await supabase.from('grades').insert(newPayload);
      if (error) {
        console.error('Error enrolling student in standard by NSN:', error.message);
      }
    } else {
      setGrades((prev) =>
        prev.filter((g) => !(g.assessment_id === selectedAssessmentId && String(g.nsn) === String(nsn)))
      );

      const { error } = await supabase
        .from('grades')
        .delete()
        .match({ assessment_id: selectedAssessmentId, nsn: String(nsn) });

      if (error) {
        console.error('Error unenrolling student from standard by NSN:', error.message);
      }
    }
  };

  const handleUpdateGradeRecord = async (
    nsn: string,
    updates: Partial<{ grade: GradeType; status: AssessmentStatus }>
  ) => {
    if (!selectedAssessmentId) return;

    const existingRecord = selectedGradesMap.get(String(nsn));
    if (!existingRecord) return;

    const payload: DatabaseGrade = {
      ...existingRecord,
      assessment_id: selectedAssessmentId,
      nsn: String(nsn),
    };

    if (updates.grade !== undefined) {
      payload.grade = existingRecord.grade === updates.grade ? 'Pending' : updates.grade;
    }

    if (updates.status !== undefined) {
      payload.status = updates.status;
    }

    setGrades((prev) =>
      prev.map((g) =>
        g.assessment_id === selectedAssessmentId && String(g.nsn) === String(nsn)
          ? { ...g, ...payload }
          : g
      )
    );

    const { error } = await supabase
      .from('grades')
      .upsert(
        {
          assessment_id: payload.assessment_id,
          nsn: payload.nsn,
          grade: payload.grade,
          status: payload.status,
        },
        { onConflict: 'assessment_id,nsn' }
      );

    if (error) {
      console.error('Failed to update record:', error.message);
    }
  };

  const handleAddStandard = async () => {
    if (!newASCode.trim() || !newTitle.trim()) return;

    const newAssessmentId = `asm_${Date.now()}`;
    const cleanAS = newASCode.trim();

    let dbAssessmentType = 'Official AS';
    let isExternal = false;

    if (activeTab === 'internals') {
      dbAssessmentType = 'Official AS';
      isExternal = false;
    } else if (activeTab === 'externals') {
      dbAssessmentType = 'Official AS';
      isExternal = true;
    } else if (activeTab === 'uegs') {
      dbAssessmentType = 'UEG';
    } else if (activeTab === 'classTests') {
      dbAssessmentType = 'EOTT';
    }

    const newClassStandard: DatabaseClassStandard = {
      assessment_id: newAssessmentId,
      class_id: selectedClassId,
      as: cleanAS,
      assessment_type: dbAssessmentType,
      standards: {
        as: cleanAS,
        standard_name: newTitle.trim(),
        credits: newCredits ? Number(newCredits) : undefined,
        is_external: isExternal,
      },
    };

    setClassStandards((prev) => [...prev, newClassStandard]);

    await supabase.from('standards').upsert({
      as: cleanAS,
      standard_name: newTitle.trim(),
      credits: newCredits ? Number(newCredits) : null,
      is_external: isExternal,
    });

    await supabase.from('classes_standards').insert({
      assessment_id: newAssessmentId,
      class_id: selectedClassId,
      as: cleanAS,
      assessment_type: dbAssessmentType,
    });

    setNewASCode('');
    setNewTitle('');
    setNewCredits('');
    setAddStandardModalVisible(false);
    setSelectedAssessmentId(newAssessmentId);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* --- TOP BAR / CLASS SELECTOR --- */}
      <View style={[styles.header, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>Markbook</Text>
        <TouchableOpacity
          style={[styles.classSelector, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}
          onPress={() => setClassDropdownOpen(!classDropdownOpen)}
        >
          <Text style={[styles.classSelectorText, { color: theme.text }]}>
            {currentClass?.name || 'Select Class'}
          </Text>
          <ChevronDown size={20} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Class Dropdown Modal */}
      <Modal visible={classDropdownOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setClassDropdownOpen(false)}
        >
          <View style={[styles.dropdownCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.dropdownHeader, { color: theme.textMuted }]}>Select Class</Text>
            {classes.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.textMuted, paddingVertical: 10 }]}>
                {teacherCode
                  ? `No classes assigned to code: ${teacherCode}`
                  : 'No teacher profile found.'}
              </Text>
            ) : (
              classes.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.dropdownItem,
                    c.id === selectedClassId && { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
                  ]}
                  onPress={() => {
                    setSelectedClassId(c.id);
                    setSelectedAssessmentId(null);
                    setClassDropdownOpen(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, { color: theme.text }]}>{c.name}</Text>
                  {c.id === selectedClassId && <CheckCircle2 size={16} color={theme.primary} />}
                </TouchableOpacity>
              ))
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* --- ASSESSMENT TYPE TABS --- */}
      <View style={[styles.tabsContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {[
            { key: 'internals', label: 'Internals', icon: FileText },
            { key: 'externals', label: 'Externals', icon: BookOpen },
            { key: 'uegs', label: 'UEGs', icon: Award },
            { key: 'classTests', label: 'EOTT / Class Tests', icon: ClipboardList },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabButton,
                  isActive && { borderBottomColor: theme.primary, borderBottomWidth: 3 },
                ]}
                onPress={() => setActiveTab(tab.key as TabCategory)}
              >
                <Icon size={16} color={isActive ? theme.primary : theme.textMuted} />
                <Text style={[styles.tabLabel, { color: isActive ? theme.primary : theme.textMuted }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView style={styles.mainContent}>
          {/* --- STANDARDS LIST --- */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {activeTab === 'classTests' ? 'EOTT & Class Tests' : 'Assessment Standards'}
            </Text>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: theme.primary }]}
              onPress={() => setAddStandardModalVisible(true)}
            >
              <Plus size={16} color="#FFF" />
              <Text style={styles.addButtonText}>
                {activeTab === 'classTests' ? 'Add Test' : 'Add Standard'}
              </Text>
            </TouchableOpacity>
          </View>

          {filteredClassStandards.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No assessments found for this tab.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.standardsList}>
              {filteredClassStandards.map((item) => {
                const isSelected = item.assessment_id === selectedAssessmentId;
                const standardData = item.standards;

                return (
                  <TouchableOpacity
                    key={item.assessment_id}
                    style={[
                      styles.standardCard,
                      { backgroundColor: theme.card, borderColor: isSelected ? theme.primary : theme.border },
                      isSelected && { borderWidth: 2 },
                    ]}
                    onPress={() => setSelectedAssessmentId(item.assessment_id)}
                  >
                    <View style={styles.standardHeaderRow}>
                      <Text style={[styles.standardCode, { color: theme.primary }]}>
                        {item.as}
                      </Text>
                      {standardData?.credits && (
                        <Text style={[styles.creditsBadge, { color: theme.textMuted }]}>
                          {standardData.credits} cr
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.standardTitle, { color: theme.text }]} numberOfLines={2}>
                      {standardData?.standard_name || 'Untitled Assessment'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* --- GRADES & STATUS TABLE --- */}
          {selectedClassStandard ? (
            <View style={[styles.markbookContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.markbookHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.selectedCode, { color: theme.primary }]}>
                    {selectedClassStandard.as}
                  </Text>
                  <Text style={[styles.selectedTitle, { color: theme.text }]}>
                    {selectedClassStandard.standards?.standard_name || 'Untitled Assessment'}
                  </Text>
                </View>
              </View>

              <View style={styles.tableHeader}>
                <Text style={[styles.colHeader, { flex: 2.5, color: theme.textMuted }]}>Student</Text>
                <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'center', color: theme.textMuted }]}>Grade</Text>
                <Text style={[styles.colHeader, { flex: 2, textAlign: 'center', color: theme.textMuted }]}>Status</Text>
              </View>

              {currentClass?.students?.map((student) => {
                const gradeRecord = selectedGradesMap.get(student.nsn);
                const isEnrolled = Boolean(gradeRecord);

                const currentStatus: AssessmentStatus = gradeRecord
                  ? gradeRecord.status
                  : 'Standard not assessed yet';

                const currentGrade: GradeType = gradeRecord ? gradeRecord.grade : 'Pending';
                const currentStatusStyle = STATUS_BADGE_STYLE[currentStatus];

                return (
                  <View
                    key={student.nsn}
                    style={[
                      styles.tableRow,
                      { borderColor: theme.border },
                      !isEnrolled && styles.disabledRow,
                    ]}
                  >
                    {/* Enrollment Checkbox & Student Info */}
                    <View style={[styles.studentCell, { flex: 2.5 }]}>
                      <TouchableOpacity
                        style={styles.checkboxTouch}
                        onPress={() => handleToggleEnrollment(student.nsn, isEnrolled)}
                      >
                        {isEnrolled ? (
                          <CheckSquare size={20} color={theme.primary} />
                        ) : (
                          <Square size={20} color={theme.textMuted} />
                        )}
                      </TouchableOpacity>

                      {student.photoUrl ? (
                        <Image source={{ uri: student.photoUrl }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatarPlaceholder, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
                          <User size={16} color={theme.textMuted} />
                        </View>
                      )}

                      <Text
                        style={[
                          styles.studentName,
                          { color: isEnrolled ? theme.text : theme.textMuted },
                        ]}
                        numberOfLines={1}
                      >
                        {student.name}
                      </Text>
                    </View>

                    {/* Grade Buttons */}
                    <View style={[styles.centerCell, { flex: 1.2 }]}>
                      <View style={styles.gradePickerContainer}>
                        {(['E', 'M', 'A', 'N'] as GradeType[]).map((g) => (
                          <TouchableOpacity
                            key={g}
                            disabled={!isEnrolled}
                            style={[
                              styles.gradeBadge,
                              currentGrade === g
                                ? { backgroundColor: GRADE_COLORS[g].bg, borderColor: GRADE_COLORS[g].text, borderWidth: 1 }
                                : { backgroundColor: isDark ? '#334155' : '#F1F5F9' },
                              !isEnrolled && styles.disabledControl,
                            ]}
                            onPress={() => handleUpdateGradeRecord(student.nsn, { grade: g })}
                          >
                            <Text
                              style={[
                                styles.gradeBadgeText,
                                { color: currentGrade === g ? GRADE_COLORS[g].text : theme.textMuted },
                              ]}
                            >
                              {g}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* Status Dropdown Trigger */}
                    <View style={[styles.centerCell, { flex: 2 }]}>
                      <TouchableOpacity
                        disabled={!isEnrolled}
                        style={[
                          styles.statusPickerButton,
                          { backgroundColor: isEnrolled ? currentStatusStyle.bg : (isDark ? '#334155' : '#F1F5F9') },
                          !isEnrolled && styles.disabledControl,
                        ]}
                        onPress={() =>
                          setStatusModalTarget({ nsn: student.nsn, currentStatus })
                        }
                      >
                        <Text
                          style={[
                            styles.statusPickerText,
                            { color: isEnrolled ? currentStatusStyle.text : theme.textMuted },
                          ]}
                          numberOfLines={1}
                        >
                          {currentStatus}
                        </Text>
                        <ChevronDown size={14} color={isEnrolled ? currentStatusStyle.text : theme.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            filteredClassStandards.length > 0 && (
              <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                  Select an assessment above to view and edit student grades.
                </Text>
              </View>
            )
          )}
        </ScrollView>
      )}

      {/* --- STATUS SELECTION MODAL --- */}
      <Modal visible={Boolean(statusModalTarget)} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setStatusModalTarget(null)}
        >
          <View style={[styles.dropdownCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.dropdownHeader, { color: theme.textMuted }]}>Update Assessment Status</Text>
            {STATUS_OPTIONS.map((statusOpt) => {
              const isSelected = statusModalTarget?.currentStatus === statusOpt;
              return (
                <TouchableOpacity
                  key={statusOpt}
                  style={[
                    styles.dropdownItem,
                    isSelected && { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
                  ]}
                  onPress={() => {
                    if (statusModalTarget) {
                      handleUpdateGradeRecord(statusModalTarget.nsn, { status: statusOpt });
                    }
                    setStatusModalTarget(null);
                  }}
                >
                  <Text style={[styles.dropdownItemText, { color: theme.text, flex: 1 }]}>
                    {statusOpt}
                  </Text>
                  {isSelected && <Check size={16} color={theme.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* --- ADD STANDARD MODAL --- */}
      <Modal visible={addStandardModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.modalBg, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {activeTab === 'classTests' ? 'Add Class Test' : 'Add Assessment Standard'}
              </Text>
              <TouchableOpacity onPress={() => setAddStandardModalVisible(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textMuted }]}>
              {activeTab === 'classTests' ? 'Test Code / Title' : 'Standard Code (AS)'}
            </Text>
            <TextInput
              style={[styles.textInput, { color: theme.text, borderColor: theme.border }]}
              value={newASCode}
              onChangeText={setNewASCode}
              placeholder={activeTab === 'classTests' ? 'e.g. Test 1' : 'e.g. 91900'}
              placeholderTextColor={theme.textMuted}
            />

            <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Description / Topic Title</Text>
            <TextInput
              style={[styles.textInput, { color: theme.text, borderColor: theme.border }]}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="e.g. Critical Inquiry into Digital Outcome"
              placeholderTextColor={theme.textMuted}
            />

            {activeTab !== 'classTests' && (
              <>
                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Credits</Text>
                <TextInput
                  style={[styles.textInput, { color: theme.text, borderColor: theme.border }]}
                  value={newCredits}
                  onChangeText={setNewCredits}
                  keyboardType="numeric"
                  placeholder="e.g. 6"
                  placeholderTextColor={theme.textMuted}
                />
              </>
            )}

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: theme.primary }]}
              onPress={handleAddStandard}
            >
              <Text style={styles.submitButtonText}>Save Assessment</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerSubtitle: { fontSize: 18, fontWeight: '700' },
  classSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  classSelectorText: { fontSize: 14, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dropdownCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  dropdownHeader: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  dropdownItemText: { fontSize: 14, fontWeight: '500' },
  tabsContainer: { borderBottomWidth: 1 },
  tabsScroll: { paddingHorizontal: 16, gap: 8 },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  tabLabel: { fontSize: 14, fontWeight: '600' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mainContent: { flex: 1, padding: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addButtonText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  emptyCard: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: { fontSize: 14 },
  standardsList: { marginBottom: 16 },
  standardCard: {
    width: 160,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 10,
  },
  standardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  standardCode: { fontSize: 13, fontWeight: '700' },
  creditsBadge: { fontSize: 11, fontWeight: '500' },
  standardTitle: { fontSize: 13, lineHeight: 18 },
  markbookContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 32,
  },
  markbookHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  selectedCode: { fontSize: 13, fontWeight: '700' },
  selectedTitle: { fontSize: 16, fontWeight: '600' },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  colHeader: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  disabledRow: {
    opacity: 0.5,
  },
  studentCell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkboxTouch: { padding: 2 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentName: { fontSize: 14, fontWeight: '500', flex: 1 },
  centerCell: { alignItems: 'center', justifyContent: 'center' },
  gradePickerContainer: { flexDirection: 'row', gap: 4 },
  gradeBadge: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4 },
  gradeBadgeText: { fontSize: 12, fontWeight: '700' },
  statusPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
    width: '95%',
  },
  statusPickerText: { fontSize: 11, fontWeight: '600', flex: 1 },
  disabledControl: { opacity: 0.5 },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 8,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  submitButton: {
    marginTop: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
});