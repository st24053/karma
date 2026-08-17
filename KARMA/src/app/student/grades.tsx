import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  StyleSheet, 
  useColorScheme, 
  View, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  RefreshControl 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { ChevronDown } from 'lucide-react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { useAuth } from '../../_context';

// =========================================================
// TYPES & INTERFACES
// =========================================================

type YearFilter = '2026' | '2025' | '2024' | 'All years';
type LevelFilter = 'Level 3' | 'Level 2' | 'Level 1' | 'All levels';
type TypeFilter = 'AS only' | 'AS and Mocks only' | 'All tests';

type GradeStatus = 
  | 'Achieved with Excellence' 
  | 'Achieved with Merit' 
  | 'Achieved' 
  | 'Not Achieved' 
  | 'In moderation' 
  | 'Standard not assessed yet' 
  | 'Results entered, not published';

interface StandardRow {
  asNo: string;
  asName: string;
  credits: number;
  achievement: GradeStatus;
  status: 'Results entered and published' | 'In moderation' | 'Results entered, not published' | 'Standard not assessed yet';
  type: 'Internal' | 'External';
  assessment_type: 'Official AS' | 'Official US' | 'UEG' | 'EOTT';
  year: number;
  level: number;
  ueReading: boolean;
  ueWriting: boolean;
  ueNumeracy: boolean;
}

interface SubjectGroup {
  classId: string;
  subjectName: string;
  level: number;
  year: number; 
  isUE: boolean;
  totalCreditsString: string;
  endorsement: string;
  highestPossibleEndorsement: string;
  gpa: string;
  standards: StandardRow[];
}

interface AntiClockwiseProgressRingProps {
  percentage: number;
  strokeColor: string;
  size?: number;
  strokeWidth?: number;
}

interface JoinedGradeRecord {
  id: string;
  created_at: string;
  nsn: string;
  assessment_id: string;
  grade: string | null;
  status: string | null;
  date_obtained: string | null;
  assessment_type: string | null;
  classes_standards: {
    class_id: string;
    assessment_type: string | null;
    assessment_id: string;
    as: number;
    classes: {
      id: string;
      subject: string | null;
      level: number | null;
    } | null;
    standards: {
      as: number;
      level: number | null;
      nzqa_subject: string | null;
      standard_name: string | null;
      credits: number | null;
      is_external: boolean | null;
      is_ue_reading: boolean | null;
      is_ue_writing: boolean | null;
      is_ue_numeracy: boolean | null;
    } | null;
  } | null;
}

const mapDatabaseGradeToStatus = (grade: string | null, status: string | null): GradeStatus => {
  if (!grade || !status) return 'Standard not assessed yet';
  if (status.toLowerCase() !== 'results entered and published') {
    return status === 'In moderation' 
      ? 'In moderation' 
      : status === 'Results entered, not published' 
        ? 'Results entered, not published' 
        : 'Standard not assessed yet';
  }
  const cleanGrade = grade.trim().toUpperCase();
  switch (cleanGrade) {
    case 'E':
    case 'EXCELLENCE':
      return 'Achieved with Excellence';
    case 'M':
    case 'MERIT':
      return 'Achieved with Merit';
    case 'A':
    case 'ACHIEVED':
      return 'Achieved';
    case 'N':
    case 'NOT ACHIEVED':
      return 'Not Achieved';
    case 'PENDING':
      return 'Results entered, not published';
    default:
      return 'Standard not assessed yet';
  }
};

function AntiClockwiseProgressRing({ percentage, strokeColor, size = 64, strokeWidth = 6 }: AntiClockwiseProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
  const strokeDashoffset = circumference - (clampedPercentage / 100) * circumference;

  return (
    <Svg width={size} height={size}>
      <G rotation={180} origin={`${size / 2}, ${size / 2}`}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(148, 163, 184, 0.15)" strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
        />
      </G>
    </Svg>
  );
}

