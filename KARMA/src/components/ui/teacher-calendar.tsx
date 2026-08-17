import React, { useMemo, useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  Image,
  useColorScheme,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { ChevronLeft, ChevronRight, CheckCircle2, UserCheck, X, Info } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '../../_context';

type AttendanceStatus = 'Present' | 'Late' | 'Unjustified Absence' | 'Justified Absence' | 'Exam Leave' | 'Not Done Yet';

type TimetableLine = 
  | 'Line 1' | 'Line 2' | 'Line 3' | 'Line 4' | 'Line 5' 
  | 'Line 6' | 'Line 7' | 'Line 8' | 'Line 9' | 'Line 10' 
  | 'Line 11' | 'Line 12';

interface LineConfig {
  name: string;
  color: string;      // Light mode background
  darkColor: string;  // Dark mode background
}

const DEFAULT_LINES_CONFIG: Record<TimetableLine, LineConfig> = {
  'Line 1':  { name: 'Line 1',  color: '#F3E8FF', darkColor: '#2D2245' }, // Purple
  'Line 2':  { name: 'Line 2',  color: '#DBEAFE', darkColor: '#1E2E4A' }, // Blue
  'Line 3':  { name: 'Line 3',  color: '#FEE2E2', darkColor: '#3C2020' }, // Red
  'Line 4':  { name: 'Line 4',  color: '#FEF08A', darkColor: '#423200' }, // Bright Yellow
  'Line 5':  { name: 'Line 5',  color: '#D1FAE5', darkColor: '#143324' }, // Green
  'Line 6':  { name: 'Line 6',  color: '#FEF3C7', darkColor: '#362405' }, // Toasted Amber / Ochre
  'Line 7':  { name: 'Line 7',  color: '#E0E7FF', darkColor: '#1E1B4B' }, // Indigo
  'Line 8':  { name: 'Line 8',  color: '#E0F2FE', darkColor: '#0C4A6E' }, // Sky Blue
  'Line 9':  { name: 'Line 9',  color: '#FCE7F3', darkColor: '#4A044E' }, // Pink
  'Line 10': { name: 'Line 10', color: '#FFEDD5', darkColor: '#431407' }, // Orange
  'Line 11': { name: 'Line 11', color: '#CCFBF1', darkColor: '#042F2E' }, // Teal
  'Line 12': { name: 'Line 12', color: '#F1F5F9', darkColor: '#1E293B' }, // Slate
};

interface TeacherInfo {
  teacher_code: string;
  first_name_preferred?: string;
  last_name_legal?: string;
  teacher_email?: string;
}

interface ClassRecord {
  id: number;
  subject: string;
  level: number;
  line: string;
  teacher_code: string;
  is_break: boolean;
}

interface StudentRecord {
  student_id: number;
  photo?: string;
  first_name_legal: string;
  last_name_legal: string;
  first_name_preferred?: string;
}

interface MasterSlot {
  lineKey: TimetableLine;
  startTime: string;
  endTime: string;
  displayTime: string;
  is_break: boolean;
}

interface CalendarDayRecord {
  date: string;
  dayLabel: string;
  timetableDay: number;
  week: number;
  term: number;
}

interface LineTableRecord {
  day: number;
  line: number;
  start_time: string;
  end_time: string;
  is_break: boolean;
}

const STATUS_CODES: Record<AttendanceStatus, string> = {
  Present: 'P',
  Late: 'L',
  'Unjustified Absence': 'U',
  'Justified Absence': 'J',
  'Exam Leave': 'X',
  'Not Done Yet': '-',
};

const STATUS_DESCRIPTIONS: Record<AttendanceStatus, string> = {
  Present: 'Present in class',
  Late: 'Arrived after scheduled start time',
  'Unjustified Absence': 'Unexplained or unexcused absence',
  'Justified Absence': 'Excused leave or medical cause',
  'Exam Leave': 'Authorized exam study leave',
  'Not Done Yet': 'Attendance has not been recorded',
};

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  Present: '#22C55E',
  Late: '#3B82F6',
  'Unjustified Absence': '#EF4444',
  'Justified Absence': '#EAB308',
  'Exam Leave': '#6B7280',
  'Not Done Yet': '#9CA3AF',
};

export interface TeacherCalendarProps {
  mode?: 'day' | 'week';
}

