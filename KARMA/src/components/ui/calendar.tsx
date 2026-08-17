import React, { useMemo, useState, useEffect } from 'react';
import { StyleSheet, View, useColorScheme, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react-native';
import { supabase } from '@/lib/supabase'; // Adjust path to your Supabase client instance
import { useAuth } from '../../_context';

type TimetableLine = 'Line 1' | 'Line 2' | 'Line 3' | 'Line 4' | 'Line 5' | 'Line 6' | 'Line 7' | 'Line 8' | 'Line 9' | 'Line 10' | 'Line 11' | 'Line 12';
type AttendanceStatus = 'present' | 'late' | 'unjustified_absent' | 'justified_absent' | 'exam_leave' | 'none' | string;

interface MasterSlot {
  lineKey: TimetableLine;
  startTime: string; 
  endTime: string;   
  displayTime: string; 
}

interface ClassRecord {
  id: number;
  subject: string;
  level: number;
  line: string;
  teacher_code: string;
  is_break: boolean;
  room: string;
}

interface ClassStudentJoin {
  class_id: number;
  student_id: number;
  classes: ClassRecord;
}

interface AttendanceRecord {
  date: string;
  line: string;
  status: AttendanceStatus;
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

interface LineConfig {
  name: string;
  room?: string;
  teacher?: string;
  isBreak?: boolean;
  color: string;
  darkColor: string;
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

export interface CalendarProps {
  mode: 'day' | 'week';
  studentId?: number;
  attendanceRecords?: any[];
}

export function Calendar({ mode, attendanceRecords: externalRecords }: CalendarProps) {
  const { email: userEmail } = useAuth();
  const systemScheme = useColorScheme();
  const colorScheme = (systemScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const currentColors = Colors[colorScheme];
  const circleBgColor = colorScheme === 'dark' ? '#334155' : '#E2E8F0';
  const circleTextColor = currentColors.text;
  const gridLines = ['9:00', '9:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30'];

  const [calendarDays, setCalendarDays] = useState<CalendarDayRecord[]>([]);
  const [timetableByDay, setTimetableByDay] = useState<Record<number, MasterSlot[]>>({});
  const [dayIndex, setDayIndex] = useState(0); 
  const [weekIndex, setWeekIndex] = useState(0); 
  const [loading, setLoading] = useState(true);

  const [userLinesConfig, setUserLinesConfig] = useState<Record<TimetableLine, LineConfig>>(DEFAULT_LINES_CONFIG);
  const [attendanceData, setAttendanceData] = useState<Record<string, Record<string, AttendanceStatus>>>({});

  // Real-time Date & Time State for current time red line
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000); // Updates every minute
    return () => clearInterval(timer);
  }, []);

  // Helper to format string time e.g. "09:00" -> "9:00am"
  const formatDisplayTime = (startStr: string, endStr: string) => {
    const to12h = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      const ampm = h >= 12 ? 'pm' : 'am';
      const hour12 = h % 12 || 12;
      return `${hour12}:${m < 10 ? '0' : ''}${m}${ampm}`;
    };
    return `${to12h(startStr)}–${to12h(endStr)}`;
  };

  // Helper to convert line numbers into Line Keys
  const resolveLineInfo = (lineCode: number): { lineKey: TimetableLine; isBreak: boolean } => {
    const secondDigit = lineCode % 10;
    return { lineKey: `Line ${secondDigit}` as TimetableLine, isBreak: false };
  };

  // Process externally passed attendance records
  useEffect(() => {
    if (externalRecords && externalRecords.length > 0) {
      const attendanceMap: Record<string, Record<string, AttendanceStatus>> = {};
      externalRecords.forEach((record: any) => {
        const dateKey = record.date;
        const lineKey = String(record.line);
        const statusVal = record.attendance_indicators?.label?.toLowerCase() || record.status || 'none';
        
        if (!attendanceMap[dateKey]) {
          attendanceMap[dateKey] = {};
        }
        if (lineKey) {
          attendanceMap[dateKey][lineKey] = statusVal;
        }
      });
      setAttendanceData((prev) => ({ ...prev, ...attendanceMap }));
    }
  }, [externalRecords]);

  // Fetch Lines, Calendar Days, Enrolled Classes, and Attendance Data from Supabase
  useEffect(() => {
    async function loadDatabaseData() {
      setLoading(true);
      try {
        const { data: studentInfo, error: studentError } = await supabase
          .from('student_personal_information')
          .select('student_id')
          .eq('email', userEmail)
          .maybeSingle();

        if (studentError || !studentInfo?.student_id) {
          throw new Error(`Could not find student ID corresponding to "${userEmail}".`);
        }

        const { data: dbLines, error: linesError } = await supabase
          .from('lines')
          .select('day, line, start_time, end_time')
          .order('line', { ascending: true });

        if (linesError) throw linesError;

        if (dbLines && dbLines.length > 0) {
          const mappedTimetable: Record<number, MasterSlot[]> = {};

          (dbLines as LineTableRecord[]).forEach((item) => {
            const dayNum = item.day || Math.floor(item.line / 10);
            const { lineKey } = resolveLineInfo(item.line);

            if (!mappedTimetable[dayNum]) {
              mappedTimetable[dayNum] = [];
            }

            mappedTimetable[dayNum].push({
              lineKey,
              startTime: item.start_time,
              endTime: item.end_time,
              displayTime: formatDisplayTime(item.start_time, item.end_time),
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
            const dateObj = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));

            return {
              date: item.date,
              dayLabel: dayLabels[dateObj.getUTCDay()] || 'Mon',
              timetableDay: item.day,
              week: item.week,
              term: item.term,
            };
          });

          setCalendarDays(formattedDays);

          const todayStr = new Date().toISOString().split('T')[0];
          const todayIdx = formattedDays.findIndex((d) => d.date === todayStr);

          if (todayIdx !== -1) {
            setDayIndex(todayIdx);
            setWeekIndex(Math.floor(todayIdx / 5));
          } else {
            const nextAvailableIdx = formattedDays.findIndex((d) => d.date > todayStr);

            if (nextAvailableIdx !== -1) {
              setDayIndex(nextAvailableIdx);
              setWeekIndex(Math.floor(nextAvailableIdx / 5));
            } else {
              const lastIdx = Math.max(0, formattedDays.length - 1);
              setDayIndex(lastIdx);
              setWeekIndex(Math.floor(lastIdx / 5));
            }
          }
        }

        const { data: enrolledClasses, error: classError } = await supabase
          .from('classes_students')
          .select(`
            class_id,
            student_id,
            classes!class_id (
              id,
              subject,
              level,
              line,
              teacher_code,
              is_break,
              room
            )
          `)
          .eq('student_id', studentInfo.student_id);

        if (classError) throw classError;
        const updatedLines = { ...DEFAULT_LINES_CONFIG };
        if (enrolledClasses) {
          (enrolledClasses as unknown as ClassStudentJoin[]).forEach((item) => {
            const cls = item.classes;
            if (cls && cls.line) {
              const rawLine = String(cls.line).trim();
              const lineKey = (rawLine.startsWith('Line') ? rawLine : `Line ${rawLine}`) as TimetableLine;
              if (updatedLines[lineKey]) {
                updatedLines[lineKey] = {
                  ...updatedLines[lineKey],
                  name: (cls.subject + (cls.level ? ` (L${cls.level})` : '')).trim(),
                  teacher: cls.teacher_code,
                  isBreak: cls.is_break,
                  room: cls.room,
                };
              }
            }
          });
        }
        setUserLinesConfig(updatedLines);

        const { data: attendanceRecords, error: attendanceError } = await supabase
          .from('attendance')
          .select('date, line, status')
          .eq('student_id', studentInfo.student_id);

        if (!attendanceError && attendanceRecords) {
          const attendanceMap: Record<string, Record<string, AttendanceStatus>> = {};
          attendanceRecords.forEach((record: AttendanceRecord) => {
            if (!attendanceMap[record.date]) {
              attendanceMap[record.date] = {};
            }
            attendanceMap[record.date][String(record.line)] = record.status;
          });
          setAttendanceData((prev) => ({ ...prev, ...attendanceMap }));
        }
      } catch (err) {
        console.error('Error querying Supabase database:', err);
      } finally {
        setLoading(false);
      }
    }
    
    if (userEmail) {
      loadDatabaseData();
    }
  }, [userEmail]);

  const activeDayRecord = calendarDays[dayIndex] || calendarDays[0] || {
    date: '2026-05-11',
    dayLabel: 'Mon',
    timetableDay: 1,
    term: 2,
    week: 1,
  };

  const totalWeeks = Math.max(1, Math.ceil(calendarDays.length / 5));

  const activeWeekDays = useMemo(() => {
    if (calendarDays.length === 0) return [];
    const startIdx = weekIndex * 5;
    return calendarDays.slice(startIdx, startIdx + 5);
  }, [weekIndex, calendarDays]);

  const handlePrev = () => {
    if (mode === 'day') {
      setDayIndex((prev) => Math.max(0, prev - 1));
    } else {
      setWeekIndex((prev) => Math.max(0, prev - 1));
    }
  };

  const handleNext = () => {
    if (mode === 'day') {
      setDayIndex((prev) => Math.min(calendarDays.length - 1, prev + 1));
    } else {
      setWeekIndex((prev) => Math.min(totalWeeks - 1, prev + 1));
    }
  };

  const handleFastPrev = () => {
    if (mode === 'day') {
      setDayIndex((prev) => Math.max(0, prev - 10));
    } else {
      setWeekIndex((prev) => Math.max(0, prev - 10));
    }
  };

  const handleFastNext = () => {
    if (mode === 'day') {
      setDayIndex((prev) => Math.min(calendarDays.length - 1, prev + 10));
    } else {
      setWeekIndex((prev) => Math.min(totalWeeks - 1, prev + 10));
    }
  };

  const computePositionsForDay = (timetableDay: number, dateStr: string) => {
    const slots = timetableByDay[timetableDay] || [];
    const START_ANCHOR_MINUTES = 9 * 60; 
    const ROW_HEIGHT_PER_30_MIN = 100;
    const MINUTE_HEIGHT_RATIO = ROW_HEIGHT_PER_30_MIN / 30;

    return slots.map((slot, idx) => {
      const [startH, startM] = slot.startTime.split(':').map(Number);
      const [endH, endM] = slot.endTime.split(':').map(Number);
      const startTotalMinutes = startH * 60 + startM;
      const endTotalMinutes = endH * 60 + endM;

      const calculatedTop = (startTotalMinutes - START_ANCHOR_MINUTES) * MINUTE_HEIGHT_RATIO;
      const calculatedHeight = (endTotalMinutes - startTotalMinutes) * MINUTE_HEIGHT_RATIO;

      const lineInfo = userLinesConfig[slot.lineKey] || DEFAULT_LINES_CONFIG[slot.lineKey];
      const dayAttendance = attendanceData[dateStr];
      const DBkey = slot.lineKey.replace('Line ', '').trim();
      const attendanceStatus = dayAttendance ? String(dayAttendance[DBkey] || 'none').toLowerCase() : 'none';

      let statusColor = 'transparent';
      if (['present', 'attended'].includes(attendanceStatus)) statusColor = '#22C55E';
      if (['late', 'tardy'].includes(attendanceStatus)) statusColor = '#3B82F6';
      if (['unjustified_absent', 'unexcused', 'unjustified absence'].includes(attendanceStatus)) statusColor = '#EF4444';
      if (['justified_absent', 'excused', 'justified absence'].includes(attendanceStatus)) statusColor = '#EAB308';
      if (['exam_leave', 'exam leave'].includes(attendanceStatus)) statusColor = '#6B7280';

      return {
        id: `${dateStr}-${slot.lineKey}-${idx}`,
        name: lineInfo.name,
        sub: slot.displayTime,
        room: lineInfo.room,
        teacher: lineInfo.teacher,
        top: calculatedTop,
        height: calculatedHeight,
        isBreak: lineInfo.isBreak || false,
        statusColor,
        color: lineInfo.color,
        darkColor: lineInfo.darkColor,
      };
    });
  };

  const getCurrentTimeIndicator = (dateStr: string) => {
    const todayStr = now.toISOString().split('T')[0];
    if (dateStr !== todayStr) return null;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const START_ANCHOR_MINUTES = 9 * 60; // 9:00 AM
    const END_ANCHOR_MINUTES = 16 * 60;  // 4:00 PM
    const ROW_HEIGHT_PER_30_MIN = 100;
    const MINUTE_HEIGHT_RATIO = ROW_HEIGHT_PER_30_MIN / 30;

    if (currentMinutes < START_ANCHOR_MINUTES || currentMinutes > END_ANCHOR_MINUTES) {
      return null;
    }

    return (currentMinutes - START_ANCHOR_MINUTES) * MINUTE_HEIGHT_RATIO;
  };

  const formattedDateTitle = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
  };

  if (loading) {
    return (
      <View style={[styles.calendarContainer, styles.centeredLoading]}>
        <ActivityIndicator size="large" color={currentColors.text} />
      </View>
    );
  }

  const todayStr = now.toISOString().split('T')[0];
  const activeDayTimeTop = mode === 'day' ? getCurrentTimeIndicator(activeDayRecord.date) : null;
  const activeWeekDayIndex = mode === 'week' ? activeWeekDays.findIndex((d) => d.date === todayStr) : -1;
  const activeWeekTimeTop = activeWeekDayIndex !== -1 ? getCurrentTimeIndicator(todayStr) : null;

  return (
    <View style={styles.calendarContainer}>
      {/* --- HEADER CONTROLS --- */}
      <View style={[styles.timetableHeaderBorder, { borderColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' }]}>
        <ThemedText style={[styles.blockTitle, { color: currentColors.text, textAlign: 'center' }]}>
          {(() => {
            const currentRecord = mode === 'day' 
              ? activeDayRecord 
              : (activeWeekDays[0] || activeDayRecord);

            const term = currentRecord?.term ?? 1;
            const week = currentRecord?.week ?? 1;

            return `Term ${term}, Week ${week}`;
          })()}
        </ThemedText>

        <View style={styles.timetableSubHeaderCentered}>
          <View style={styles.dateNavigationTight}>
            <TouchableOpacity onPress={handleFastPrev} style={styles.navButtonPadding}>
              <ChevronsLeft size={22} color={currentColors.text} />
            </TouchableOpacity>

            <TouchableOpacity onPress={handlePrev} style={styles.navButtonPadding}>
              <ChevronLeft size={22} color={currentColors.text} />
            </TouchableOpacity>

            <ThemedText style={[styles.dateTextUnified, { color: currentColors.text }]}>
              {mode === 'day' 
                ? `${activeDayRecord.dayLabel} – ${formattedDateTitle(activeDayRecord.date)} (Day ${activeDayRecord.timetableDay})` 
                : activeWeekDays.length > 0 
                  ? `${formattedDateTitle(activeWeekDays[0].date)} – ${formattedDateTitle(activeWeekDays[activeWeekDays.length - 1].date)}`
                  : ''
              }
            </ThemedText>

            <TouchableOpacity onPress={handleNext} style={styles.navButtonPadding}>
              <ChevronRight size={22} color={currentColors.text} />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleFastNext} style={styles.navButtonPadding}>
              <ChevronsRight size={22} color={currentColors.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* --- DAY / WEEK CIRCLED HEADER --- */}
      {mode === 'day' ? (
        <View style={styles.singleDayHeaderRow}>
          <View style={styles.dayHeaderCell}>
            <ThemedText style={[styles.weekDayHeaderText, activeDayRecord.date === todayStr ? styles.todayDayHeaderText : { color: currentColors.text }]}>
              {activeDayRecord.dayLabel}
            </ThemedText>
            <ThemedText style={{ fontSize: 11, fontWeight: '700', color: currentColors.textSecondary }}>
              Day {activeDayRecord.timetableDay}
            </ThemedText>
          </View>
        </View>
      ) : (
        activeWeekDays.length > 0 && (
          <View style={styles.weekDaysHeaderRow}>
            {activeWeekDays.map((dayObj, index) => {
              const isSelectedOrToday = dayObj.date === activeDayRecord.date || dayObj.date === todayStr;
              return (
                <View key={index} style={styles.dayHeaderCell}>
                  <View
                    style={[
                      styles.dayLabelCircle,
                      isSelectedOrToday && { backgroundColor: circleBgColor },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.weekDayHeaderText,
                        isSelectedOrToday
                          ? { color: circleTextColor }
                          : { color: currentColors.text },
                      ]}
                    >
                      {dayObj.dayLabel}
                    </ThemedText>
                  </View>
                  <ThemedText style={{ fontSize: 11, fontWeight: '700', color: currentColors.textSecondary }}>
                    Day {dayObj.timetableDay}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        )
      )}

      {/* --- BASE LAYOUT CANVAS --- */}
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

        {/* --- EVENT COLUMNS LAYOUT OVERLAY --- */}
        <View style={styles.eventsOverlayContainer}>
          {mode === 'day' ? (
            <View style={styles.dayColumnContainer}>
              {computePositionsForDay(activeDayRecord.timetableDay, activeDayRecord.date).map((event) => (
                <View 
                  key={event.id} 
                  style={[
                    styles.calendarFloatingCard, 
                    { 
                      top: event.top, 
                      height: event.height, 
                      backgroundColor: colorScheme === 'dark' ? event.darkColor : event.color,
                      borderStyle: event.isBreak ? 'dashed' : 'solid',
                      borderWidth: event.isBreak ? 1 : 0,
                      borderColor: colorScheme === 'dark' ? '#475569' : '#CBD5E1',
                    }
                  ]}
                >
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.flexOneLeft}>
                      <ThemedText numberOfLines={1} style={[styles.eventName, { color: colorScheme === 'dark' ? '#FFFFFF' : '#1E293B' }]}>
                        {event.name}
                      </ThemedText>
                      <ThemedText style={[styles.eventTimeBreakText, { color: colorScheme === 'dark' ? '#94A3B8' : '#64748B' }]}>
                        {event.sub}
                      </ThemedText>
                    </View>

                    <View style={styles.alignRight}>
                      {!event.isBreak && (
                        <>
                          <ThemedText style={[styles.roomText, { color: colorScheme === 'dark' ? '#94A3B8' : '#475569' }]}>{event.room}</ThemedText>
                          <ThemedText style={[styles.teacherText, { color: colorScheme === 'dark' ? '#64748B' : '#94A3B8' }]}>{event.teacher}</ThemedText>
                        </>
                      )}
                    </View>
                  </View>

                  <View style={styles.cardFooterRow}>
                    {!event.isBreak && event.statusColor !== 'transparent' && (
                      <View style={[styles.attendanceStatusDot, { backgroundColor: event.statusColor }]} />
                    )}
                  </View>
                </View>
              ))}

              {/* CURRENT TIME INDICATOR (DAY MODE) */}
              {activeDayTimeTop !== null && (
                <View style={[styles.currentTimeIndicatorLine, { top: activeDayTimeTop, left: 0, right: 0 }]}>
                  <View style={styles.currentTimeDot} />
                </View>
              )}
            </View>
          ) : (
            <View style={styles.weekColumnsContainer}>
              {activeWeekDays.map((dayObj) => {
                const dayEvents = computePositionsForDay(dayObj.timetableDay, dayObj.date);
                const isCurrentWeekDay = dayObj.date === todayStr;
                const weekDayTimeTop = isCurrentWeekDay ? getCurrentTimeIndicator(todayStr) : null;

                return (
                  <View key={dayObj.date} style={styles.weekColumnSegment}>
                    {dayEvents.map((event) => (
                      <View 
                        key={event.id} 
                        style={[
                          styles.calendarFloatingCard, 
                          { 
                            top: event.top, 
                            height: event.height, 
                            backgroundColor: colorScheme === 'dark' ? event.darkColor : event.color,
                            borderStyle: event.isBreak ? 'dashed' : 'solid',
                            borderWidth: event.isBreak ? 1 : 0,
                            borderColor: colorScheme === 'dark' ? '#475569' : '#CBD5E1',
                            paddingHorizontal: 4,
                            paddingVertical: 4,
                          }
                        ]}
                      >
                        <View style={styles.cardHeaderRow}>
                          <View style={styles.flexOneLeft}>
                            <ThemedText numberOfLines={1} style={[styles.eventName, { fontSize: 12, lineHeight: 14, color: colorScheme === 'dark' ? '#FFFFFF' : '#1E293B' }]}>
                              {event.name}
                            </ThemedText>
                            <ThemedText numberOfLines={2} style={[styles.eventTimeBreakText, { fontSize: 9, lineHeight: 11, color: colorScheme === 'dark' ? '#94A3B8' : '#64748B' }]}>
                              {event.sub}
                            </ThemedText>
                          </View>

                          <View style={styles.alignRight}>
                            {!event.isBreak && (
                              <>
                                <ThemedText numberOfLines={1} style={[styles.roomText, { fontSize: 10, lineHeight: 12, color: colorScheme === 'dark' ? '#94A3B8' : '#475569' }]}>{event.room}</ThemedText>
                                <ThemedText numberOfLines={1} style={[styles.teacherText, { fontSize: 9, lineHeight: 11, color: colorScheme === 'dark' ? '#64748B' : '#94A3B8' }]}>{event.teacher}</ThemedText>
                              </>
                            )}
                          </View>
                        </View>

                        <View style={styles.cardFooterRow}>
                          {!event.isBreak && event.statusColor !== 'transparent' && (
                            <View style={[styles.attendanceStatusDot, { backgroundColor: event.statusColor, width: 8, height: 8, borderRadius: 4 }]} />
                          )}
                        </View>
                      </View>
                    ))}

                    {/* CURRENT TIME INDICATOR (WEEK MODE) */}
                    {weekDayTimeTop !== null && (
                      <View style={[styles.currentTimeIndicatorLine, { top: weekDayTimeTop, left: 0, right: 0 }]}>
                        <View style={styles.currentTimeDot} />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  calendarContainer: {
    flex: 1,
  },
  centeredLoading: {
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  timetableHeaderBorder: {
    borderBottomWidth: 1,
    paddingBottom: 12,
    marginBottom: 8,
  },
  blockTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  timetableSubHeaderCentered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateNavigationTight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonPadding: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dateTextUnified: {
    fontSize: 14,
    fontWeight: '600',
  },
  singleDayHeaderRow: {
    flexDirection: 'row',
    paddingLeft: 60,
    marginBottom: 6,
  },
  weekDaysHeaderRow: {
    flexDirection: 'row',
    paddingLeft: 60,
    marginBottom: 6,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabelCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  todayLabelCircle: {
  },
  todayDayHeaderText: {
  },
  weekDayHeaderText: {
    fontSize: 13,
    fontWeight: '700',
  },
  calendarBoardWrapper: {
    position: 'relative',
    height: 1400, // 14 half-hour slots * 100 height per 30 min
  },
  slotLineRow: {
    height: 100,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: 1,
  },
  timeAxisLabelContainer: {
    width: 55,
    marginTop: -8,
  },
  timeMarker: {
    fontSize: 11,
    fontWeight: '600',
  },
  horizontalLineExtended: {
    flex: 1,
  },
  eventsOverlayContainer: {
    ...StyleSheet.absoluteFill,
    paddingLeft: 60,
  },
  dayColumnContainer: {
    flex: 1,
    position: 'relative',
    marginRight: 8,
  },
  weekColumnsContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    paddingRight: 4,
  },
  weekColumnSegment: {
    flex: 1,
    position: 'relative',
  },
  calendarFloatingCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 6,
    padding: 6,
    justifyContent: 'space-between',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 2,
  },
  flexOneLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    minHeight: 10,
  },
  eventName: {
    fontSize: 13,
    fontWeight: '700',
  },
  eventTimeBreakText: {
    fontSize: 10,
    fontWeight: '500',
  },
  roomText: {
    fontSize: 10,
    fontWeight: '700',
  },
  teacherText: {
    fontSize: 9,
    fontWeight: '500',
  },
  attendanceStatusDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  currentTimeIndicatorLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#EF4444',
    zIndex: 10,
  },
  currentTimeDot: {
    position: 'absolute',
    left: -4,
    top: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
});