export default function HomeScreen() {
  const { email: userEmail } = useAuth();
  const systemScheme = useColorScheme();
  const colorScheme = (systemScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const currentColors = Colors[colorScheme];

  const [selectedYear, setSelectedYear] = useState<YearFilter>('2026');
  const [selectedLevel, setSelectedLevel] = useState<LevelFilter>('Level 3');
  const [selectedType, setSelectedType] = useState<TypeFilter>('All tests');
  const [activeDropdown, setActiveDropdown] = useState<'year' | 'level' | 'type' | null>(null);

  const [subjectGroups, setSubjectGroups] = useState<SubjectGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchUserGrades = useCallback(async () => {
    try {
      setErrorMsg(null);
      
      if (!userEmail) {
        throw new Error('No logged-in user email found in Context.');
      }

      const { data: studentInfo, error: studentError } = await supabase
        .from('student_personal_information')
        .select('nsn')
        .eq('email', userEmail)
        .maybeSingle();

      if (studentError || !studentInfo?.nsn) {
        throw new Error(`Could not find NSN record corresponding to "${userEmail}".`);
      }

      // Step 1: Fetch all class entries to establish clear subject + level definitions
      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('id, subject, level');

      if (classesError) {
        throw new Error(classesError.message);
      }

      // Step 2: Fetch student standard records with joins
      const { data: rawGradesData, error: gradesError } = await supabase
        .from('grades')
        .select(`
          id,
          created_at,
          nsn,
          assessment_id,
          grade,
          status,
          date_obtained,
          assessment_type,
          classes_standards (
            assessment_id,
            as,
            class_id,
            classes (
              id,
              subject,
              level
            ),
            standards (
              as,
              level,
              nzqa_subject,
              standard_name,
              credits,
              is_external,
              is_ue_reading,
              is_ue_writing,
              is_ue_numeracy
            )
          )
        `)
        .order('date_obtained', { ascending: false });
      
      if (gradesError) {
        throw new Error(gradesError.message);
      }

      const rawGrades = (rawGradesData as unknown) as JoinedGradeRecord[];
      
      // Build class map directly from classes table schema
      const classMap: Record<string, { subjectName: string; level: number; standards: StandardRow[] }> = {};

      (classesData || []).forEach(cls => {
        const classId = cls.id.toString();
        classMap[classId] = {
          subjectName: cls.subject || 'Uncategorized',
          level: Number(cls.level) || 3,
          standards: []
        };
      });

      // Step 3: Assign standards to their parent class using class_id
      rawGrades.forEach((item) => {
        const cs = item.classes_standards;
        const cls = cs?.classes;
        const std = cs?.standards;
        const targetClassId = cs?.class_id?.toString() || cls?.id?.toString() || 'unknown';

        let dbYear = 2026;
        if (item.date_obtained) {
          const parsedDate = new Date(item.date_obtained);
          if (!isNaN(parsedDate.getFullYear())) {
            dbYear = parsedDate.getFullYear();
          }
        }

        // Determine standard-level properties strictly from standard definition
        let standardLevel = 3;
        if (std?.level !== null && std?.level !== undefined && !isNaN(Number(std.level))) {
          standardLevel = Number(std.level);
        } else if (cs?.as) {
          const asStr = cs.as.toString();
          if (asStr.startsWith('91')) standardLevel = 3;
          else if (asStr.startsWith('90')) standardLevel = 2;
          else if (asStr.startsWith('88')) standardLevel = 1;
        }

        const standardType = std?.is_external ? 'External' : 'Internal';

        const row: StandardRow = {
          asNo: cs?.as ? cs.as.toString() : 'Standard not assessed yet',
          asName: std?.standard_name || 'Unnamed Standard',
          credits: Number(std?.credits) || 3,
          achievement: mapDatabaseGradeToStatus(item.grade, item.status),
          status: (item.status as StandardRow['status']) || 'Standard not assessed yet',
          type: standardType,
          assessment_type: (item.assessment_type as StandardRow['assessment_type']) || cs?.assessment_type || 'EOTT',
          year: dbYear,
          level: standardLevel,
          ueReading: Boolean(std?.is_ue_reading),
          ueWriting: Boolean(std?.is_ue_writing),
          ueNumeracy: Boolean(std?.is_ue_numeracy),
        };

        if (!classMap[targetClassId]) {
          classMap[targetClassId] = {
            subjectName: cls?.subject || 'Uncategorized',
            level: Number(cls?.level) || standardLevel,
            standards: []
          };
        }

        classMap[targetClassId].standards.push(row);
      });

      // Step 4: Map aggregated results back into SubjectGroup structure
      const transformedGroups: SubjectGroup[] = Object.keys(classMap)
        .filter(classId => classMap[classId].standards.length > 0)
        .map((classId) => {
          const classInfo = classMap[classId];
          const standards = classInfo.standards;
          const year = standards[0]?.year || 2026;
          const classLevel = classInfo.level;
          const baseSubjectName = classInfo.subjectName;

          let internalNotAchievedCredits = 0;
          let externalNotAchievedCredits = 0;
          let achievedCredits = 0;
          let internalAchievedCredits = 0;
          let externalAchievedCredits = 0;
          let internalMeritCredits = 0;
          let externalMeritCredits = 0;
          let internalExcellenceCredits = 0;
          let externalExcellenceCredits = 0;
          let Endorsement = 'None';
          let highestPossibleEndorsement = 'None';
          let totalEnrolledInternalCredits = 0;
          let totalEnrolledExternalCredits = 0;
          let totalEnrolledCredits = 0;
          let totalPoints = 0;

          standards.forEach((std) => {
            if (std.assessment_type === "Official AS" || std.assessment_type === "Official US") {
              totalEnrolledCredits += std.credits;
              if (std.type === 'Internal') {
                totalEnrolledInternalCredits += std.credits;
              } else if (std.type === 'External') {
                totalEnrolledExternalCredits += std.credits;
              }
            }
            
            if (
              std.achievement !== 'Standard not assessed yet' && 
              std.achievement !== 'Results entered, not published' && 
              std.achievement !== 'In moderation' && 
              std.achievement !== 'Not Achieved' && 
              (std.assessment_type === 'Official AS' || std.assessment_type === 'Official US')
            ) {
              achievedCredits += std.credits;
              let multiplier = 2;

              if (std.type === 'Internal' && std.achievement === 'Achieved') {
                internalAchievedCredits += std.credits;
              } else if (std.type === 'External' && std.achievement === 'Achieved') {
                externalAchievedCredits += std.credits;
              }

              if (std.achievement === 'Achieved with Merit') multiplier = 3;

              if (std.type === 'Internal' && std.achievement === 'Achieved with Merit') {
                internalMeritCredits += std.credits;
              } else if (std.type === 'External' && std.achievement === 'Achieved with Merit') {
                externalMeritCredits += std.credits;
              }

              if (std.achievement === 'Achieved with Excellence') multiplier = 4;

              if (std.type === 'Internal' && std.achievement === 'Achieved with Excellence') {
                internalExcellenceCredits += std.credits;
              } else if (std.type === 'External' && std.achievement === 'Achieved with Excellence') {
                externalExcellenceCredits += std.credits;
              }

              totalPoints += std.credits * multiplier;
            } else if (std.achievement === 'Not Achieved' && (std.assessment_type === 'Official AS' || std.assessment_type === 'Official US')) {
              if (std.type === 'Internal') {
                internalNotAchievedCredits += std.credits;
              } else if (std.type === 'External') {
                externalNotAchievedCredits += std.credits;
              }
            }
          });

          if (internalExcellenceCredits >= 3 && externalExcellenceCredits >= 3 && (internalExcellenceCredits + externalExcellenceCredits) >= 14) {
            Endorsement = 'Excellence';
          } else if (
            (internalMeritCredits + internalExcellenceCredits) >= 3 && 
            (externalMeritCredits + externalExcellenceCredits) >= 3 && 
            (internalMeritCredits + externalMeritCredits + internalExcellenceCredits + externalExcellenceCredits) >= 14
          ) {
            Endorsement = 'Merit';
          } else if (
            (internalAchievedCredits + internalMeritCredits + internalExcellenceCredits) >= 3 && 
            (externalAchievedCredits + externalMeritCredits + externalExcellenceCredits) >= 3 && 
            (internalAchievedCredits + externalAchievedCredits + internalMeritCredits + externalMeritCredits + internalExcellenceCredits + externalExcellenceCredits) >= 14
          ) {
            Endorsement = 'Achieved';
          }

          const possibleAdditionalInternalExcellenceCredits = totalEnrolledInternalCredits - (internalExcellenceCredits + internalMeritCredits + internalAchievedCredits + internalNotAchievedCredits);
          const possibleAdditionalExternalExcellenceCredits = totalEnrolledExternalCredits - (externalExcellenceCredits + externalMeritCredits + externalAchievedCredits + externalNotAchievedCredits);

          if (
            internalExcellenceCredits + possibleAdditionalInternalExcellenceCredits >= 3 && 
            externalExcellenceCredits + possibleAdditionalExternalExcellenceCredits >= 3 && 
            (internalExcellenceCredits + externalExcellenceCredits + possibleAdditionalInternalExcellenceCredits + possibleAdditionalExternalExcellenceCredits) >= 14
          ) {
            highestPossibleEndorsement = 'Excellence';
          } else if (
            (internalMeritCredits + internalExcellenceCredits + possibleAdditionalInternalExcellenceCredits) >= 3 && 
            (externalMeritCredits + externalExcellenceCredits + possibleAdditionalExternalExcellenceCredits) >= 3 && 
            (internalMeritCredits + externalMeritCredits + internalExcellenceCredits + externalExcellenceCredits + possibleAdditionalInternalExcellenceCredits + possibleAdditionalExternalExcellenceCredits) >= 14
          ) {
            highestPossibleEndorsement = 'Merit';
          } else if (
            (internalAchievedCredits + internalMeritCredits + internalExcellenceCredits + possibleAdditionalInternalExcellenceCredits) >= 3 && 
            (externalAchievedCredits + externalMeritCredits + externalExcellenceCredits + possibleAdditionalExternalExcellenceCredits) >= 3 && 
            (internalAchievedCredits + externalAchievedCredits + internalMeritCredits + externalMeritCredits + internalExcellenceCredits + externalExcellenceCredits + possibleAdditionalInternalExcellenceCredits + possibleAdditionalExternalExcellenceCredits) >= 14
          ) {
            highestPossibleEndorsement = 'Achieved';
          }

          const gpaVal = totalEnrolledCredits > 0 ? (totalPoints / (achievedCredits || 1)).toFixed(2) : '0.00';

          return {
            classId,
            subjectName: baseSubjectName,
            level: classLevel,
            isUE: true,
            endorsement: Endorsement,
            highestPossibleEndorsement: highestPossibleEndorsement,
            totalCreditsString: `${achievedCredits}/${totalEnrolledCredits}`,
            gpa: gpaVal,
            year,
            standards,
          };
        });

      setSubjectGroups(transformedGroups);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while loading grades.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userEmail]);

  useEffect(() => {
    if (userEmail) {
      fetchUserGrades();
    }
  }, [userEmail, fetchUserGrades]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchUserGrades();
  }, [fetchUserGrades]);

  const [endorsementType, setEndorsementType] = useState<'Excellence' | 'Merit' | 'Achieved'>('Excellence');
  const [endorsementLevel, setEndorsementLevel] = useState<1 | 2 | 3>(3);

  const top3Level3Subjects = useMemo(() => {
    const subjectMap: Record<string, number> = {};

    (subjectGroups || []).forEach((group) => {
      let l3AchievedCreditsForGroup = 0;

      group.standards.forEach((std) => {
        const isValidAchievement =
          std.achievement !== 'Not Achieved' &&
          std.achievement !== 'Standard not assessed yet' &&
          std.achievement !== 'Results entered, not published' &&
          std.achievement !== 'In moderation';

        if (std.level === 3 && isValidAchievement) {
          l3AchievedCreditsForGroup += std.credits || 0;
        }
      });

      if (l3AchievedCreditsForGroup > 0) {
        const fullSubjectName = `${group.subjectName} ${group.level}`;
        subjectMap[fullSubjectName] = (subjectMap[fullSubjectName] || 0) + l3AchievedCreditsForGroup;
      }
    });

    const sorted = Object.entries(subjectMap)
      .map(([subject, credits]) => ({ subject, credits }))
      .sort((a, b) => b.credits - a.credits)
      .slice(0, 3);

    while (sorted.length < 3) {
      sorted.push({ subject: `Subject ${sorted.length + 1}`, credits: 0 });
    }

    return sorted;
  }, [subjectGroups]);

  const topSubject1 = top3Level3Subjects[0];
  const topSubject2 = top3Level3Subjects[1];
  const topSubject3 = top3Level3Subjects[2];

  const globalCumulativeMetrics = useMemo(() => {
    let level1Achieved = 0;
    let level1Excellence = 0;
    let level1Merit = 0;

    let level2Achieved = 0;
    let level2Excellence = 0;
    let level2Merit = 0;

    let Level3Achieved = 0;
    let Level3Excellence = 0;
    let level3Merit = 0;

    let globalExcellence = 0;
    let globalMerit = 0;
    let globalAchieved = 0;

    let ueReadingCredits = 0;
    let ueWritingCredits = 0;
    let ueNumeracyCredits = 0;

    let level3SubjectsWith14Credits = 0;

    const subjectLevel3CreditsMap: Record<string, { grade: string; credits: number; assessment_type: string }[]> = {};

    subjectGroups.forEach(subject => {
      let subjectL3Credits = 0;
      const fullSubjectName = `${subject.subjectName} ${subject.level}`;

      subject.standards.forEach(std => {
        const isExcellence = std.achievement === 'Achieved with Excellence' && (std.assessment_type === 'Official AS' || std.assessment_type === 'Official US');
        const isMerit = std.achievement === 'Achieved with Merit' && (std.assessment_type === 'Official AS' || std.assessment_type === 'Official US');
        const isAchieved = std.achievement === 'Achieved' && (std.assessment_type === 'Official AS' || std.assessment_type === 'Official US');
        const isPassed = (isExcellence || isMerit || isAchieved) && (std.assessment_type === 'Official AS' || std.assessment_type === 'Official US');

        if (isPassed && (std.assessment_type === 'Official AS' || std.assessment_type === 'Official US')) {
          if (std.ueReading) ueReadingCredits += std.credits;
          if (std.ueWriting) ueWritingCredits += std.credits;
          if (std.ueNumeracy) ueNumeracyCredits += std.credits;
        }

        if (isExcellence && (std.assessment_type === 'Official AS' || std.assessment_type === 'Official US')) globalExcellence += std.credits;
        else if (isMerit && (std.assessment_type === 'Official AS' || std.assessment_type === 'Official US')) globalMerit += std.credits;
        else if (isAchieved && (std.assessment_type === 'Official AS' || std.assessment_type === 'Official US')) globalAchieved += std.credits;

        if (std.level === 1 && isPassed && (std.assessment_type === 'Official AS' || std.assessment_type === 'Official US')) {
          level1Achieved += std.credits;
          if (isExcellence) level1Excellence += std.credits;
          if (isMerit || isExcellence) level1Merit += std.credits;
        }

        if (std.level === 2 && isPassed && (std.assessment_type === 'Official AS' || std.assessment_type === 'Official US')) {
          level2Achieved += std.credits;
          if (isExcellence) level2Excellence += std.credits;
          if (isMerit || isExcellence) level2Merit += std.credits;
        }

        if (std.level === 3 && (std.assessment_type === 'Official AS' || std.assessment_type === 'Official US')) {
          if (isPassed) {
            Level3Achieved += std.credits;
            subjectL3Credits += std.credits;

            if (!subjectLevel3CreditsMap[fullSubjectName]) {
              subjectLevel3CreditsMap[fullSubjectName] = [];
            }
            subjectLevel3CreditsMap[fullSubjectName].push({
              grade: std.achievement,
              credits: std.credits,
              assessment_type: std.assessment_type,
            });
          }

          if (isExcellence) Level3Excellence += std.credits;
          if (isMerit || isExcellence) level3Merit += std.credits;
        }
      });

      if (subjectL3Credits >= 14) {
        level3SubjectsWith14Credits += 1;
      }
    });

    const totalGlobalAchievedPool = globalExcellence + globalMerit + globalAchieved;

    const rankScorePool: { points: number; credits: number; assessment_type: string }[] = [];

    Object.values(subjectLevel3CreditsMap).forEach(subjectList => {
      const officialSubjectList = subjectList.filter(
        item => item.assessment_type === 'Official AS' || item.assessment_type === 'Official US'
      );

      officialSubjectList.sort((a, b) => {
        const order: Record<string, number> = {
          'Achieved with Excellence': 3,
          'Achieved with Merit': 2,
          'Achieved': 1,
        };
        return (order[b.grade] || 0) - (order[a.grade] || 0);
      });

      let subjectCountedCredits = 0;
      officialSubjectList.forEach(item => {
        if (subjectCountedCredits >= 24) return;
        const takeCredits = Math.min(item.credits, 24 - subjectCountedCredits);
        let pts = 2;
        if (item.grade === 'Achieved with Excellence') pts = 4;
        if (item.grade === 'Achieved with Merit') pts = 3;

        rankScorePool.push({ points: pts, credits: takeCredits, assessment_type: item.assessment_type });
        subjectCountedCredits += takeCredits;
      });
    });

    rankScorePool.sort((a, b) => b.points - a.points);

    let rankScore = 0;
    let accumulatedRankCredits = 0;

    for (const item of rankScorePool) {
      if (accumulatedRankCredits >= 80) break;
      const creditsToTake = Math.min(item.credits, 80 - accumulatedRankCredits);
      rankScore += creditsToTake * item.points;
      accumulatedRankCredits += creditsToTake;
    }

    const isUeReadingAchieved = ueReadingCredits >= 5;
    const isUeWritingAchieved = ueWritingCredits >= 5;
    const isUeLiteracyAchieved = isUeReadingAchieved && isUeWritingAchieved && (ueReadingCredits + ueWritingCredits >= 10);
    const isUeNumeracyAchieved = ueNumeracyCredits >= 10;
    const isNceaLevel3Achieved = Level3Achieved >= 60;
    const hasUeSubjectRequirement = level3SubjectsWith14Credits >= 3;

    const isUniversityEntranceAchieved =
      isNceaLevel3Achieved &&
      hasUeSubjectRequirement &&
      isUeLiteracyAchieved &&
      isUeNumeracyAchieved;

    return {
      level1Achieved,
      level1Excellence,
      level1Merit,
      level2Achieved,
      level2Excellence,
      level2Merit,
      Level3Achieved,
      Level3Excellence,
      level3Merit,
      ueReadingCredits,
      ueWritingCredits,
      ueNumeracyCredits,
      isUeReadingAchieved,
      isUeWritingAchieved,
      isUeLiteracyAchieved,
      isUeNumeracyAchieved,
      isNceaLevel3Achieved,
      hasUeSubjectRequirement,
      level3SubjectsWith14Credits,
      isUniversityEntranceAchieved,
      ueSubject1: topSubject1,
      ueSubject2: topSubject2,
      ueSubject3: topSubject3,
      totalGlobalAchievedPool,
      rankScore: Math.min(rankScore, 320),
    };
  }, [subjectGroups, topSubject1, topSubject2, topSubject3]);

  const selectedEndorsementCredits = useMemo(() => {
    const {
      level1Achieved,
      level1Merit,
      level1Excellence,
      level2Achieved,
      level2Merit,
      level2Excellence,
      Level3Achieved,
      level3Merit,
      Level3Excellence,
    } = globalCumulativeMetrics;

    const pureL3Merit = Math.max(0, level3Merit - Level3Excellence);
    const pureL2Merit = Math.max(0, level2Merit - level2Excellence);
    const pureL1Merit = Math.max(0, level1Merit - level1Excellence);

    if (endorsementLevel === 3) {
      if (endorsementType === 'Achieved') return Level3Achieved;
      if (endorsementType === 'Excellence') return Level3Excellence;
      return level3Merit;
    }

    if (endorsementLevel === 2) {
      if (endorsementType === 'Achieved') {
        return level2Achieved + Level3Achieved;
      }
      if (endorsementType === 'Excellence') {
        return level2Excellence + Level3Excellence;
      }
      return pureL2Merit + pureL3Merit + level2Excellence + Level3Excellence;
    }

    if (endorsementLevel === 1) {
      if (endorsementType === 'Achieved') {
        return level1Achieved + level2Achieved + Level3Achieved;
      }
      if (endorsementType === 'Excellence') {
        return level1Excellence + level2Excellence + Level3Excellence;
      }
      return (
        pureL1Merit +
        pureL2Merit +
        pureL3Merit +
        level1Excellence +
        level2Excellence +
        Level3Excellence
      );
    }

    return 0;
  }, [endorsementLevel, endorsementType, globalCumulativeMetrics]);

  const filteredDatabase = useMemo(() => {
    return subjectGroups.map(subject => {
      const validStandards = subject.standards.filter(std => {
        const matchYear = selectedYear === 'All years' || std.year.toString() === selectedYear;
        const matchLevel = selectedLevel === 'All levels' || `Level ${std.level}` === selectedLevel;
        let matchType = true;
        if (selectedType === 'AS only') {
          matchType = std.assessment_type === 'Official AS' || std.assessment_type === 'Official US';
        } else if (selectedType === 'AS and Mocks only') {
          matchType =
            std.assessment_type === 'Official AS' || std.assessment_type === 'Official US' || std.assessment_type === 'UEG';
        } else if (selectedType === 'All tests') {
          matchType = true;
        }
        
        return matchYear && matchLevel && matchType;
      });

      if (validStandards.length === 0) return null;

      return { ...subject, standards: validStandards };
    }).filter((s): s is SubjectGroup => s !== null);
  }, [subjectGroups, selectedYear, selectedLevel, selectedType]);

  const filteredGpa = useMemo(() => {
    let totalGradedCredits = 0;
    let totalGpaPoints = 0;

    filteredDatabase.forEach(sub => {
      sub.standards.forEach(std => {
        if (std.achievement === 'Achieved with Excellence') {
          totalGpaPoints += std.credits * 4;
          totalGradedCredits += std.credits;
        } else if (std.achievement === 'Achieved with Merit') {
          totalGpaPoints += std.credits * 3;
          totalGradedCredits += std.credits;
        } else if (std.achievement === 'Achieved') {
          totalGpaPoints += std.credits * 2;
          totalGradedCredits += std.credits;
        } else if (std.achievement === 'Not Achieved') {
          totalGpaPoints += std.credits * 1;
          totalGradedCredits += std.credits;
        }
      });
    });

    return totalGradedCredits > 0 ? (totalGpaPoints / totalGradedCredits).toFixed(2) : '0.00';
  }, [filteredDatabase]);

  const currentFilteredBreakdownMetrics = useMemo(() => {
    let excellence = 0;
    let merit = 0;
    let achieved = 0;
    let notAchieved = 0;
    let resultsPendingNA = 0;

    filteredDatabase.forEach(sub => {
      sub.standards.forEach(std => {
        if (std.achievement === 'Achieved with Excellence') excellence += std.credits;
        else if (std.achievement === 'Achieved with Merit') merit += std.credits;
        else if (std.achievement === 'Achieved') achieved += std.credits;
        else if (std.achievement === 'Not Achieved') notAchieved += std.credits;
        else if (std.achievement === 'Standard not assessed yet' || std.achievement === 'Results entered, not published' || std.achievement === 'In moderation') resultsPendingNA += std.credits;
      });
    });

    const totalWithOutcomes = excellence + merit + achieved + notAchieved;
    return { excellence, merit, achieved, notAchieved, resultsPendingNA, totalWithOutcomes };
  }, [filteredDatabase]);

  const pieChartData = useMemo(() => {
    return [
      { label: 'Excellence', value: currentFilteredBreakdownMetrics.excellence, color: GRADE_COLORS.excellence },
      { label: 'Merit', value: currentFilteredBreakdownMetrics.merit, color: GRADE_COLORS.merit },
      { label: 'Achieved', value: currentFilteredBreakdownMetrics.achieved, color: GRADE_COLORS.achieved },
      { label: 'Not Achieved', value: currentFilteredBreakdownMetrics.notAchieved, color: GRADE_COLORS.notAchieved },
    ].filter(item => item.label !== 'Not Achieved' || item.value > 0);
  }, [currentFilteredBreakdownMetrics]);

  const pieChartComponent = useMemo(() => {
    const total = currentFilteredBreakdownMetrics.totalWithOutcomes;
    const size = 180;
    const center = size / 2;
    const r = size / 2 - 12;

    if (total === 0) {
      return (
        <Svg width={size} height={size}>
          <Circle cx={center} cy={center} r={r} fill="rgba(148, 163, 184, 0.15)" />
        </Svg>
      );
    }

    let accumulatedAngle = 0;

    return (
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${center}, ${center}`}>
          {pieChartData.map((slice, index) => {
            if (slice.value === 0) return null;
            const percentage = (slice.value / total) * 360;
            
            if (percentage === 360) {
              return <Circle key={index} cx={center} cy={center} r={r} fill={slice.color} />;
            }

            const radStart = (accumulatedAngle * Math.PI) / 180;
            accumulatedAngle += percentage;
            const radEnd = (accumulatedAngle * Math.PI) / 180;

            const x1 = center + r * Math.cos(radStart);
            const y1 = center + r * Math.sin(radStart);
            const x2 = center + r * Math.cos(radEnd);
            const y2 = center + r * Math.sin(radEnd);

            const largeArcFlag = percentage > 180 ? 1 : 0;
            const pathData = `M ${center} ${center} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

            return <Path key={index} d={pathData} fill={slice.color} />;
          })}
        </G>
      </Svg>
    );
  }, [currentFilteredBreakdownMetrics.totalWithOutcomes, pieChartData]);

  if (loading) {
    return (
      <ThemedView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <ThemedText style={{ marginTop: Spacing.four, fontSize: 18, color: currentColors.textSecondary }}>Loading Grades...</ThemedText>
      </ThemedView>
    );
  }

  const rankScorePercentage = Math.min(Math.round((globalCumulativeMetrics.rankScore / 320) * 100), 100);
  const gpaValueNum = Number(filteredGpa);
  const gpaPercentage = Math.min(Math.round((gpaValueNum / 4.0) * 100), 100);
  const targetCredits = currentFilteredBreakdownMetrics.totalWithOutcomes + currentFilteredBreakdownMetrics.resultsPendingNA;
  const totalCreditsPercentage = Math.min(Math.round(((currentFilteredBreakdownMetrics.totalWithOutcomes - currentFilteredBreakdownMetrics.notAchieved) / (targetCredits || 1)) * 100), 100);
  
  const ueReadingPercentage = Math.min(Math.round((globalCumulativeMetrics.ueReadingCredits / 5) * 100), 100);
  const ueWritingPercentage = Math.min(Math.round((globalCumulativeMetrics.ueWritingCredits / 5) * 100), 100);
  const ueNumeracyPercentage = Math.min(Math.round((globalCumulativeMetrics.ueNumeracyCredits / 10) * 100), 100);

  const getEndorsementColor = (type: 'Excellence' | 'Merit' | 'Achieved') => {
    switch (type) {
      case 'Excellence': return GRADE_COLORS.excellence;
      case 'Merit': return GRADE_COLORS.merit;
      case 'Achieved': return GRADE_COLORS.achieved;
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView 
          contentContainerStyle={styles.scrollContainer} 
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <ThemedText style={[styles.pageTitle, { color: currentColors.text }]}>Academic Qualifications Dashboard</ThemedText>

          {errorMsg && (
            <View style={styles.errorContainer}>
              <ThemedText style={styles.errorText}>{errorMsg}</ThemedText>
            </View>
          )}

          {/* Global Progress Cards Grid */}
          <View style={styles.statsMetricsWrapper}>

            {/* Card 1 (Full Width): UE Requirements - All Level 3 Subjects */}
            <View style={[styles.metricItemCardFullWidth, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F8FAFC' }]}>
              <View style={styles.cardHeaderRow}>
                <ThemedText numberOfLines={1} style={styles.cardCornerFooterTag}>
                  UE Requirement (14 credits per L3 UE subject)
                </ThemedText>
              </View>

              <View style={styles.ueSubjectsGridRow}>
                {Array.from({ length: 5 }).map((_, index) => {
                  const subjectGroup = subjectGroups?.[index];
                  let l3Credits = 0;

                  if (subjectGroup) {
                    subjectGroup.standards.forEach((std) => {
                      const isValidAchievement =
                        std.achievement !== 'Not Achieved' &&
                        std.achievement !== 'Standard not assessed yet' &&
                        std.achievement !== 'Results entered, not published' &&
                        std.achievement !== 'In moderation';
                      
                      if (std.level === 3 && isValidAchievement) {
                        l3Credits += std.credits || 0;
                      }
                    });
                  }

                  const subjectName = subjectGroup ? `${subjectGroup.subjectName} ${subjectGroup.level}` : `Subject ${index + 1}`;
                  const ringPercentage = Math.min(100, Math.round((l3Credits / 14) * 100));

                  return (
                    <View key={`ue-subj-${index}`} style={styles.ueSubjectRingItem}>
                      <AntiClockwiseProgressRing percentage={ringPercentage} strokeColor="#EA580C" size={58} strokeWidth={5} />
                      <ThemedText style={[styles.ueSubjectCreditsText, { color: '#EA580C' }]}>
                        {l3Credits}
                        <ThemedText style={{ fontSize: 13, fontWeight: '500' }}>/14</ThemedText>
                      </ThemedText>
                      <ThemedText numberOfLines={1} style={[styles.ueSubjectNameText, { color: currentColors.text }]}>
                        {subjectName}
                      </ThemedText>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Card 2 (Full Width): Combined UE Literacy & UE Numeracy */}
            <View style={[styles.metricItemCardFullWidth, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F8FAFC' }]}>
              <View style={styles.cardHeaderRow}>
                <ThemedText numberOfLines={1} style={styles.cardCornerFooterTag}>
                  UE Literacy & Numeracy Requirements
                </ThemedText>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginTop: 6 }}>
                <View style={{ alignItems: 'center' }}>
                  <AntiClockwiseProgressRing percentage={ueReadingPercentage} strokeColor="#EC4899" size={58} strokeWidth={5} />
                  <ThemedText style={{ fontSize: 16, fontWeight: '800', color: '#EC4899', marginTop: 4 }}>
                    {globalCumulativeMetrics.ueReadingCredits}<ThemedText style={{ fontSize: 13, fontWeight: '500' }}>/5</ThemedText>
                  </ThemedText>
                  <ThemedText style={[styles.descriptionMetaText, { color: currentColors.text }]}>UE Reading</ThemedText>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <AntiClockwiseProgressRing percentage={ueWritingPercentage} strokeColor="#D946EF" size={58} strokeWidth={5} />
                  <ThemedText style={{ fontSize: 16, fontWeight: '800', color: '#D946EF', marginTop: 4 }}>
                    {globalCumulativeMetrics.ueWritingCredits}<ThemedText style={{ fontSize: 13, fontWeight: '500' }}>/5</ThemedText>
                  </ThemedText>
                  <ThemedText style={[styles.descriptionMetaText, { color: currentColors.text }]}>UE Writing</ThemedText>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <AntiClockwiseProgressRing percentage={ueNumeracyPercentage} strokeColor="#14B8A6" size={58} strokeWidth={5} />
                  <ThemedText style={{ fontSize: 16, fontWeight: '800', color: '#14B8A6', marginTop: 4 }}>
                    {globalCumulativeMetrics.ueNumeracyCredits}<ThemedText style={{ fontSize: 13, fontWeight: '500' }}>/10</ThemedText>
                  </ThemedText>
                  <ThemedText style={[styles.descriptionMetaText, { color: currentColors.text }]}>UE Numeracy</ThemedText>
                </View>
              </View>
            </View>

            {/* Card 3 (Full Width): Endorsement & Achievement Progress */}
            <View style={[styles.metricItemCardFullWidth, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F8FAFC' }]}>
              <View style={styles.floatingControlsContainer}>
                <View style={styles.selectorPillGroup}>
                  {(['Excellence', 'Merit', 'Achieved'] as const).map((type) => {
                    const pillColor = getEndorsementColor(type);
                    return (
                      <TouchableOpacity
                        key={`end-type-${type}`}
                        onPress={() => setEndorsementType(type)}
                        style={[
                          styles.selectorPill,
                          endorsementType === type && { backgroundColor: pillColor },
                        ]}
                      >
                        <ThemedText
                          style={[
                            styles.selectorPillText,
                            endorsementType === type && { color: '#FFFFFF', fontWeight: '700' },
                          ]}
                        >
                          {type[0]}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.selectorPillGroup}>
                  {([1, 2, 3] as const).map((lvl) => (
                    <TouchableOpacity
                      key={`end-lvl-${lvl}`}
                      onPress={() => setEndorsementLevel(lvl)}
                      style={[
                        styles.selectorPill,
                        endorsementLevel === lvl && {
                          backgroundColor: getEndorsementColor(endorsementType),
                        },
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.selectorPillText,
                          endorsementLevel === lvl && { color: '#FFFFFF', fontWeight: '700' },
                        ]}
                      >
                        L{lvl}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <ThemedText numberOfLines={1} style={styles.cardCornerFooterTag}>
                {endorsementType === 'Achieved'
                  ? `NCEA L${endorsementLevel}`
                  : `NCEA L${endorsementLevel} ${endorsementType} Endorsement`}
              </ThemedText>

              <View style={styles.centeredMetricRowContainer}>
                <AntiClockwiseProgressRing
                  percentage={Math.min(
                    100,
                    Math.round((selectedEndorsementCredits / (endorsementType === 'Achieved' ? 60 : 50)) * 100)
                  )}
                  strokeColor={getEndorsementColor(endorsementType)}
                  size={64}
                  strokeWidth={6}
                />
                <View style={styles.metricTextRightBlock}>
                  <ThemedText
                    style={[
                      styles.percentageHeadline,
                      { color: getEndorsementColor(endorsementType) },
                    ]}
                  >
                    {selectedEndorsementCredits}
                    <ThemedText style={styles.targetSubText}>
                      /{endorsementType === 'Achieved' ? 60 : 50}
                    </ThemedText>
                  </ThemedText>
                  <ThemedText numberOfLines={2} style={[styles.descriptionMetaText, { color: currentColors.text }]}>
                    Level {endorsementLevel === 3 ? '3' : endorsementLevel === 2 ? '2+' : '1+'} {endorsementType === 'Excellence' ? 'Excellence' : `${endorsementType}+`} credits
                  </ThemedText>
                </View>
              </View>
            </View>

            {/* Card 4: Rank Score */}
            <View style={[styles.metricItemCard, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F8FAFC' }]}>
              <ThemedText numberOfLines={1} style={styles.cardCornerFooterTag}>Rank Score</ThemedText>
              <View style={styles.centeredMetricRowContainer}>
                <AntiClockwiseProgressRing percentage={rankScorePercentage} strokeColor="#8B5CF6" size={64} strokeWidth={6} />
                <View style={styles.metricTextRightBlock}>
                  <ThemedText style={[styles.percentageHeadline, { color: '#8B5CF6' }]}>
                    {globalCumulativeMetrics.rankScore}
                    <ThemedText style={styles.targetSubText}>/320</ThemedText>
                  </ThemedText>
                  <ThemedText numberOfLines={2} style={[styles.descriptionMetaText, { color: currentColors.text }]}>
                    max rank score
                  </ThemedText>
                </View>
              </View>
            </View>

            {/* Card 5: Filter-Dependent GPA */}
            <View style={[styles.metricItemCard, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F8FAFC' }]}>
              <ThemedText numberOfLines={1} style={styles.cardCornerFooterTag}>GPA (Filtered)</ThemedText>
              <View style={styles.centeredMetricRowContainer}>
                <AntiClockwiseProgressRing percentage={gpaPercentage} strokeColor="#06B6D4" size={64} strokeWidth={6} />
                <View style={styles.metricTextRightBlock}>
                  <ThemedText style={[styles.percentageHeadline, { color: '#06B6D4' }]}>
                    {filteredGpa}
                    <ThemedText style={styles.targetSubText}>/4.00</ThemedText>
                  </ThemedText>
                  <ThemedText numberOfLines={2} style={[styles.descriptionMetaText, { color: currentColors.text }]}>
                    grade average
                  </ThemedText>
                </View>
              </View>
            </View>

            {/* Card 6: Total Credits Achieved */}
            <View style={[styles.metricItemCard, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F8FAFC' }]}>
              <ThemedText numberOfLines={1} style={styles.cardCornerFooterTag}>Total Enrolled Credits (Filtered)</ThemedText>
              <View style={styles.centeredMetricRowContainer}>
                <AntiClockwiseProgressRing percentage={totalCreditsPercentage} strokeColor="#10B981" size={64} strokeWidth={6} />
                <View style={styles.metricTextRightBlock}>
                  <ThemedText style={[styles.percentageHeadline, { color: '#10B981' }]}>
                    {currentFilteredBreakdownMetrics.totalWithOutcomes - currentFilteredBreakdownMetrics.notAchieved}
                    <ThemedText style={styles.targetSubText}>/{targetCredits}</ThemedText>
                  </ThemedText>
                  <ThemedText numberOfLines={2} style={[styles.descriptionMetaText, { color: currentColors.text }]}>
                    enrolled credits
                  </ThemedText>
                </View>
              </View>
            </View>

          </View>
          
          {/* Filter Toolbar */}
          <View style={styles.filteringContextToolbar}>
            <TouchableOpacity 
              style={[styles.dropdownControlCell, { backgroundColor: currentColors.background, borderColor: colorScheme === 'dark' ? '#334155' : '#CBD5E1' }]}
              onPress={() => setActiveDropdown(activeDropdown === 'year' ? null : 'year')}
            >
              <ThemedText style={[styles.filterValueText, { color: currentColors.text }]}>{selectedYear}</ThemedText>
              <ChevronDown size={20} color={currentColors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.dropdownControlCell, { backgroundColor: currentColors.background, borderColor: colorScheme === 'dark' ? '#334155' : '#CBD5E1' }]}
              onPress={() => setActiveDropdown(activeDropdown === 'level' ? null : 'level')}
            >
              <ThemedText style={[styles.filterValueText, { color: currentColors.text }]}>{selectedLevel}</ThemedText>
              <ChevronDown size={20} color={currentColors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.dropdownControlCell, { backgroundColor: currentColors.background, borderColor: colorScheme === 'dark' ? '#334155' : '#CBD5E1' }]}
              onPress={() => setActiveDropdown(activeDropdown === 'type' ? null : 'type')}
            >
              <ThemedText numberOfLines={1} style={[styles.filterValueText, { color: currentColors.text }]}>{selectedType}</ThemedText>
              <ChevronDown size={20} color={currentColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Dropdown Options */}
          {activeDropdown === 'year' && (
            <View style={[styles.dropdownDrawer, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F1F5F9' }]}>
              {(['2026', '2025', '2024', 'All years'] as YearFilter[]).map((y) => (
                <TouchableOpacity key={y} style={styles.drawerOption} onPress={() => { setSelectedYear(y); setActiveDropdown(null); }}>
                  <ThemedText style={{ fontSize: 16, fontWeight: selectedYear === y ? '700' : '400', color: currentColors.text }}>{y}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {activeDropdown === 'level' && (
            <View style={[styles.dropdownDrawer, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F1F5F9' }]}>
              {(['Level 3', 'Level 2', 'Level 1', 'All levels'] as LevelFilter[]).map((l) => (
                <TouchableOpacity key={l} style={styles.drawerOption} onPress={() => { setSelectedLevel(l); setActiveDropdown(null); }}>
                  <ThemedText style={{ fontSize: 16, fontWeight: selectedLevel === l ? '700' : '400', color: currentColors.text }}>{l}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {activeDropdown === 'type' && (
            <View style={[styles.dropdownDrawer, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F1F5F9' }]}>
              {(['AS only', 'AS and Mocks only', 'All tests'] as TypeFilter[]).map((t) => (
                <TouchableOpacity key={t} style={styles.drawerOption} onPress={() => { setSelectedType(t); setActiveDropdown(null); }}>
                  <ThemedText style={{ fontSize: 16, fontWeight: selectedType === t ? '700' : '400', color: currentColors.text }}>{t}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Data Tables */}
          <View style={styles.tablesContainerWrapper}>
            {filteredDatabase.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <ThemedText style={{ fontSize: 16, color: currentColors.textSecondary, fontStyle: 'italic', textAlign: 'center' }}>
                  No subject listings matched your current filter selection.
                </ThemedText>
              </View>
            ) : (
              filteredDatabase.map((subject, sIdx) => {
                const fullSubjectName = `${subject?.subjectName} ${subject?.level}`;
                return (
                  <View key={`${subject.classId}-${subject.subjectName}-${subject.level}-${sIdx}`} style={styles.subjectBlockSegment}>
                    <View style={[styles.subjectSectionHeader, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F1F5F9', flexDirection: 'column', gap: Spacing.two }]}>
                      <ThemedText style={[styles.subjectTitleText, { color: currentColors.text }]}>{fullSubjectName}</ThemedText>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three }}>
                        <ThemedText style={styles.subjectHeaderMetaBadge}>UE: ✅</ThemedText>
                        <ThemedText style={styles.subjectHeaderMetaBadge}>Credits: {subject.totalCreditsString}</ThemedText>
                        <ThemedText style={styles.subjectHeaderMetaBadge}>GPA: {subject.gpa}</ThemedText>
                        <ThemedText style={styles.subjectHeaderMetaBadge}>Endorsement: {subject.endorsement}</ThemedText>
                        <ThemedText style={styles.subjectHeaderMetaBadge}>Highest Possible: {subject.highestPossibleEndorsement}</ThemedText>
                      </View>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                      <View style={styles.tableMatrixGrid}>
                        <View style={[styles.tableHeaderDataRow, { borderBottomColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' }]}>
                          <View style={[styles.tableCell, { width: 90 }]}><ThemedText style={styles.headerLabelText}>AS No</ThemedText></View>
                          <View style={[styles.tableCell, { width: 220 }]}><ThemedText style={styles.headerLabelText}>AS Name</ThemedText></View>
                          <View style={[styles.tableCell, { width: 100 }]}><ThemedText style={styles.headerLabelText}>Type</ThemedText></View>
                          <View style={[styles.tableCell, { width: 120 }]}><ThemedText style={styles.headerLabelText}>Assessment</ThemedText></View>
                          <View style={[styles.tableCell, { width: 80 }]}><ThemedText style={styles.headerLabelText}>Year</ThemedText></View>
                          <View style={[styles.tableCell, { width: 80, alignItems: 'center' }]}><ThemedText style={styles.headerLabelText}>Credits</ThemedText></View>
                          <View style={[styles.tableCell, { width: 180 }]}><ThemedText style={styles.headerLabelText}>Achievement</ThemedText></View>
                        </View>

                        {subject.standards.map((row, idx) => (
                          <View 
                            key={`${row.asNo}-${row.level}-${idx}`}
                            style={[
                              styles.tableRecordRow, 
                              { 
                                borderBottomColor: colorScheme === 'dark' ? '#1E293B' : '#F1F5F9',
                                backgroundColor: idx % 2 === 0 ? 'transparent' : (colorScheme === 'dark' ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.01)')
                              }
                            ]}
                          >
                            <View style={[styles.tableCell, { width: 90 }]}><ThemedText style={styles.rowInlineMainText}>{row.asNo}</ThemedText></View>
                            <View style={[styles.tableCell, { width: 220 }]}><ThemedText numberOfLines={2} style={styles.rowInlineMainText}>{row.asName}</ThemedText></View>
                            <View style={[styles.tableCell, { width: 100 }]}><ThemedText style={styles.rowInlineMainText}>{row.type}</ThemedText></View>
                            <View style={[styles.tableCell, { width: 120 }]}>
                              <ThemedText 
                                style={[
                                  styles.rowInlineMainText, 
                                  { 
                                    fontWeight: '600',
                                    color: row.assessment_type === 'Official AS' ? '#3B82F6' : row.assessment_type === 'Official US' ? '#D97706' : '#8B5CF6'
                                  }
                                ]}
                              >
                                {row.assessment_type}
                              </ThemedText>
                            </View>
                            <View style={[styles.tableCell, { width: 80 }]}><ThemedText style={styles.rowInlineMainText}>{row.year}</ThemedText></View>
                            <View style={[styles.tableCell, { width: 80, alignItems: 'center' }]}><ThemedText style={styles.rowInlineMainText}>{row.credits}</ThemedText></View>
                            <View style={[styles.tableCell, { width: 180 }]}>
                              <ThemedText 
                                style={[
                                  styles.rowInlineMainText, 
                                  { 
                                    fontWeight: '700',
                                    color: row.achievement.includes('Excellence') ? '#10B981' : 
                                           row.achievement.includes('Merit') ? '#3B82F6' : 
                                           row.achievement === 'Achieved' ? '#D97706' : 
                                           row.achievement === 'Not Achieved' ? '#EF4444' : '#64748B'
                                  }
                                ]}
                              >
                                {row.achievement}
                              </ThemedText>
                            </View>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                );
              })
            )}
          </View>

          {/* Pie Chart Analytics */}
          <View style={[styles.pieChartAnalyticsCard, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F8FAFC' }]}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <ThemedText style={[styles.analyticsHeading, { color: currentColors.text }]}>
                Achievement Breakdown
              </ThemedText>
              
              <ThemedText style={{ fontSize: 15, color: currentColors.textSecondary, marginBottom: Spacing.four }}>
                Filtered Summary
              </ThemedText>

              {pieChartData.map((item) => (
                <View key={item.label} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <ThemedText style={styles.legendText}>
                    {item.label}: <ThemedText style={{ fontWeight: '700' }}>{item.value} credits</ThemedText>
                  </ThemedText>
                </View>
              ))}
            </View>

            <View style={{ alignItems: 'center', justifyContent: 'center', paddingLeft: Spacing.two }}>
              {pieChartComponent}
            </View>
          </View>

          {/* NCEA LEVEL & ENDORSEMENT STATUS TABLE */}
          <View style={[styles.cardContainer, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#FFFFFF' }]}>
            <ThemedText style={styles.cardHeaderTitle}>NCEA Level & Endorsement Requirements</ThemedText>
            
            <View style={styles.warningBanner}>
              <ThemedText style={styles.warningBannerText}>
                ⚠️ <ThemedText style={{ fontWeight: '700' }}>Note:</ThemedText> Literacy & Numeracy can be achieved via US 32403, 32405, 32406, or eligible standard credits. The standard credit pathway expires at the end of 2027.
              </ThemedText>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={styles.tableMatrixGrid}>
                <View style={[styles.tableHeaderDataRow, { borderBottomColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' }]}>
                  <View style={[styles.tableCell, { width: 90 }]}><ThemedText style={styles.headerLabelText}>Level</ThemedText></View>
                  <View style={[styles.tableCell, { width: 100 }]}><ThemedText style={styles.headerLabelText}>Literacy</ThemedText></View>
                  <View style={[styles.tableCell, { width: 100 }]}><ThemedText style={styles.headerLabelText}>Numeracy</ThemedText></View>
                  <View style={[styles.tableCell, { width: 130 }]}><ThemedText style={styles.headerLabelText}>NCEA Level</ThemedText></View>
                  <View style={[styles.tableCell, { width: 140 }]}><ThemedText style={styles.headerLabelText}>Merit End.</ThemedText></View>
                  <View style={[styles.tableCell, { width: 140 }]}><ThemedText style={styles.headerLabelText}>Excellence End.</ThemedText></View>
                </View>

                {[1, 2, 3].map((lvl) => {
                  const isLitMet = globalCumulativeMetrics.isUeLiteracyAchieved;
                  const isNumMet = globalCumulativeMetrics.isUeNumeracyAchieved;
                  const isLitNumMet = isLitMet && isNumMet;
                  
                  const levelCredits = lvl === 1 
                    ? globalCumulativeMetrics.level1Achieved + globalCumulativeMetrics.level2Achieved + globalCumulativeMetrics.Level3Achieved 
                    : lvl === 2 
                      ? globalCumulativeMetrics.level2Achieved + globalCumulativeMetrics.Level3Achieved 
                      : globalCumulativeMetrics.Level3Achieved;
                                      
                  const isLevelAchieved = levelCredits >= 60 && isLitNumMet;

                  const pureL3E = globalCumulativeMetrics.Level3Excellence;
                  const pureL2E = globalCumulativeMetrics.level2Excellence;
                  const pureL1E = globalCumulativeMetrics.level1Excellence;

                  const pureL3M = Math.max(0, globalCumulativeMetrics.level3Merit - pureL3E);
                  const pureL2M = Math.max(0, globalCumulativeMetrics.level2Merit - pureL2E);
                  const pureL1M = Math.max(0, globalCumulativeMetrics.level1Merit - pureL1E);

                  const excellenceCredits = lvl === 3 ? pureL3E :
                                              lvl === 2 ? pureL2E + pureL3E :
                                              pureL1E + pureL2E + pureL3E;

                  const meritPlusCredits = lvl === 3 ? pureL3M + pureL3E :
                                            lvl === 2 ? pureL2M + pureL2E + pureL3M + pureL3E :
                                            pureL1M + pureL1E + pureL2M + pureL2E + pureL3M + pureL3E;

                  const isMeritEndorsed = isLevelAchieved && meritPlusCredits >= 50;
                  const isExcellenceEndorsed = isLevelAchieved && excellenceCredits >= 50;

                  return (
                    <View key={`ncea-row-l${lvl}`} style={[styles.tableRecordRow, { borderBottomColor: colorScheme === 'dark' ? '#1E293B' : '#F1F5F9' }]}>
                      <View style={[styles.tableCell, { width: 90 }]}><ThemedText style={styles.rowInlineMainText}>Level {lvl}</ThemedText></View>
                      
                      <View style={[styles.tableCell, { width: 100 }]}>
                        <ThemedText style={{ color: isLitMet ? '#10B981' : '#EF4444', fontWeight: '700', fontSize: 14 }}>
                          {isLitMet ? 'Met' : 'Not Met'}
                        </ThemedText>
                      </View>

                      <View style={[styles.tableCell, { width: 100 }]}>
                        <ThemedText style={{ color: isNumMet ? '#10B981' : '#EF4444', fontWeight: '700', fontSize: 14 }}>
                          {isNumMet ? 'Met' : 'Not Met'}
                        </ThemedText>
                      </View>

                      <View style={[styles.tableCell, { width: 130 }]}>
                        <ThemedText style={{ color: isLevelAchieved ? '#D97706' : '#64748B', fontWeight: '700', fontSize: 14 }}>
                          {isLevelAchieved ? 'Achieved' : `${levelCredits}/60`}
                        </ThemedText>
                      </View>

                      <View style={[styles.tableCell, { width: 140 }]}>
                        <ThemedText style={{ color: isMeritEndorsed ? '#3B82F6' : '#64748B', fontWeight: '700', fontSize: 14 }}>
                          {!isLevelAchieved ? 'Req. NCEA L' + lvl : isMeritEndorsed ? 'Endorsed' : `${meritPlusCredits}/50 M`}
                        </ThemedText>
                      </View>

                      <View style={[styles.tableCell, { width: 140 }]}>
                        <ThemedText style={{ color: isExcellenceEndorsed ? '#10B981' : '#64748B', fontWeight: '700', fontSize: 14 }}>
                          {!isLevelAchieved ? 'Req. NCEA L' + lvl : isExcellenceEndorsed ? 'Endorsed' : `${excellenceCredits}/50 E`}
                        </ThemedText>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          {/* SUBJECT ENDORSEMENTS TABLE */}
          <View style={[styles.cardContainer, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#FFFFFF', marginTop: 16 }]}>
            <View style={{ flexDirection: 'column', gap: Spacing.two, marginBottom: 12 }}>
              <ThemedText style={styles.cardHeaderTitle}>Subject Endorsements</ThemedText>
              <View style={styles.topRightInfoBox}>
                <ThemedText style={styles.topRightInfoText}>
                  ℹ️ Requires 14+ credits (min. 3 Int & 3 Ext) at that grade or higher.
                </ThemedText>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={styles.tableMatrixGrid}>
                <View style={[styles.tableHeaderDataRow, { borderBottomColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' }]}>
                  <View style={[styles.tableCell, { width: 180 }]}><ThemedText style={styles.headerLabelText}>Subject</ThemedText></View>
                  <View style={[styles.tableCell, { width: 70 }]}><ThemedText style={styles.headerLabelText}>A (Int)</ThemedText></View>
                  <View style={[styles.tableCell, { width: 70 }]}><ThemedText style={styles.headerLabelText}>A (Ext)</ThemedText></View>
                  <View style={[styles.tableCell, { width: 70 }]}><ThemedText style={styles.headerLabelText}>M (Int)</ThemedText></View>
                  <View style={[styles.tableCell, { width: 70 }]}><ThemedText style={styles.headerLabelText}>M (Ext)</ThemedText></View>
                  <View style={[styles.tableCell, { width: 70 }]}><ThemedText style={styles.headerLabelText}>E (Int)</ThemedText></View>
                  <View style={[styles.tableCell, { width: 70 }]}><ThemedText style={styles.headerLabelText}>E (Ext)</ThemedText></View>
                  <View style={[styles.tableCell, { width: 140 }]}><ThemedText style={styles.headerLabelText}>Endorsement</ThemedText></View>
                </View>

                {subjectGroups.map((subj, idx) => {
                  const fullSubjectName = `${subj?.subjectName} ${subj?.level}`;
                  let intA = 0, extA = 0;
                  let intM = 0, extM = 0;
                  let intE = 0, extE = 0;

                  subj.standards.forEach(std => {
                    const isExt = std.type?.toLowerCase().includes('ext');
                    const isInt = !isExt;

                    if (std.achievement === 'Achieved with Excellence') {
                      if (isInt) intE += std.credits;
                      if (isExt) extE += std.credits;
                    } else if (std.achievement === 'Achieved with Merit') {
                      if (isInt) intM += std.credits;
                      if (isExt) extM += std.credits;
                    } else if (std.achievement === 'Achieved') {
                      if (isInt) intA += std.credits;
                      if (isExt) extA += std.credits;
                    }
                  });

                  const totalE = intE + extE;
                  const hasE3Int3Ext = intE >= 3 && extE >= 3;

                  const totalMPlus = intM + extM + totalE;
                  const intMPlus = intM + intE;
                  const extMPlus = extM + extE;
                  const hasM3Int3Ext = intMPlus >= 3 && extMPlus >= 3;

                  const totalAPlus = intA + extA + totalMPlus;
                  const intAPlus = intA + intMPlus;
                  const extAPlus = extA + extMPlus;
                  const hasA3Int3Ext = intAPlus >= 3 && extAPlus >= 3;

                  let endorsementStatus = 'Not Endorsed';
                  let statusColor = '#64748B';

                  if (totalE >= 14 && hasE3Int3Ext) {
                    endorsementStatus = 'Excellence';
                    statusColor = '#10B981';
                  } else if (totalMPlus >= 14 && hasM3Int3Ext) {
                    endorsementStatus = 'Merit';
                    statusColor = '#3B82F6';
                  } else if (totalAPlus >= 14 && hasA3Int3Ext) {
                    endorsementStatus = 'Achieved';
                    statusColor = '#D97706';
                  }

                  return (
                    <View key={`subj-end-${idx}`} style={[styles.tableRecordRow, { borderBottomColor: colorScheme === 'dark' ? '#1E293B' : '#F1F5F9' }]}>
                      <View style={[styles.tableCell, { width: 180 }]}><ThemedText style={styles.rowInlineMainText}>{fullSubjectName}</ThemedText></View>
                      <View style={[styles.tableCell, { width: 70 }]}><ThemedText style={styles.rowInlineMainText}>{intA}</ThemedText></View>
                      <View style={[styles.tableCell, { width: 70 }]}><ThemedText style={styles.rowInlineMainText}>{extA}</ThemedText></View>
                      <View style={[styles.tableCell, { width: 70 }]}><ThemedText style={styles.rowInlineMainText}>{intM}</ThemedText></View>
                      <View style={[styles.tableCell, { width: 70 }]}><ThemedText style={styles.rowInlineMainText}>{extM}</ThemedText></View>
                      <View style={[styles.tableCell, { width: 70 }]}><ThemedText style={styles.rowInlineMainText}>{intE}</ThemedText></View>
                      <View style={[styles.tableCell, { width: 70 }]}><ThemedText style={styles.rowInlineMainText}>{extE}</ThemedText></View>
                      <View style={[styles.tableCell, { width: 140 }]}>
                        <ThemedText style={{ color: statusColor, fontWeight: '700', fontSize: 14 }}>
                          {endorsementStatus}
                        </ThemedText>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          {/* University Entrance Requirement Status Table */}
          <View style={[styles.ueStatusCard, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F8FAFC' }]}>
            <ThemedText style={[styles.analyticsHeading, { color: currentColors.text, marginBottom: 14 }]}>
              University Entrance Qualification Status
            </ThemedText>

            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={styles.tableMatrixGrid}>
                <View style={[styles.tableHeaderDataRow, { borderBottomColor: colorScheme === 'dark' ? '#334155' : '#CBD5E1' }]}>
                  <View style={[styles.tableCell, { width: 180 }]}><ThemedText style={styles.headerLabelText}>Requirement</ThemedText></View>
                  <View style={[styles.tableCell, { width: 220 }]}><ThemedText style={styles.headerLabelText}>Criteria</ThemedText></View>
                  <View style={[styles.tableCell, { width: 110, alignItems: 'center' }]}><ThemedText style={styles.headerLabelText}>Progress</ThemedText></View>
                  <View style={[styles.tableCell, { width: 140, alignItems: 'flex-end' }]}><ThemedText style={styles.headerLabelText}>Status</ThemedText></View>
                </View>

                {/* UE Reading */}
                <View style={[styles.tableRecordRow, { borderBottomColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' }]}>
                  <View style={[styles.tableCell, { width: 180 }]}><ThemedText style={styles.rowInlineMainText}>UE Reading</ThemedText></View>
                  <View style={[styles.tableCell, { width: 220 }]}><ThemedText style={styles.rowInlineSubText}>5+ Reading Credits</ThemedText></View>
                  <View style={[styles.tableCell, { width: 110, alignItems: 'center' }]}><ThemedText style={styles.rowInlineMainText}>{globalCumulativeMetrics.ueReadingCredits}/5</ThemedText></View>
                  <View style={[styles.tableCell, { width: 140, alignItems: 'flex-end' }]}>
                    <ThemedText style={{ fontSize: 14, fontWeight: '700', color: globalCumulativeMetrics.isUeReadingAchieved ? '#10B981' : '#EF4444' }}>
                      {globalCumulativeMetrics.isUeReadingAchieved ? 'Achieved ✅' : 'In Progress'}
                    </ThemedText>
                  </View>
                </View>

                {/* UE Writing */}
                <View style={[styles.tableRecordRow, { borderBottomColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' }]}>
                  <View style={[styles.tableCell, { width: 180 }]}><ThemedText style={styles.rowInlineMainText}>UE Writing</ThemedText></View>
                  <View style={[styles.tableCell, { width: 220 }]}><ThemedText style={styles.rowInlineSubText}>5+ Writing Credits</ThemedText></View>
                  <View style={[styles.tableCell, { width: 110, alignItems: 'center' }]}><ThemedText style={styles.rowInlineMainText}>{globalCumulativeMetrics.ueWritingCredits}/5</ThemedText></View>
                  <View style={[styles.tableCell, { width: 140, alignItems: 'flex-end' }]}>
                    <ThemedText style={{ fontSize: 14, fontWeight: '700', color: globalCumulativeMetrics.isUeWritingAchieved ? '#10B981' : '#EF4444' }}>
                      {globalCumulativeMetrics.isUeWritingAchieved ? 'Achieved ✅' : 'In Progress'}
                    </ThemedText>
                  </View>
                </View>

                {/* UE Literacy Overall */}
                <View style={[styles.tableRecordRow, { borderBottomColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' }]}>
                  <View style={[styles.tableCell, { width: 180 }]}><ThemedText style={styles.rowInlineMainText}>UE Literacy</ThemedText></View>
                  <View style={[styles.tableCell, { width: 220 }]}><ThemedText style={styles.rowInlineSubText}>5 Reading + 5 Writing</ThemedText></View>
                  <View style={[styles.tableCell, { width: 110, alignItems: 'center' }]}><ThemedText style={styles.rowInlineMainText}>{globalCumulativeMetrics.ueReadingCredits + globalCumulativeMetrics.ueWritingCredits}/10</ThemedText></View>
                  <View style={[styles.tableCell, { width: 140, alignItems: 'flex-end' }]}>
                    <ThemedText style={{ fontSize: 14, fontWeight: '700', color: globalCumulativeMetrics.isUeLiteracyAchieved ? '#10B981' : '#EF4444' }}>
                      {globalCumulativeMetrics.isUeLiteracyAchieved ? 'Achieved ✅' : 'In Progress'}
                    </ThemedText>
                  </View>
                </View>

                {/* UE Numeracy */}
                <View style={[styles.tableRecordRow, { borderBottomColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' }]}>
                  <View style={[styles.tableCell, { width: 180 }]}><ThemedText style={styles.rowInlineMainText}>UE Numeracy</ThemedText></View>
                  <View style={[styles.tableCell, { width: 220 }]}><ThemedText style={styles.rowInlineSubText}>10+ Numeracy Credits</ThemedText></View>
                  <View style={[styles.tableCell, { width: 110, alignItems: 'center' }]}><ThemedText style={styles.rowInlineMainText}>{globalCumulativeMetrics.ueNumeracyCredits}/10</ThemedText></View>
                  <View style={[styles.tableCell, { width: 140, alignItems: 'flex-end' }]}>
                    <ThemedText style={{ fontSize: 14, fontWeight: '700', color: globalCumulativeMetrics.isUeNumeracyAchieved ? '#10B981' : '#EF4444' }}>
                      {globalCumulativeMetrics.isUeNumeracyAchieved ? 'Achieved ✅' : 'In Progress'}
                    </ThemedText>
                  </View>
                </View>

                {/* NCEA Level 3 */}
                <View style={[styles.tableRecordRow, { borderBottomColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' }]}>
                  <View style={[styles.tableCell, { width: 180 }]}><ThemedText style={styles.rowInlineMainText}>NCEA Level 3</ThemedText></View>
                  <View style={[styles.tableCell, { width: 220 }]}><ThemedText style={styles.rowInlineSubText}>60+ L3 Credits</ThemedText></View>
                  <View style={[styles.tableCell, { width: 110, alignItems: 'center' }]}><ThemedText style={styles.rowInlineMainText}>{globalCumulativeMetrics.Level3Achieved}/60</ThemedText></View>
                  <View style={[styles.tableCell, { width: 140, alignItems: 'flex-end' }]}>
                    <ThemedText style={{ fontSize: 14, fontWeight: '700', color: globalCumulativeMetrics.Level3Achieved >= 60 ? '#10B981' : '#EF4444' }}>
                      {globalCumulativeMetrics.Level3Achieved >= 60 ? 'Achieved ✅' : 'In Progress'}
                    </ThemedText>
                  </View>
                </View>

                {/* UE Approved Subjects */}
                <View style={[styles.tableRecordRow, { borderBottomColor: colorScheme === 'dark' ? '#334155' : '#E2E8F0' }]}>
                  <View style={[styles.tableCell, { width: 180 }]}><ThemedText style={styles.rowInlineMainText}>UE Subjects</ThemedText></View>
                  <View style={[styles.tableCell, { width: 220 }]}><ThemedText style={styles.rowInlineSubText}>14+ Credits in 3 Approved Subj</ThemedText></View>
                  <View style={[styles.tableCell, { width: 110, alignItems: 'center' }]}><ThemedText style={styles.rowInlineMainText}>{globalCumulativeMetrics.level3SubjectsWith14Credits}/3</ThemedText></View>
                  <View style={[styles.tableCell, { width: 140, alignItems: 'flex-end' }]}>
                    <ThemedText style={{ fontSize: 14, fontWeight: '700', color: globalCumulativeMetrics.hasUeSubjectRequirement ? '#10B981' : '#EF4444' }}>
                      {globalCumulativeMetrics.hasUeSubjectRequirement ? 'Achieved ✅' : 'In Progress'}
                    </ThemedText>
                  </View>
                </View>

                {/* Overall University Entrance */}
                <View style={[styles.tableRecordRow, { borderBottomWidth: 0 }]}>
                  <View style={[styles.tableCell, { width: 180 }]}><ThemedText style={[styles.rowInlineMainText, { fontWeight: '800', fontSize: 16 }]}>University Entrance</ThemedText></View>
                  <View style={[styles.tableCell, { width: 220 }]}><ThemedText style={styles.rowInlineSubText}>L3 + UE Subj + Lit + Num</ThemedText></View>
                  <View style={[styles.tableCell, { width: 110, alignItems: 'center' }]}><ThemedText style={styles.rowInlineMainText}>-</ThemedText></View>
                  <View style={[styles.tableCell, { width: 140, alignItems: 'flex-end' }]}>
                    <ThemedText style={{ fontWeight: '800', fontSize: 15, color: globalCumulativeMetrics.isUniversityEntranceAchieved ? '#10B981' : '#EF4444' }}>
                      {globalCumulativeMetrics.isUniversityEntranceAchieved ? 'Achieved 🎉' : 'In Progress'}
                    </ThemedText>
                  </View>
                </View>

              </View>
            </ScrollView>
          </View>

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

export const GRADE_COLORS = {
  excellence: '#10B981',
  merit: '#3B82F6',
  achieved: '#D97706',
  notAchieved: '#EF4444',
} as const;

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContainer: { padding: Spacing.four, paddingBottom: 60 },
  pageTitle: { fontSize: 26, fontWeight: '800', marginBottom: Spacing.four },
  errorContainer: { backgroundColor: '#FEE2E2', padding: Spacing.four, borderRadius: 10, marginBottom: Spacing.four },
  errorText: { color: '#991B1B', fontWeight: '600', fontSize: 15 },
  
  metricRowContainer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  metricTextRightBlock: { marginLeft: 6, flex: 1 },
  percentageHeadline: { fontSize: 22, fontWeight: '800' },
  descriptionMetaText: { fontSize: 13, marginTop: 2, fontWeight: '500' },
  cardCornerFooterTag: {
    fontSize: 13,
    fontWeight: '700',
    opacity: 0.7,
    marginBottom: 12,
  },  
  filteringContextToolbar: { flexDirection: 'row', gap: Spacing.three, marginBottom: Spacing.three },
  dropdownControlCell: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.four, borderWidth: 1, borderRadius: 10 },
  filterValueText: { fontSize: 15, fontWeight: '700' },
  dropdownDrawer: { padding: Spacing.three, borderRadius: 10, marginBottom: Spacing.three },
  drawerOption: { paddingVertical: Spacing.three, paddingHorizontal: Spacing.four },
  tablesContainerWrapper: { gap: Spacing.four, marginBottom: Spacing.four },
  emptyStateContainer: { padding: Spacing.four, alignItems: 'center' },
  subjectBlockSegment: { borderRadius: 12, overflow: 'hidden', marginBottom: Spacing.two },
  subjectSectionHeader: { padding: Spacing.four },
  subjectTitleText: { fontSize: 18, fontWeight: '800' },
  subjectHeaderMetaBadge: { fontSize: 13, color: '#64748B', fontWeight: '700' },
  tableMatrixGrid: { minWidth: '100%' },
  tableHeaderDataRow: { flexDirection: 'row', paddingVertical: Spacing.three, borderBottomWidth: 1.5 },
  tableRecordRow: { flexDirection: 'row', paddingVertical: Spacing.three, borderBottomWidth: 1 },
  tableCell: { justifyContent: 'center', paddingHorizontal: 6 },
  headerLabelText: { fontSize: 13, fontWeight: '800', color: '#64748B' },
  rowInlineMainText: { fontSize: 14, fontWeight: '500' },
  rowInlineSubText: { fontSize: 12, color: '#64748B' },
  pieChartAnalyticsCard: { flexDirection: 'row', padding: Spacing.four, borderRadius: 14, marginTop: Spacing.three },
  ueStatusCard: { padding: Spacing.four, borderRadius: 14, marginTop: Spacing.three },
  analyticsHeading: { fontSize: 19, fontWeight: '800' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginVertical: 4 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 15 },

  statsMetricsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 24,
  },
  metricItemCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 16,
    padding: 16,
    position: 'relative',
    justifyContent: 'space-between',
    minHeight: 140,
  },
  centeredMetricRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 6,
    gap: 12,
  },
  metricItemCardFullWidth: {
    flexBasis: '100%',
    borderRadius: 16,
    padding: 16,
    minHeight: 130,
    justifyContent: 'center',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  floatingControlsContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    gap: 6,
    zIndex: 10,
  },
  targetSubText: {
    fontSize: 15,
    fontWeight: '500',
    opacity: 0.6,
  },
  selectorPillGroup: {
    flexDirection: 'row',
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    borderRadius: 8,
    padding: 3,
    gap: 3,
  },
  selectorPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  selectorPillText: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.8,
  },
  ueSubjectsGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  ueSubjectRingItem: {
    alignItems: 'center',
    flex: 1,
  },
  ueSubjectCreditsText: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  ueSubjectNameText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 3,
    maxWidth: 70,
  },
  cardContainer: {
    padding: 18,
    borderRadius: 14,
    marginVertical: 12,
  },
  cardHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  warningBanner: {
    backgroundColor: 'rgba(217, 119, 6, 0.1)',
    borderColor: '#D97706',
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  warningBannerText: {
    fontSize: 13,
    color: '#D97706',
    lineHeight: 18,
  },
  topRightInfoBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderColor: '#3B82F6',
    borderWidth: 1,
    padding: 8,
    borderRadius: 8,
  },
  topRightInfoText: {
    fontSize: 12,
    color: '#3B82F6',
    lineHeight: 16,
  },
});