export function TeacherCalendar({ mode = 'day' }: TeacherCalendarProps) {
  const { email: userEmail } = useAuth();
  const systemScheme = useColorScheme();
  const colorScheme = (systemScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const currentColors = Colors[colorScheme];

  const gridLines = ['9:00', '9:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30'];

  // State Management
  const [loading, setLoading] = useState(true);
  const [teacher, setTeacher] = useState<TeacherInfo | null>(null);
  const [teacherClasses, setTeacherClasses] = useState<ClassRecord[]>([]);

  const [calendarDays, setCalendarDays] = useState<CalendarDayRecord[]>([]);
  const [timetableByDay, setTimetableByDay] = useState<Record<number, MasterSlot[]>>({});
  const [dayIndex, setDayIndex] = useState(0);
  const [now, setNow] = useState(new Date());

  // Attendance Modal States
  const [markingModalVisible, setMarkingModalVisible] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [activeSlotLine, setActiveSlotLine] = useState<string>('');
  const [activeClassForModal, setActiveClassForModal] = useState<ClassRecord | null>(null);
  const [enrolledStudents, setEnrolledStudents] = useState<StudentRecord[]>([]);
  const [studentDayAttendance, setStudentDayAttendance] = useState<Record<number, string[]>>({});
  const [selectedAttendance, setSelectedAttendance] = useState<Record<number, AttendanceStatus | undefined>>({});
  const [submittingAttendance, setSubmittingAttendance] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const formatDisplayTime = (startStr: string, endStr: string) => {
    const to12h = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      const ampm = h >= 12 ? 'pm' : 'am';
      const hour12 = h % 12 || 12;
      return `${hour12}:${m < 10 ? '0' : ''}${m}${ampm}`;
    };
    return `${to12h(startStr)}–${to12h(endStr)}`;
  };

  // 1. Fetch Teacher Info, Classes, and Master Timetable Grid
  useEffect(() => {
    async function initTeacherCalendar() {
      setLoading(true);
      try {
        const { data: teacherData, error: teacherErr } = await supabase
          .from('teacher_personal_information')
          .select('teacher_code, first_name_preferred, last_name_legal, teacher_email')
          .ilike('teacher_email', (userEmail || '').trim())
          .maybeSingle();

        if (teacherErr || !teacherData) {
          throw new Error(`Teacher account not found for ${userEmail}`);
        }
        setTeacher(teacherData);

        const { data: classData, error: classErr } = await supabase
          .from('classes')
          .select('id, subject, level, line, teacher_code, is_break')
          .or(`teacher_code.eq.${teacherData.teacher_code},is_break.eq.true`);

        if (classErr) throw classErr;
        setTeacherClasses(classData || []);
        
        const { data: dbLines, error: linesError } = await supabase
          .from('lines')
          .select('day, line, start_time, end_time')
          .order('line', { ascending: true });

        if (linesError) throw linesError;

        if (dbLines) {
          const mappedTimetable: Record<number, MasterSlot[]> = {};
          (dbLines as LineTableRecord[]).forEach((item) => {
            const dayNum = item.day || Math.floor(item.line / 10);
            const secondDigit = item.line % 10;
            const lineKey = `Line ${secondDigit}` as TimetableLine;

            if (!mappedTimetable[dayNum]) mappedTimetable[dayNum] = [];
            mappedTimetable[dayNum].push({
              lineKey,
              startTime: item.start_time,
              endTime: item.end_time,
              displayTime: formatDisplayTime(item.start_time, item.end_time),
              is_break: item.is_break || false,
            });
          });
          setTimetableByDay(mappedTimetable);
        }

        const { data: dbCalendar, error: calError } = await supabase
          .from('calendar')
          .select('date, day, week, term')
          .order('date', { ascending: true });

        if (calError) throw calError;

        if (dbCalendar && dbCalendar.length > 0) {
          const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const formattedDays: CalendarDayRecord[] = dbCalendar.map((item) => {
            const parts = item.date.split('-');
            const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            return {
              date: item.date,
              dayLabel: dayLabels[dateObj.getDay()] || 'Mon',
              timetableDay: item.day,
              week: item.week,
              term: item.term,
            };
          });

          setCalendarDays(formattedDays);

          const todayStr = new Date().toISOString().split('T')[0];
          
          let targetIdx = formattedDays.findIndex((d) => d.date === todayStr);

          if (targetIdx === -1) {
            targetIdx = formattedDays.findIndex((d) => d.date > todayStr);
          }

          if (targetIdx === -1) {
            targetIdx = formattedDays.length - 1;
          }

          setDayIndex(targetIdx);
        }
      } catch (err) {
        console.error('Error fetching teacher calendar data:', err);
      } finally {
        setLoading(false);
      }
    }

    if (userEmail) initTeacherCalendar();
  }, [userEmail]);

  const activeDayRecord = calendarDays[dayIndex] || {
    date: new Date().toISOString().split('T')[0],
    dayLabel: 'Mon',
    timetableDay: 1,
    term: 1,
    week: 1,
  };

  // 2. Open Attendance Sheet dynamically per specific Line Slot
  const openAttendanceModal = async (lineKey: string) => {
    const targetLineNum = lineKey.replace('Line ', '').trim();
    const matchedClass = teacherClasses.find((c) => String(c.line) === targetLineNum || `Line ${c.line}` === lineKey);

    if (!matchedClass) return;

    setActiveSlotLine(lineKey);
    setActiveClassForModal(matchedClass);
    // Reset selection map so attendance defaults to unselected
    setSelectedAttendance({});
    setShowLegend(false);
    setMarkingModalVisible(true);

    try {
      const { data: classStudents, error: classStudentsErr } = await supabase
        .from('classes_students')
        .select('student_id')
        .eq('class_id', matchedClass.id);

      if (classStudentsErr) throw classStudentsErr;
      const studentIds = (classStudents || []).map((cs) => cs.student_id);
      let studentList: StudentRecord[] = [];

      if (studentIds.length > 0) {
        const { data: profiles, error: profileErr } = await supabase
          .from('student_personal_information')
          .select('student_id, first_name_legal, last_name_legal, first_name_preferred')
          .in('student_id', studentIds);

        if (profileErr) throw profileErr;

        const filePaths = (profiles || []).map((s) => `students/${s.student_id}.jpg`);
        const { data: signedData, error: signedErr } = await supabase.storage
          .from('id_photos')
          .createSignedUrls(filePaths, 3600);

        if (signedErr) {
          console.warn('Error fetching signed URLs from id_photos:', signedErr);
        }

        studentList = (profiles || []).map((student) => {
          const path = `students/${student.student_id}.jpg`;
          const signedItem = signedData?.find((item) => item.path === path);
          return {
            ...student,
            photo: signedItem?.signedUrl || undefined,
          };
        });

        const { data: existingAttendance, error: attErr } = await supabase
          .from('attendance')
          .select('student_id, status, line')
          .eq('date', activeDayRecord.date)
          .in('student_id', studentIds);

        if (attErr) {
          console.warn('Error fetching today attendance history:', attErr);
        } else {
          const attendanceMap: Record<number, string[]> = {};
          const currentSlotSelections: Record<number, AttendanceStatus> = {};

          (existingAttendance || []).forEach((record) => {
            if (!attendanceMap[record.student_id]) {
              attendanceMap[record.student_id] = [];
            }
            const statusCode = STATUS_CODES[record.status as AttendanceStatus] || record.status;
            attendanceMap[record.student_id].push(statusCode);

            // Pre-fill selection ONLY if recorded for this specific line slot
            if (String(record.line) === targetLineNum) {
              currentSlotSelections[record.student_id] = record.status as AttendanceStatus;
            }
          });

          setStudentDayAttendance(attendanceMap);
          setSelectedAttendance(currentSlotSelections);
        }
      }

      setEnrolledStudents(studentList);
    } catch (err) {
      console.error('Error opening attendance modal:', err);
    }
  };

  // 3. Save Attendance without forced defaults
  const submitAttendance = async () => {
    if (!activeClassForModal || enrolledStudents.length === 0) return;
    setSubmittingAttendance(true);

    try {
      const lineNum = activeSlotLine.replace('Line ', '').trim();

      const recordsToInsert = enrolledStudents
        .filter((student) => selectedAttendance[student.student_id] !== undefined)
        .map((student) => ({
          date: activeDayRecord.date,
          line: Number(lineNum),
          student_id: student.student_id,
          status: selectedAttendance[student.student_id] as AttendanceStatus,
        }));

      if (recordsToInsert.length === 0) {
        setMarkingModalVisible(false);
        return;
      }

      const { error } = await supabase
        .from('attendance')
        .upsert(recordsToInsert, { onConflict: 'date,line,student_id' });

      if (error) throw error;
      setMarkingModalVisible(false);
    } catch (err) {
      console.error('Failed to submit attendance:', err);
    } finally {
      setSubmittingAttendance(false);
    }
  };

  const computePositionsForDay = (timetableDay: number) => {
    const slots = timetableByDay[timetableDay] || [];
    const START_ANCHOR_MINUTES = 9 * 60;
    const ROW_HEIGHT_PER_30_MIN = 100;
    const MINUTE_HEIGHT_RATIO = ROW_HEIGHT_PER_30_MIN / 30;

    return slots.map((slot, idx) => {
      const [startH, startM] = slot.startTime.split(':').map(Number);
      const [endH, endM] = slot.endTime.split(':').map(Number);
      const startTotalMinutes = startH * 60 + startM;
      const calculatedTop = (startTotalMinutes - START_ANCHOR_MINUTES) * MINUTE_HEIGHT_RATIO;
      const calculatedHeight = ((endH * 60 + endM) - startTotalMinutes) * MINUTE_HEIGHT_RATIO;

      const slotLineNum = slot.lineKey.replace(/\D/g, '').trim();

      const activeClass = teacherClasses.find(
        (c) => String(c.line).trim() === slotLineNum
      );

      const lineConfig = DEFAULT_LINES_CONFIG[slot.lineKey as TimetableLine] || DEFAULT_LINES_CONFIG['Line 12'];
      const cardBgColor = lineConfig ? (colorScheme === 'dark' ? lineConfig.darkColor : lineConfig.color) : (colorScheme === 'dark' ? '#1E293B' : '#F1F5F9');

      const isBreak = activeClass?.is_break ?? false;

      return {
        id: `${slot.lineKey}-${idx}`,
        lineKey: slot.lineKey,
        title: activeClass 
          ? (isBreak ? activeClass.subject : `${activeClass.subject} (${slot.lineKey})`) 
          : slot.lineKey,
        time: slot.displayTime,
        isAssigned: !!activeClass && !isBreak,
        top: calculatedTop,
        height: calculatedHeight,
        backgroundColor: cardBgColor,
      };
    });
  };

  const getCurrentTimeIndicator = (dateStr: string) => {
    const todayStr = now.toISOString().split('T')[0];
    if (dateStr !== todayStr) return null;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const START_ANCHOR_MINUTES = 9 * 60;
    const END_ANCHOR_MINUTES = 16 * 60;
    const ROW_HEIGHT_PER_30_MIN = 100;
    const MINUTE_HEIGHT_RATIO = ROW_HEIGHT_PER_30_MIN / 30;

    if (currentMinutes < START_ANCHOR_MINUTES || currentMinutes > END_ANCHOR_MINUTES) return null;
    return (currentMinutes - START_ANCHOR_MINUTES) * MINUTE_HEIGHT_RATIO;
  };

  if (loading) {
    return (
      <View style={[styles.calendarContainer, styles.centeredLoading]}>
        <ActivityIndicator size="large" color={currentColors.text} />
      </View>
    );
  }

  const activeDayTimeTop = getCurrentTimeIndicator(activeDayRecord.date);

  return (
    <View style={styles.calendarContainer}>
      {/* HEADER CONTROLS */}
      <View style={[styles.timetableHeaderBorder, { borderColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' }]}>
        <ThemedText style={[styles.blockTitle, { color: currentColors.text, textAlign: 'center' }]}>
          {teacher?.first_name_preferred || teacher?.last_name_legal
            ? `Marking for ${teacher.first_name_preferred || ''} ${teacher.last_name_legal || ''}`
            : 'Teacher Timetable'}
        </ThemedText>

        <View style={styles.timetableSubHeaderCentered}>
          <View style={styles.dateNavigationTight}>
            <TouchableOpacity onPress={() => setDayIndex((prev) => Math.max(0, prev - 1))} style={styles.navButtonPadding}>
              <ChevronLeft size={22} color={currentColors.text} />
            </TouchableOpacity>

            <ThemedText style={[styles.dateTextUnified, { color: currentColors.text }]}>
              {`${activeDayRecord.dayLabel} – ${activeDayRecord.date} (Day ${activeDayRecord.timetableDay})`}
            </ThemedText>

            <TouchableOpacity onPress={() => setDayIndex((prev) => Math.min(calendarDays.length - 1, prev + 1))} style={styles.navButtonPadding}>
              <ChevronRight size={22} color={currentColors.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* TIMETABLE CANVAS */}
      <View style={styles.calendarBoardWrapper}>
        <View style={StyleSheet.absoluteFill}>
          {gridLines.map((time, index) => (
            <View key={index} style={[styles.slotLineRow, { borderColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }]}>
              <View style={styles.timeAxisLabelContainer}>
                <ThemedText style={[styles.timeMarker, { color: currentColors.textSecondary }]}>{time}</ThemedText>
              </View>
              <View style={styles.horizontalLineExtended} />
            </View>
          ))}
        </View>

        {/* Dynamic Class Cards */}
        <View style={styles.eventsOverlayContainer}>
          {computePositionsForDay(activeDayRecord.timetableDay).map((event) => (
            <TouchableOpacity
              key={event.id}
              disabled={!event.isAssigned}
              onPress={() => openAttendanceModal(event.lineKey)}
              style={[
                styles.calendarFloatingCard,
                {
                  top: event.top,
                  height: event.height,
                  left: 0,
                  right: '12%',
                  backgroundColor: event.backgroundColor,
                  borderColor: event.isAssigned ? '#3B82F6' : 'transparent',
                  borderWidth: event.isAssigned ? 1 : 0,
                },
              ]}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                  <ThemedText style={[styles.eventName, { color: colorScheme === 'dark' ? '#FFF' : '#1E293B' }]}>
                    {event.title}
                  </ThemedText>
                  <ThemedText style={[styles.eventTimeText, { color: colorScheme === 'dark' ? '#94A3B8' : '#64748B' }]}>
                    {event.time}
                  </ThemedText>
                </View>

                {event.isAssigned && (
                  <View style={styles.markBadge}>
                    <UserCheck size={14} color="#3B82F6" />
                    <ThemedText style={styles.markBadgeText}>Mark Attendance</ThemedText>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}

          {/* Current Time Indicator Line */}
          {activeDayTimeTop !== null && (
            <View style={[styles.currentTimeIndicatorLine, { top: activeDayTimeTop, left: 0, right: 0 }]}>
              <View style={styles.currentTimeDot} />
            </View>
          )}
        </View>
      </View>

      {/* ATTENDANCE MARKING MODAL */}
      <Modal visible={markingModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colorScheme === 'dark' ? '#0F172A' : '#FFFFFF' }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <ThemedText style={[styles.modalTitle, { color: currentColors.text }]}>Mark Class Attendance</ThemedText>
                <TouchableOpacity
                  onPress={() => setShowLegend((prev) => !prev)}
                  style={[styles.infoIconButton, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F1F5F9' }]}
                  hitSlop={8}
                >
                  <Info size={16} color={currentColors.text} />
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity onPress={() => setMarkingModalVisible(false)}>
                <X size={24} color={currentColors.text} />
              </TouchableOpacity>
            </View>

            <ThemedText style={{ color: currentColors.textSecondary, fontSize: 13, marginBottom: 8 }}>
              Session: {activeSlotLine} ({activeDayRecord.date})
            </ThemedText>

            {/* Attendance Key Explanation Card */}
            {showLegend && (
              <View style={[styles.legendCard, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F8FAFC', borderColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' }]}>
                <ThemedText style={[styles.legendTitle, { color: currentColors.text }]}>Attendance Code Key</ThemedText>
                {(['Present', 'Late', 'Unjustified Absence', 'Justified Absence', 'Exam Leave'] as AttendanceStatus[]).map((st) => (
                  <View key={st} style={styles.legendRow}>
                    <View style={[styles.codeBadge, { backgroundColor: STATUS_COLORS[st] }]}>
                      <ThemedText style={styles.codeBadgeText}>{STATUS_CODES[st]}</ThemedText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={[styles.legendName, { color: currentColors.text }]}>{st}</ThemedText>
                      <ThemedText style={[styles.legendDesc, { color: currentColors.textSecondary }]}>{STATUS_DESCRIPTIONS[st]}</ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <ScrollView style={{ flex: 1, marginVertical: 12 }}>
              {enrolledStudents.map((student) => {
                const displayName = `${student.first_name_preferred || student.first_name_legal} ${student.last_name_legal}`;
                const priorBadges = studentDayAttendance[student.student_id] || [];
                const currentSelection = selectedAttendance[student.student_id]; // Defaults to undefined
                return (
                  <View key={student.student_id} style={[styles.studentRow, { borderColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' }]}>
                    <View style={styles.studentInfo}>
                      {student.photo ? (
                        <Image source={{ uri: student.photo }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                          <ThemedText style={{ fontWeight: 'bold', color: '#64748B' }}>
                            {displayName.charAt(0)}
                          </ThemedText>
                        </View>
                      )}

                      <View style={{ flex: 1 }}>
                        <ThemedText style={[styles.studentName, { color: currentColors.text }]}>{displayName}</ThemedText>
                        <View style={styles.historyRow}>
                          <ThemedText style={[styles.historyLabel, { color: currentColors.textSecondary }]}>Today:</ThemedText>
                          {priorBadges.length > 0 ? (
                            priorBadges.map((badge, bIdx) => (
                              <View key={bIdx} style={styles.historyBadge}>
                                <ThemedText style={styles.historyBadgeText}>{badge}</ThemedText>
                              </View>
                            ))
                          ) : (
                            <ThemedText style={styles.historyBadgeTextNone}>No records</ThemedText>
                          )}
                        </View>
                      </View>
                    </View>

                    <View style={styles.statusGroup}>
                      {(['Present', 'Late', 'Unjustified Absence', 'Justified Absence', 'Exam Leave'] as AttendanceStatus[]).map((status) => {
                        const active = currentSelection === status;
                        return (
                          <TouchableOpacity
                            key={status}
                            onPress={() =>
                              setSelectedAttendance((prev) => ({
                                ...prev,
                                [student.student_id]: active ? undefined : status, // Toggle selection
                              }))
                            }
                            style={[
                              styles.statusButton,
                              {
                                backgroundColor: active ? STATUS_COLORS[status] : 'transparent',
                                borderColor: active ? STATUS_COLORS[status] : (colorScheme === 'dark' ? '#475569' : '#CBD5E1'),
                              },
                            ]}
                          >
                            <ThemedText style={{ fontSize: 11, fontWeight: '700', color: active ? '#FFF' : (colorScheme === 'dark' ? '#94A3B8' : '#64748B') }}>
                              {STATUS_CODES[status]}
                            </ThemedText>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity onPress={submitAttendance} disabled={submittingAttendance} style={styles.submitButton}>
              {submittingAttendance ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <CheckCircle2 size={18} color="#FFF" />
                  <ThemedText style={styles.submitText}>Save Attendance</ThemedText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default TeacherCalendar;

const styles = StyleSheet.create({
  calendarContainer: {
    width: '100%',
  },
  centeredLoading: {
    paddingVertical: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timetableHeaderBorder: {
    borderBottomWidth: 1,
    paddingBottom: Spacing.three,
    marginBottom: Spacing.three,
  },
  blockTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  timetableSubHeaderCentered: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  dateNavigationTight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  navButtonPadding: {
    padding: Spacing.one,
  },
  dateTextUnified: {
    fontSize: 15,
    fontWeight: '700',
    minWidth: 240,
    textAlign: 'center',
  },
  calendarBoardWrapper: {
    position: 'relative',
    height: 1300,
    width: '100%',
    marginTop: Spacing.two,
  },
  slotLineRow: {
    flexDirection: 'row',
    height: 100,
    alignItems: 'flex-start',
  },
  timeAxisLabelContainer: {
    width: 55,
    paddingTop: 2,
  },
  timeMarker: {
    fontSize: 14,
    fontWeight: '800',
  },
  horizontalLineExtended: {
    flex: 1,
    height: 1,
    borderBottomWidth: 1,
    borderColor: 'inherit',
    opacity: 0.8,
  },
  eventsOverlayContainer: {
    position: 'absolute',
    top: 10,
    left: 55,
    right: 0,
    bottom: 0,
  },
  calendarFloatingCard: {
    position: 'absolute',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  eventName: {
    fontSize: 15,
    fontWeight: '700',
  },
  eventTimeText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  markBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  markBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
  },
  currentTimeIndicatorLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#EF4444',
    zIndex: 99,
  },
  currentTimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginLeft: -4,
    marginTop: -3,
  },
  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '80%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 4,
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  infoIconButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendCard: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginVertical: 6,
    gap: 8,
  },
  legendTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  codeBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  legendName: {
    fontSize: 12,
    fontWeight: '700',
  },
  legendDesc: {
    fontSize: 11,
  },
  studentRow: {
    flexDirection: 'column',
    borderBottomWidth: 1,
    paddingVertical: 10,
    gap: 8,
  },
  studentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentName: {
    fontSize: 14,
    fontWeight: '700',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  historyLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  historyBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  historyBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
  },
  historyBadgeTextNone: {
    color: '#94A3B8',
    fontSize: 9,
  },
  statusGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  statusButton: {
    flex: 1,
    height: 28,
    borderWidth: 1,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButton: {
    backgroundColor: '#22C55E',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  submitText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});