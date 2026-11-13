import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Stethoscope, CheckCircle2, AlertTriangle, Trash2, Check, CircleDot, Calendar, Clock, Zap, Calendar as CalendarIcon, ChevronLeft, ChevronRight, DoorOpen, Eye, EyeOff } from 'lucide-react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, getDocs, getDoc, doc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import LoginView from './components/LoginView';
import { useUiFeedback } from './components/uiFeedbackContext';
import PatientLayout from './components/PatientLayout';
import DoctorLayout from './components/DoctorLayout';
import DoctorProgressUpdate from './components/DoctorProgressUpdate';
import DoctorPatientRecords from './components/DoctorPatientRecords';
import PatientMedicalRecordHistory from './components/PatientMedicalRecordHistory';
import PatientPrescriptions from './components/PatientPrescriptions';
import AdminLayout from './components/AdminLayout';
import AdminDashboard from './components/AdminDashboard';
import AdminEmergencyPatientProfiles from './components/AdminEmergencyPatientProfiles';
import AppointmentView from './components/AppointmentView';
import UserQueue from './pages/UserQueue';
import ProgressUpdate from './components/ProgressUpdate';
import DiagnosticTestProgress from './components/DiagnosticTestProgress';
import RoomLayout, { type RoomTab } from './components/RoomLayout';
import RoomEmergencyQueue from './components/RoomEmergencyQueue';
import EmergencyPatientProgress from './components/EmergencyPatientProgress';
import EmergencyProtocolManager from './components/EmergencyProtocolManager';
import { 
  subscribeToLiveQueue, 
  subscribeToQueuePositions,
  syncQueuePositions,
  STANDARD_WAIT_MINUTES,
  EMERGENCY_WAIT_MINUTES,
  EMERGENCY_PRIORITY_WEIGHT,
  QUEUE_WAIT_ESTIMATE_VERSION,
  addPatientToQueue, 
  removeFromQueue,
  savePatientProfile, 
  type QueuePatient,
  type QueuePosition,
  type TraumaType,
  type EmergencyRouting,
  subscribeToEmergencyRouting,
  getEmergencyDestination,
  updatePatientPersonalProfile,
  updatePatientNameOnce,
} from './services/patientService';
import { subscribeToAppointments, updateAppointmentStatus, type AppointmentRequest } from './services/appointmentService';
import { createDoctorAccount, ensureDoctorProfileAtAuthUid } from './services/doctorService';
import { createRoomAccount, roomDestinations } from './services/roomService';
import { calculateAgeFromBirthday } from './utils/dateUtils';
import logo from './assets/logo.png';

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatEstimatedWait(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}${
    remainingMinutes > 0 ? ` ${remainingMinutes} min` : ''
  }`;
}

const FAST_QUEUE_MAX_WAIT_MINUTES = 15;
const MODERATE_QUEUE_MAX_WAIT_MINUTES = 30;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

interface RegisteredDoctor {
  id: string;
  fullName?: string;
  email?: string;
  specialty?: string;
  specialization?: string;
}

interface QueueAppointment extends AppointmentRequest {
  fullName: string;
  isEmergency: boolean;
  priorityWeight?: number;
  traumaType?: string;
  traumaLevel?: 1 | 2 | 3;
  traumaSpecification?: string;
}

const doctorSpecialtyGroups = [
  {
    category: 'Primary Care & Internal Medicine',
    specialties: [
      ['General Practitioner (GP) / Family Medicine', 'Primary care, routine check-ups, and preventive care for all ages.'],
      ['Internal Medicine Specialist (Internist)', 'Adult diseases, chronic conditions, and complex internal illnesses.'],
      ['Geriatrician', 'Health care and diseases of older adults.'],
      ['Endocrinologist', 'Hormones, metabolism, diabetes, and thyroid disorders.'],
      ['Cardiologist', 'Heart and blood vessel disorders.'],
      ['Pulmonologist', 'Lung and respiratory tract diseases, including asthma, COPD, and pneumonia.'],
      ['Gastroenterologist', 'Digestive system, stomach, liver, and intestinal conditions.'],
      ['Nephrologist', 'Kidney diseases and dialysis care.'],
      ['Rheumatologist', 'Autoimmune diseases, arthritis, and joint inflammation.'],
      ['Hematologist', 'Blood disorders, clotting conditions, and bone marrow diseases.'],
      ['Oncologist', 'Cancer diagnosis, chemotherapy, and tumor treatment.'],
      ['Infectious Disease Specialist', 'Complex viral, bacterial, fungal, and parasitic infections.'],
    ],
  },
  {
    category: 'Surgery & Procedural Specialties',
    specialties: [
      ['General Surgeon', 'Surgery involving abdominal organs, soft tissues, and trauma.'],
      ['Orthopedic Surgeon', 'Bones, joints, ligaments, tendons, and musculoskeletal trauma or fractures.'],
      ['Neurosurgeon', 'Surgery of the brain, spine, and central nervous system.'],
      ['Cardiothoracic Surgeon', 'Surgery of the heart, lungs, and chest cavity.'],
      ['Plastic and Reconstructive Surgeon', 'Cosmetic surgery, burn reconstruction, and tissue repair.'],
      ['Vascular Surgeon', 'Blood vessel and artery surgery.'],
      ['Urologist', 'Urinary tract and male reproductive system conditions.'],
      ['Otolaryngologist (ENT - Ear, Nose, Throat)', 'Ear, nose, throat, sinus, and neck conditions and surgery.'],
      ['Ophthalmologist', 'Eye diseases, vision correction, and eye surgery.'],
    ],
  },
  {
    category: 'Maternal, Child, & Family Health',
    specialties: [
      ['Pediatrician', 'Health, development, and illnesses of infants, children, and adolescents.'],
      ['Neonatologist', 'Care of newborns, especially premature or critically ill newborns.'],
      ['Obstetrician & Gynecologist (OB-GYN)', 'Women’s reproductive health, pregnancy, childbirth, and postnatal care.'],
      ['Maternal-Fetal Medicine Specialist (Perinatologist)', 'High-risk pregnancy care.'],
      ['Reproductive Endocrinologist / Infertility Specialist', 'Fertility, hormonal treatments, and assisted reproduction.'],
    ],
  },
  {
    category: 'Emergency, Critical Care, & Diagnostics',
    specialties: [
      ['Emergency Medicine Specialist (ER Doctor)', 'Acute trauma, life-threatening injuries, and emergency stabilization.'],
      ['Intensivist / Critical Care Specialist', 'Care of critically ill patients in the Intensive Care Unit.'],
      ['Radiologist', 'Interpretation of X-rays, CT scans, MRIs, and ultrasounds.'],
      ['Pathologist', 'Examination of tissues, blood samples, and laboratory diagnostics.'],
      ['Anesthesiologist', 'Pain management and anesthesia during surgery.'],
    ],
  },
  {
    category: 'Mental Health & Specialized Neurology',
    specialties: [
      ['Neurologist', 'Disorders of the nervous system, brain, stroke, and spinal cord.'],
      ['Psychiatrist', 'Mental health, emotional disorders, and psychiatric medications.'],
      ['Dermatologist', 'Skin, hair, and nail conditions, cosmetic skin care, and skin cancers.'],
      ['Physical Medicine and Rehabilitation (Physiatrist)', 'Physical therapy, post-stroke recovery, and injury rehabilitation.'],
    ],
  },
] as const;

const doctorSpecialtyDescriptions = doctorSpecialtyGroups.reduce((descriptions, group) => {
  group.specialties.forEach(([specialty, description]) => {
    descriptions.set(specialty, description);
  });
  return descriptions;
}, new Map<string, string>());

async function ensurePatientProfileRecord(user: { uid: string; email?: string | null; displayName?: string | null; phone?: string | null }) {
  const email = user.email?.trim();
  if (!email) {
    return null;
  }

  const patientQuery = query(collection(db, 'patients'), where('email', '==', email));
  const patientSnapshot = await getDocs(patientQuery);

  if (!patientSnapshot.empty) {
    const patientData = patientSnapshot.docs[0].data();
    const patientAccountNo = typeof patientData.accountNo === 'string'
      ? patientData.accountNo
      : `PTNT-${user.uid.slice(0, 6).toUpperCase()}`;

    return {
      docId: patientSnapshot.docs[0].id,
      accountNo: patientAccountNo,
      fullName: typeof patientData.fullName === 'string' ? patientData.fullName : user.displayName || email,
      email,
      uid: user.uid,
    };
  }

  const fallbackName = (user.displayName || email.split('@')[0] || 'Patient')
    .trim()
    .replace(/\s+/g, ' ');
  const generatedAccountNo = `PTNT-${user.uid.slice(0, 6).toUpperCase()}`;

  await savePatientProfile(user.uid, fallbackName, email, user.phone || '');

  return {
    docId: user.uid,
    accountNo: generatedAccountNo,
    fullName: fallbackName,
    email,
    uid: user.uid,
  };
}

export default function App() {
  const { notify: showAppNotice, confirm: confirmInUi } = useUiFeedback();
  const path = window.location.pathname || '';
  const isExplicitAdminRoute = path.includes('admin') || path.includes('hw-pw-admin');
  const isExplicitDoctorRoute = path.includes('hq-pw-dr-login') || path.includes('doctor');
  const isExplicitRoomRoute = path.includes('room');

  const [currentUser, setCurrentUser] = useState<{ role: 'patient' | 'admin' | 'doctor' | 'room'; name: string; email?: string; accountNo?: string; uid?: string } | null>(null);
  const [staffAuthenticated, setStaffAuthenticated] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [doctorSelectedDate, setDoctorSelectedDate] = useState(() => new Date());
  const [registeredDoctors, setRegisteredDoctors] = useState<RegisteredDoctor[]>([]);
  const [selectedDoctors, setSelectedDoctors] = useState<{ [apptId: string]: string }>({});
  const [queueSubTab, setQueueSubTab] = useState<'today' | 'upcoming'>('today');

  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    const q = query(collection(db, 'doctors'), where('role', '==', 'doctor'));
    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((docSnap): RegisteredDoctor => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          fullName: typeof data.fullName === 'string' ? data.fullName : undefined,
          email: typeof data.email === 'string' ? data.email : undefined,
          specialty: typeof data.specialty === 'string' ? data.specialty : undefined,
          specialization: typeof data.specialization === 'string' ? data.specialization : undefined,
        };
      });
      setRegisteredDoctors(list);
    });
  }, [currentUser?.role]);
  // Patient Profile state
  const [patientDocId, setPatientDocId] = useState<string | null>(null);
  const [patientProfile, setPatientProfile] = useState<{
    fullName?: string;
    sex?: string;
    age?: string;
    birthday?: string;
    contact?: string;
    address?: string;
    allergies?: string;
    profileCompleted?: boolean;
    nameEditUsed?: boolean;
  } | null>(null);
  const [isEditingPatientName, setIsEditingPatientName] = useState(false);
  const [patientNameInput, setPatientNameInput] = useState('');
  const [isSavingPatientName, setIsSavingPatientName] = useState(false);
  const [patientNameError, setPatientNameError] = useState<string | null>(null);

  const [profileFormData, setProfileFormData] = useState({
    sex: 'Male',
    age: '',
    birthday: '',
    contact: '',
    address: '',
  });
  const [isSavingPatientProfile, setIsSavingPatientProfile] = useState(false);
  const [isConfirmingPatientProfileSave, setIsConfirmingPatientProfileSave] = useState(false);

  // Form inputs
  const [adminInput, setAdminInput] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [doctorInput, setDoctorInput] = useState('');
  const [doctorPass, setDoctorPass] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [roomPass, setRoomPass] = useState('');

  // Emergency & Doctor form inputs in Admin panel
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyAccountNo, setEmergencyAccountNo] = useState('');
  const [emergencyTraumaType, setEmergencyTraumaType] = useState<TraumaType | ''>('');
  const [emergencyRouteSearch, setEmergencyRouteSearch] = useState('');
  const [emergencyRouteListOpen, setEmergencyRouteListOpen] = useState(false);
  const [activeEmergencyRouteIndex, setActiveEmergencyRouteIndex] = useState(0);
  const emergencyRouteInputRef = useRef<HTMLInputElement>(null);
  const [emergencySpecification, setEmergencySpecification] = useState('');
  const [emergencyRoutes, setEmergencyRoutes] = useState<EmergencyRouting[]>([]);
  const [emergencyRoutesLoading, setEmergencyRoutesLoading] = useState(true);
  const [emergencyRoutesError, setEmergencyRoutesError] = useState<string | null>(null);
  const [invalidEmergencyRouteIds, setInvalidEmergencyRouteIds] = useState<string[]>([]);

  const [docName, setDocName] = useState('');
  const [docEmail, setDocEmail] = useState('');
  const [docSpecialty, setDocSpecialty] = useState('');
  const [docSpecialtySearch, setDocSpecialtySearch] = useState('');
  const [docPassword, setDocPassword] = useState('');
  const [showDoctorPassword, setShowDoctorPassword] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomEmail, setRoomEmail] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [showRoomPassword, setShowRoomPassword] = useState(false);

  // Tabs
  const [patientTab, setPatientTab] = useState<'queue' | 'appointment' | 'progress' | 'records' | 'prescriptions'>('queue');
  const [adminTab, setAdminTab] = useState<'queue' | 'addQueue' | 'addAppoint' | 'addDoctor' | 'addRoom' | 'progress' | 'records' | 'emergencyProcedures' | 'emergencyProfiles'>('queue');
  const [doctorTab, setDoctorTab] = useState<'queue' | 'progress' | 'records' | 'appointment'>('queue');
  const [roomTab, setRoomTab] = useState<RoomTab>('progress');
  
  // Interactive Profile Modal State
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Real-time Queue & Appointments
  const [liveQueue, setLiveQueue] = useState<QueuePatient[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRequest[]>([]);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [patientQueueState, setPatientQueueState] = useState<{
    uid: string;
    positions: QueuePosition[];
    loading: boolean;
    error: string | null;
  } | null>(null);
  const [queueDataLoadedFor, setQueueDataLoadedFor] = useState<string | null>(null);
  const [appointmentsLoadedFor, setAppointmentsLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.uid) return;

    const uid = currentUser.uid;
    const patientEmail = currentUser.role === 'patient'
      ? currentUser.email
      : undefined;
    const unsubQueue = subscribeToLiveQueue(
      (queueData) => {
        setLiveQueue(queueData || []);
        setQueueDataLoadedFor(uid);
      },
      patientEmail,
    );
    const unsubAppts = subscribeToAppointments(
      (apptData) => {
        setAppointments(apptData || []);
        setAppointmentsError(null);
        setAppointmentsLoadedFor(uid);
      },
      currentUser.role === 'patient' ? uid : undefined,
      (error) => setAppointmentsError(error.message),
    );
    const unsubQueuePositions = currentUser.role === 'patient'
      ? subscribeToQueuePositions(
        (positions) => {
          setPatientQueueState({ uid, positions, loading: false, error: null });
        },
        (error) => {
          setPatientQueueState({ uid, positions: [], loading: false, error: error.message });
        },
      )
      : undefined;
    return () => {
      unsubQueue();
      unsubAppts();
      unsubQueuePositions?.();
    };
  }, [currentUser?.role, currentUser?.uid, currentUser?.accountNo, currentUser?.email]);
  const currentPatientQueueState = currentUser?.role === 'patient' &&
    patientQueueState?.uid === currentUser.uid
    ? patientQueueState
    : null;
  const queuePositions = currentPatientQueueState?.positions || [];
  const queuePositionsLoading = currentPatientQueueState?.loading ?? currentUser?.role === 'patient';
  const queuePositionsError = currentPatientQueueState?.error || null;
  useEffect(() => {
    if (!currentUser?.uid) return;

    const unsubscribe = subscribeToEmergencyRouting(
  (routes, invalidDocumentIds) => {
    setEmergencyRoutes(routes);
    setInvalidEmergencyRouteIds(invalidDocumentIds);
    setEmergencyRoutesLoading(false);
    setEmergencyRoutesError(null);
  },
  (error) => {
    setEmergencyRoutesError(error.message);
    setEmergencyRoutesLoading(false);
  }
    );

    return () => unsubscribe();
  }, [currentUser?.uid]);

  const selectedEmergencyRoute = emergencyRoutes.find(
    (route) => route.id === emergencyTraumaType
  );
  const filteredDoctorSpecialtyGroups = doctorSpecialtyGroups
    .map((group) => ({
      ...group,
      specialties: group.specialties.filter(([specialty, description]) =>
        `${specialty} ${description} ${group.category}`
          .toLowerCase()
          .includes(docSpecialtySearch.trim().toLowerCase())
      ),
    }))
    .filter((group) => group.specialties.length > 0);
  const filteredEmergencyRoutes = emergencyRoutes.filter((route) =>
    route.symptom.toLowerCase().includes(emergencyRouteSearch.trim().toLowerCase())
  );
  const requiresEmergencySpecification =
    selectedEmergencyRoute?.symptom.trim().toLowerCase() === 'other emergency';

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const todaysQueue = useMemo(() => appointments
    .filter((appt) => {
      const status = appt.status?.toLowerCase();
      const service = appt.serviceType?.toLowerCase() || '';
      const isConfirmed = status === 'confirmed' || status === 'approved';
      const isEmergency = service.includes('emergency');
      
      const apptDate = appt.date || '';
      return apptDate === todayStr && (isConfirmed || (isEmergency && status !== 'cancelled'));
    })
    .map((appt): QueueAppointment => ({
      ...appt,
      fullName: appt.patientName || 'Patient',
      accountNo: appt.accountNo || appt.id?.slice(0, 6) || 'N/A',
      isEmergency: appt.serviceType?.toLowerCase().includes('emergency') || false,
    })), [appointments, todayStr]);

  const activeQueue = useMemo(() => {
    const queue: QueuePatient[] = [...liveQueue];
    const queuedAccountNumbers = new Set(
      queue.map((patient) => patient.accountNo.trim().toUpperCase())
    );
    todaysQueue.forEach((appointment) => {
      const accountNo = appointment.accountNo.trim();
      const normalizedAccountNo = accountNo.toUpperCase();
      if (!accountNo || queuedAccountNumbers.has(normalizedAccountNo)) return;

      queue.push({
        accountNo,
        fullName: appointment.fullName,
        priorityWeight: Number(appointment.priorityWeight) || 0,
        isEmergency: appointment.isEmergency,
        appointmentId: appointment.id,
        traumaType: appointment.traumaType,
        traumaLevel: appointment.traumaLevel,
        traumaSpecification: appointment.traumaSpecification,
        room: appointment.room,
      });
      queuedAccountNumbers.add(normalizedAccountNo);
    });
    return queue.sort((a, b) => b.priorityWeight - a.priorityWeight);
  }, [liveQueue, todaysQueue]);

  const queueWaitEstimateVersion = QUEUE_WAIT_ESTIMATE_VERSION;

  useEffect(() => {
    if (
      currentUser?.role !== 'admin' ||
      !currentUser.uid ||
      queueDataLoadedFor !== currentUser.uid ||
      appointmentsLoadedFor !== currentUser.uid
    ) return;

    void syncQueuePositions(activeQueue).catch((error: unknown) => {
      console.error('Could not synchronize the public queue positions:', error);
    });
  }, [
    currentUser?.role,
    currentUser?.uid,
    queueDataLoadedFor,
    appointmentsLoadedFor,
    activeQueue,
    queueWaitEstimateVersion,
  ]);

  const upcomingAppointments = appointments
    .filter((appt) => {
      const status = appt.status?.toLowerCase();
      const isConfirmed = status === 'confirmed' || status === 'approved';
      const apptDate = appt.date || '';
      return isConfirmed && apptDate > todayStr;
    })
    .map((appt) => ({
      ...appt,
      fullName: appt.patientName || 'Patient',
      accountNo: appt.accountNo || appt.id?.slice(0, 6) || 'N/A',
    }));

  const doctorSelectedDateKey = formatLocalDateKey(doctorSelectedDate);
  const doctorMonthStart = new Date(
    doctorSelectedDate.getFullYear(),
    doctorSelectedDate.getMonth(),
    1
  );
  const doctorMonthDays = new Date(
    doctorSelectedDate.getFullYear(),
    doctorSelectedDate.getMonth() + 1,
    0
  ).getDate();
  const doctorCalendarLeadingDays = (doctorMonthStart.getDay() + 6) % 7;
  const doctorCalendarDays = Array.from(
    { length: Math.ceil((doctorCalendarLeadingDays + doctorMonthDays) / 7) * 7 },
    (_, index) => {
      const day = index - doctorCalendarLeadingDays + 1;
      return day > 0 && day <= doctorMonthDays ? day : null;
    }
  );
  const doctorCalendarTodayKey = formatLocalDateKey(new Date());
  const doctorDisplayedMonth = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(doctorSelectedDate);
  const doctorAppointments = appointments.filter(
    (appointment) =>
      appointment.doctorName === currentUser?.name ||
      appointment.doctorId === currentUser?.name
  );
  const doctorDayAppointments = doctorAppointments.filter(
    (appointment) => appointment.date === doctorSelectedDateKey
  );

  // Fetch patient profile document safely
  useEffect(() => {
    if (currentUser?.role !== 'patient' || !currentUser.email) return;

    const q = query(collection(db, 'patients'), where('email', '==', currentUser.email));
    return onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          setPatientDocId(null);
          setPatientProfile(null);
          return;
        }

        const patientDoc = snapshot.docs[0];
        const data = patientDoc.data();
        setPatientDocId(patientDoc.id);
        setPatientProfile(data);
        setPatientNameInput(typeof data.fullName === 'string' ? data.fullName : '');
        if (data.sex || data.age || data.birthday || data.contact || data.address) {
          setProfileFormData({
            sex: data.sex || 'Male',
            age: data.age || '',
            birthday: data.birthday || '',
            contact: data.contact || '',
            address: data.address || '',
          });
        }
      },
      (error) => {
        console.error('Error fetching patient record:', error);
      },
    );
  }, [currentUser]);
  

  const loggedInAccount = currentUser?.accountNo || 'PTNT1AC2B';
  const assignedPatientDoctors = Array.from(
    new Map(
      appointments
        .filter(
          (appointment) =>
            appointment.accountNo === loggedInAccount &&
            appointment.status !== 'cancelled' &&
            Boolean(appointment.doctorName?.trim())
        )
        .map((appointment) => {
          const doctorName = appointment.doctorName!.trim();
          const doctor = registeredDoctors.find(
            (registeredDoctor) => registeredDoctor.fullName === doctorName
          );
          return [
            doctorName,
            {
              name: doctorName,
              specialty: doctor?.specialty || doctor?.specialization,
            },
          ] as const;
        })
    ).values()
  );
  const normalizedLoggedInAccount = loggedInAccount.trim().toUpperCase();
  const patientQueueIndex = (currentUser?.role === 'patient' ? queuePositions : activeQueue).findIndex(
    (patient) => patient.accountNo.trim().toUpperCase() === normalizedLoggedInAccount,
  );
  const loggedInPatientQueueEntry = liveQueue.find(
    (patient) => patient.accountNo.trim().toUpperCase() === normalizedLoggedInAccount,
  );
  const patientQueueDisplay = queuePositions.map((position) => ({
    id: position.id,
    accountNo: position.accountNo,
    fullName: position.accountNo.trim().toUpperCase() === normalizedLoggedInAccount
      ? currentUser?.name || ''
      : '',
    isEmergency: position.accountNo.trim().toUpperCase() === normalizedLoggedInAccount &&
      loggedInPatientQueueEntry?.isEmergency === true,
  }));
  const patientRoomAssignment = activeQueue.find(
    (patient) => patient.accountNo.trim().toUpperCase() === normalizedLoggedInAccount,
  )?.room?.trim() ||
    appointments
      .filter((appointment) => {
        const status = appointment.status.toLowerCase();
        return appointment.accountNo.trim().toUpperCase() === normalizedLoggedInAccount &&
          (status === 'confirmed' || status === 'approved') &&
          appointment.date >= todayStr &&
          Boolean(appointment.room?.trim());
      })
      .sort((left, right) => left.date.localeCompare(right.date))[0]?.room?.trim() ||
    '';
  const dynamicPosition = currentUser?.role === 'patient'
    ? patientQueueIndex !== -1 ? `Position #${patientQueueIndex + 1}` : 'Not in Queue'
    : patientQueueIndex !== -1 ? `Position #${patientQueueIndex + 1}` : 'Not in Queue';
  const dynamicQueueStatus = patientQueueIndex === 0
    ? 'Checking up'
    : patientQueueIndex > 0
      ? 'Pending'
      : 'Waiting in Queue';
  const dynamicQueueStatusClass = patientQueueIndex === 0
    ? 'text-emerald-600'
    : patientQueueIndex > 0
      ? 'text-amber-600'
      : 'text-slate-600';
  const savedPatientWaitMinutes = queuePositions[patientQueueIndex]?.waitEstimateVersion ===
    QUEUE_WAIT_ESTIMATE_VERSION
    ? queuePositions[patientQueueIndex]?.estimatedWaitMinutes
    : undefined;
  const fallbackPatientWaitMinutes = patientQueueIndex > 0
    ? queuePositions
      .slice(0, patientQueueIndex)
      .reduce(
        (total, position) =>
          total + (position.priorityWeight >= EMERGENCY_PRIORITY_WEIGHT
            ? EMERGENCY_WAIT_MINUTES
            : STANDARD_WAIT_MINUTES),
        0,
      )
    : 0;
  const dynamicWaitMinutes = patientQueueIndex === -1
    ? null
    : currentUser?.role === 'patient'
      ? savedPatientWaitMinutes ?? fallbackPatientWaitMinutes
      : activeQueue
        .slice(0, patientQueueIndex)
        .reduce(
          (total, patient) =>
            total + (patient.isEmergency ? EMERGENCY_WAIT_MINUTES : STANDARD_WAIT_MINUTES),
          0,
        );
  const dynamicWaitTime = dynamicWaitMinutes === null
    ? currentUser?.role === 'patient' ? '—' : '0 min'
    : formatEstimatedWait(dynamicWaitMinutes);
  const emergencyPatientsAhead = currentUser?.role === 'patient' || patientQueueIndex === -1
    ? 0
    : activeQueue
      .slice(0, patientQueueIndex)
      .filter((patient) => patient.isEmergency).length;
  const dynamicQueueSpeed = dynamicWaitMinutes === null
    ? 'N/A'
    : dynamicWaitMinutes > MODERATE_QUEUE_MAX_WAIT_MINUTES
      ? 'Super Slow'
      : dynamicWaitMinutes > FAST_QUEUE_MAX_WAIT_MINUTES
        ? 'Moderate'
        : 'Fast';

  // Helper queries
  const checkIfDoctor = async (email: string) => {
    try {
      const q = query(collection(db, 'doctors'), where('email', '==', email));
      const snap = await getDocs(q);
      return !snap.empty ? snap.docs[0].data() : null;
    } catch {
      return null;
    }
  };

  const checkIfAdmin = async (email: string) => {
    try {
      const q = query(collection(db, 'admins'), where('email', '==', email));
      const snap = await getDocs(q);
      return !snap.empty ? snap.docs[0].data() : null;
    } catch {
      return null;
    }
  };

  const getAdminProfile = async (uid: string) => {
    const adminSnapshot = await getDoc(doc(db, 'admins', uid));
    const adminData = adminSnapshot.data();
    return adminData?.role === 'admin' ? adminData : null;
  };

  // 1. Admin Login Portal
  if (isExplicitAdminRoute && !staffAuthenticated) {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-900 bg-cover bg-center p-6"
        style={{ backgroundImage: "url('https://i.pinimg.com/1200x/af/b6/05/afb605d20bae30bb5f1886ee8464078e.jpg')" }}
      >
        <div className="pointer-events-none absolute inset-0 bg-slate-950/35" />
        <div className="relative w-full max-w-md space-y-6 rounded-3xl border border-white/20 bg-slate-900/55 p-8 text-center shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
          <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/10 shadow-inner">
            <img src={logo} alt="OmniQueue Health logo" className="h-full w-full object-contain" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-wide">Admin Portal Login</h2>
          <form onSubmit={async (e: React.FormEvent) => { 
            e.preventDefault(); 
            try {
              const userCredential = await signInWithEmailAndPassword(auth, adminInput, adminPass);
              const userEmail = userCredential.user.email || adminInput;

              const isDoctor = await checkIfDoctor(userEmail);
              if (isDoctor) {
                showAppNotice('error', 'Access denied: Doctor accounts cannot access the Admin Portal.');
                await signOut(auth);
                return;
              }

              const adminData = await getAdminProfile(userCredential.user.uid);
              if (adminData) {
                setStaffAuthenticated(true); 
                setCurrentUser({ role: 'admin', name: adminData.fullName || 'System Administrator', email: userEmail, uid: userCredential.user.uid }); 
              } else {
                showAppNotice(
                  'error',
                  `Access denied: Add an admin profile with role "admin" at /admins/${userCredential.user.uid} to match the current Firestore security rules.`,
                );
                await signOut(auth);
              }
            } catch (err: unknown) {
              showAppNotice('error', `Admin login failed: ${getErrorMessage(err)}`);
            }
          }} className="space-y-4">
            <input type="email" required placeholder="Admin Email Address" value={adminInput} onChange={(e) => setAdminInput(e.target.value)} className="w-full rounded-2xl border border-white/20 bg-white/10 p-3.5 text-sm text-white placeholder-slate-300 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/70" />
            <input type="password" required placeholder="Password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} className="w-full rounded-2xl border border-white/20 bg-white/10 p-3.5 text-sm text-white placeholder-slate-300 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/70" />
            <button type="submit" className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-lg transition duration-200">Login as Admin</button>
          </form>
        </div>
      </div>
    );
  }

  // Room staff portal
  if (isExplicitRoomRoute && !staffAuthenticated) {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-900 bg-cover bg-center p-6"
        style={{ backgroundImage: "url('https://i.pinimg.com/1200x/af/b6/05/afb605d20bae30bb5f1886ee8464078e.jpg')" }}
      >
        <div className="pointer-events-none absolute inset-0 bg-slate-950/35" />
        <div className="relative w-full max-w-md space-y-6 rounded-3xl border border-white/20 bg-slate-900/55 p-8 text-center shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-white/10 text-emerald-300 shadow-inner">
            <DoorOpen className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold tracking-wide text-white">Room Portal Login</h2>
          <form onSubmit={async (event: React.FormEvent) => {
            event.preventDefault();
            try {
              const credentials = await signInWithEmailAndPassword(auth, roomInput, roomPass);
              const roomSnapshot = await getDoc(doc(db, 'rooms', credentials.user.uid));
              const roomData = roomSnapshot.data();
              if (!roomSnapshot.exists() || roomData?.role !== 'room') {
                showAppNotice('error', 'Access denied: this account is not registered as Room staff.');
                await signOut(auth);
                return;
              }

              const email = credentials.user.email || roomInput;
              setStaffAuthenticated(true);
              setCurrentUser({
                role: 'room',
                name: typeof roomData.roomName === 'string'
                  ? roomData.roomName
                  : typeof roomData.fullName === 'string'
                    ? roomData.fullName
                    : 'Room Staff',
                email,
                uid: credentials.user.uid,
              });
            } catch (error) {
              const errorCode = typeof error === 'object' && error !== null && 'code' in error
                ? String(error.code)
                : '';
              if (errorCode === 'permission-denied') {
                await signOut(auth);
                alert(
                  'Firebase Authentication accepted this login, but Firestore denied access to /rooms/{your-auth-uid}. ' +
                  'In Firebase Console, select the same project as the app, open Firestore Database > Rules, ' +
                  'publish the /rooms rule from firebaseRuling.txt, and confirm a room profile exists at /rooms/{the user Auth UID} with role "room".',
                );
                return;
              }

              showAppNotice(
                'error',
                `Room login failed: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }} className="space-y-4">
            <input
              type="email"
              required
              placeholder="Room staff email"
              value={roomInput}
              onChange={(event) => setRoomInput(event.target.value)}
              className="w-full rounded-2xl border border-white/20 bg-white/10 p-3.5 text-sm text-white outline-none placeholder:text-slate-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/70"
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={roomPass}
              onChange={(event) => setRoomPass(event.target.value)}
              className="w-full rounded-2xl border border-white/20 bg-white/10 p-3.5 text-sm text-white outline-none placeholder:text-slate-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/70"
            />
            <button type="submit" className="w-full rounded-2xl bg-emerald-600 py-3.5 font-bold text-white shadow-lg transition hover:bg-emerald-500">
              Sign in to Room Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. Doctor Login Portal
  if (isExplicitDoctorRoute && !staffAuthenticated) {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-900 bg-cover bg-center p-6"
        style={{ backgroundImage: "url('https://i.pinimg.com/1200x/af/b6/05/afb605d20bae30bb5f1886ee8464078e.jpg')" }}
      >
        <div className="pointer-events-none absolute inset-0 bg-slate-950/35" />
        <div className="relative w-full max-w-md space-y-6 rounded-3xl border border-white/20 bg-slate-900/55 p-8 text-center shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-white/10 text-teal-300 shadow-inner">
            <Stethoscope className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-wide">Doctor Portal Login</h2>
          <form onSubmit={async (e: React.FormEvent) => {
            e.preventDefault();
            try {
              const userCredential = await signInWithEmailAndPassword(auth, doctorInput, doctorPass);
              const userEmail = userCredential.user.email || doctorInput;
              const docData = await checkIfDoctor(userEmail);
              
              if (docData) {
                await ensureDoctorProfileAtAuthUid(
                  userCredential.user.uid,
                  userEmail,
                  docData,
                );
                setStaffAuthenticated(true);
                setCurrentUser({
                  role: 'doctor',
                  name: docData.fullName || 'Doctor',
                  email: userEmail,
                  uid: userCredential.user.uid,
                });
              } else {
                showAppNotice('error', 'Access denied: This account is not registered as a doctor.');
                await signOut(auth);
              }
            } catch (err: unknown) {
              showAppNotice('error', `Doctor login failed: ${getErrorMessage(err)}`);
            }
          }} className="space-y-4">
            <input type="email" required placeholder="Doctor Email Address" value={doctorInput} onChange={(e) => setDoctorInput(e.target.value)} className="w-full rounded-2xl border border-white/20 bg-white/10 p-3.5 text-sm text-white placeholder-slate-300 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/70" />
            <input type="password" required placeholder="Password" value={doctorPass} onChange={(e) => setDoctorPass(e.target.value)} className="w-full rounded-2xl border border-white/20 bg-white/10 p-3.5 text-sm text-white placeholder-slate-300 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/70" />
            <button type="submit" className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-lg transition duration-200">Login as Doctor</button>
          </form>
        </div>
      </div>
    );
  }

  // 3. Patient Login View
  if (!currentUser) {
    // Default Login View with existing patient login & validation
    return (
      <LoginView
        isLoggingIn={isLoggingIn}
        onLogin={async (_e: React.FormEvent, credentials?: { email: string; pass: string }) => {
          if (!credentials?.email || !credentials?.pass) return;
          setIsLoggingIn(true);
          try {
            const userCredential = await signInWithEmailAndPassword(auth, credentials.email, credentials.pass);
            const userEmail = userCredential.user.email || credentials.email;

            const isDoctor = await checkIfDoctor(userEmail);
            const isAdmin = await checkIfAdmin(userEmail);

            if (isDoctor || isAdmin) {
              showAppNotice('error', 'Access denied: Staff accounts cannot log in through the Patient Portal.');
              await signOut(auth);
              setIsLoggingIn(false);
              return;
            }

            const patientRecord = await ensurePatientProfileRecord({
              uid: userCredential.user.uid,
              email: userEmail,
              displayName: userCredential.user.displayName,
              phone: userCredential.user.phoneNumber,
            });

            if (!patientRecord) {
              throw new Error('Unable to create patient profile for this account.');
            }

            setCurrentUser({
              role: 'patient',
              name: patientRecord.fullName,
              email: patientRecord.email,
              uid: patientRecord.uid,
              accountNo: patientRecord.accountNo,
            });
          } catch (err: unknown) {
            showAppNotice('error', `Patient login failed: ${getErrorMessage(err)}`);
          } finally {
            setIsLoggingIn(false);
          }
        }}
        onRegister={(newUserData) =>
          savePatientProfile(
            newUserData.uid,
            newUserData.fullName,
            newUserData.email,
            newUserData.phone
          )
        }
        onGoogleSuccess={async (user) => {
          const userEmail = user?.email || '';
          const isDoctor = await checkIfDoctor(userEmail);
          const isAdmin = await checkIfAdmin(userEmail);

          if (isDoctor || isAdmin) {
            showAppNotice('error', 'Access denied: Staff accounts cannot access the Patient Portal via Google login.');
            await signOut(auth);
            return;
          }

          const patientRecord = await ensurePatientProfileRecord({
            uid: user?.uid || '',
            email: userEmail,
            displayName: user?.displayName,
            phone: user?.phoneNumber,
          });

          if (!patientRecord) {
            showAppNotice('error', 'Unable to initialize patient profile for this Google account.');
            return;
          }

          setCurrentUser({
            role: 'patient',
            name: patientRecord.fullName,
            email: patientRecord.email,
            uid: patientRecord.uid,
            accountNo: patientRecord.accountNo,
          });
        }}
      />
    );
  }

  // 4. Admin Dashboard
  if (currentUser.role === 'admin') {
    return (
      <>
      <AdminLayout activeTab={adminTab} setActiveTab={setAdminTab} adminName={currentUser.name} onLogout={() => { setStaffAuthenticated(false); setCurrentUser(null); window.history.pushState({}, '', '/'); }}>
        {adminTab === 'queue' && (
          <div className="space-y-6">
            <AdminDashboard queue={activeQueue} cancelledCount={cancelledCount} />
            
            {/* Live Queue Table with Cancel/Remove Option for Admin */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-800 text-lg mb-4">Manage Active Queue</h3>
              {activeQueue.length === 0 ? (
                <p className="text-slate-400 text-sm">No patients currently in queue.</p>
              ) : (
                <div className="space-y-2">
                  {activeQueue.map((p, idx) => (
                    <div 
                      key={p.accountNo} 
                      className={`p-4 rounded-2xl border flex items-center justify-between ${
                        p.isEmergency ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="font-bold text-slate-800">{p.fullName}</p>
                          {p.isEmergency && (
                            <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-extrabold rounded-full uppercase">
                              Emergency
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-mono"> ID: {p.accountNo}</p>
                        {p.traumaType && (
                          <p className="mt-1 text-xs font-semibold text-red-700">
                            {p.traumaType}
                            {p.traumaLevel ? ` · Trauma Level ${p.traumaLevel}` : ''}
                          </p>
                        )}
                        {p.traumaSpecification && (
                          <p className="mt-1 text-xs text-slate-600">
                            Details: {p.traumaSpecification}
                          </p>
                        )}
                        {p.room && (
                          <p className="mt-0.5 text-xs font-semibold text-emerald-700">{p.room}</p>
                        )}
                      </div>

                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-bold px-3 py-1 bg-emerald-100 text-[#1b7a57] rounded-full">
                          Position #{idx + 1}
                        </span>
                        
                        {/* ADMIN CANCEL QUEUE BUTTON */}
                        <button
                          onClick={async () => {
                            const accepted = await confirmInUi({
                              title: 'Remove patient from queue?',
                              message: `Are you sure you want to remove ${p.fullName} from the queue?`,
                              confirmLabel: 'Remove patient',
                              destructive: true,
                            });
                            if (accepted) {
                              try {
                                await removeFromQueue(p.accountNo);
                                setCancelledCount((count) => count + 1);
                                showAppNotice('success', `${p.fullName} removed from the queue.`);
                              } catch (err: unknown) {
                                showAppNotice('error', `Error removing from queue: ${getErrorMessage(err)}`);
                              }
                            }
                          }}
                          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-xl text-xs flex items-center space-x-1 transition shadow-sm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Cancel Queue</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        
        {adminTab === 'addQueue' && (
          <div className="max-w-xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-6">
            <div className="flex items-center space-x-3 text-red-600 border-b pb-3">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-lg text-slate-800">Emergency & Priority Queue Insertion</h3>
            </div>
            <form onSubmit={async (e: React.FormEvent) => {
              e.preventDefault();
              if (
                !emergencyName.trim() ||
                !emergencyAccountNo.trim() ||
                !selectedEmergencyRoute ||
                (requiresEmergencySpecification && !emergencySpecification.trim())
              ) return;
              try {
                await addPatientToQueue(
                  emergencyName.trim(),
                  emergencyAccountNo.trim(),
                  true,
                  selectedEmergencyRoute,
                  emergencySpecification.trim()
                );
                const levelText = selectedEmergencyRoute.level
                  ? `Trauma Level ${selectedEmergencyRoute.level}`
                  : 'priority level not configured';
                showAppNotice(
                  'success',
                  `Emergency patient ${emergencyName.trim()} added with ${levelText} and assigned to ${getEmergencyDestination(selectedEmergencyRoute.room)}.`,
                );
                setEmergencyName('');
                setEmergencyAccountNo('');
                setEmergencyTraumaType('');
                setEmergencyRouteSearch('');
                setEmergencyRouteListOpen(false);
                setEmergencySpecification('');
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                showAppNotice('error', `Error adding emergency patient: ${message}`);
              }
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Patient Full Name</label>
                <input type="text" required value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} placeholder="e.g. John Emergency" className="w-full p-3 bg-slate-50 border rounded-2xl outline-none focus:ring-2 focus:ring-emerald-600" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Account Number</label>
                <input type="text" required value={emergencyAccountNo} onChange={(e) => setEmergencyAccountNo(e.target.value)} placeholder="e.g. PTNT-EMER-01" className="w-full p-3 bg-slate-50 border rounded-2xl outline-none focus:ring-2 focus:ring-emerald-600" />
              </div>
              <div>
                <label htmlFor="emergency-trauma-type" className="mb-1 block text-sm font-semibold text-slate-700">
                  Trauma Type
                </label>
                <input
                  id="emergency-trauma-type"
                  ref={emergencyRouteInputRef}
                  type="text"
                  required
                  disabled={emergencyRoutesLoading || Boolean(emergencyRoutesError)}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={emergencyRouteListOpen && filteredEmergencyRoutes.length > 0}
                  aria-controls="emergency-trauma-options"
                  aria-activedescendant={
                    emergencyRouteListOpen && filteredEmergencyRoutes.length > 0
                      ? `emergency-route-option-${activeEmergencyRouteIndex}`
                      : undefined
                  }
                  autoComplete="off"
                  value={emergencyRouteSearch}
                  placeholder={emergencyRoutesLoading ? 'Loading emergency routes...' : 'Search emergency types...'}
                  onFocus={() => setEmergencyRouteListOpen(true)}
                  onChange={(e) => {
                    setEmergencyTraumaType('');
                    setEmergencyRouteSearch(e.target.value);
                    setEmergencyRouteListOpen(true);
                    setActiveEmergencyRouteIndex(0);
                    e.currentTarget.setCustomValidity('');
                    setEmergencySpecification('');
                  }}
                  onInvalid={(e) => {
                    if (!selectedEmergencyRoute) {
                      e.currentTarget.setCustomValidity('Select an emergency type from the search results.');
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && filteredEmergencyRoutes.length > 0) {
                      e.preventDefault();
                      setEmergencyRouteListOpen(true);
                      setActiveEmergencyRouteIndex((index) =>
                        Math.min(index + 1, filteredEmergencyRoutes.length - 1)
                      );
                    } else if (e.key === 'ArrowUp' && filteredEmergencyRoutes.length > 0) {
                      e.preventDefault();
                      setEmergencyRouteListOpen(true);
                      setActiveEmergencyRouteIndex((index) => Math.max(index - 1, 0));
                    } else if (
                      e.key === 'Enter' &&
                      emergencyRouteListOpen &&
                      filteredEmergencyRoutes.length > 0
                    ) {
                      e.preventDefault();
                      const route = filteredEmergencyRoutes[activeEmergencyRouteIndex];
                      setEmergencyTraumaType(route.id);
                      setEmergencyRouteSearch(route.symptom);
                      setEmergencyRouteListOpen(false);
                      emergencyRouteInputRef.current?.setCustomValidity('');
                      setEmergencySpecification('');
                    } else if (e.key === 'Escape') {
                      setEmergencyRouteListOpen(false);
                    }
                  }}
                  className="w-full rounded-2xl border bg-slate-50 p-3 outline-none focus:ring-2 focus:ring-emerald-600"
                />
                {emergencyRouteListOpen && filteredEmergencyRoutes.length > 0 && (
                  <ul
                    id="emergency-trauma-options"
                    role="listbox"
                    className="mt-1 max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg"
                  >
                    {filteredEmergencyRoutes.map((route, index) => (
                      <li
                        key={route.id}
                        id={`emergency-route-option-${index}`}
                        role="option"
                        aria-selected={route.id === emergencyTraumaType}
                      >
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setEmergencyTraumaType(route.id);
                            setEmergencyRouteSearch(route.symptom);
                            setEmergencyRouteListOpen(false);
                            emergencyRouteInputRef.current?.setCustomValidity('');
                            setEmergencySpecification('');
                          }}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-emerald-50 ${
                            index === activeEmergencyRouteIndex ? 'bg-emerald-50' : ''
                          }`}
                        >
                          {route.symptom}{route.level ? ` — Level ${route.level}` : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {emergencyRoutesError && (
                  <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
                    Could not load emergency routes from Firestore: {emergencyRoutesError}
                  </p>
                )}
                {!emergencyRoutesLoading && !emergencyRoutesError && emergencyRoutes.length === 0 && (
                  <p role="alert" className="mt-2 text-sm font-semibold text-amber-700">
                    No valid emergency routes found in <code>er_routing</code>. Add documents with non-empty
                    <code> symptom</code> and <code>room</code> fields.
                  </p>
                )}
                {invalidEmergencyRouteIds.length > 0 && (
                  <p role="alert" className="mt-2 text-sm text-amber-700">
                    Some <code>er_routing</code> documents are missing a valid symptom or room and were skipped:
                    {' '}{invalidEmergencyRouteIds.join(', ')}.
                  </p>
                )}
                {selectedEmergencyRoute && (
                  <p className="mt-2 text-sm font-semibold text-red-700">
                    {selectedEmergencyRoute.level
                      ? `Trauma Level ${selectedEmergencyRoute.level}`
                      : 'Trauma level not configured'}
                    {' · '}Automatically assigned room: {selectedEmergencyRoute.room}
                  </p>
                )}
                {requiresEmergencySpecification && (
                  <div className="mt-3">
                    <label htmlFor="emergency-specification" className="mb-1 block text-sm font-semibold text-slate-700">
                      Specify emergency
                    </label>
                    <textarea
                      id="emergency-specification"
                      required
                      rows={3}
                      value={emergencySpecification}
                      onChange={(e) => setEmergencySpecification(e.target.value)}
                      placeholder="Describe the emergency so clinical staff can assign the appropriate treatment room."
                      className="w-full rounded-2xl border bg-slate-50 p-3 outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Other emergencies are routed to triage for manual room assignment.
                    </p>
                  </div>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Levels set queue priority by selected type; they do not replace clinical assessment.
                </p>
              </div>
              <button type="submit" className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow transition">
                Add Emergency Patient (Max-Heap Priority)
              </button>
            </form>
          </div>
        )}
          {adminTab === 'addAppoint' && (
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-4">
            <h3 className="font-bold text-slate-800 text-lg mb-4">Patient Appointment Requests</h3>
            {appointmentsError && (
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                Could not load appointment requests: {appointmentsError} Check that this admin has a profile at
                {' '}/admins/{currentUser.uid} with role "admin", and that the latest Firestore rules are published.
              </p>
            )}
            {[
              {
                title: 'Today',
                requests: appointments.filter((appointment) => appointment.date === todayStr),
              },
              {
                title: 'Upcoming',
                requests: appointments.filter((appointment) => appointment.date > todayStr),
              },
              {
                title: 'Past / Other Requests',
                requests: appointments.filter((appointment) => !appointment.date || appointment.date < todayStr),
              },
            ].map(({ title, requests }) => (
              <section key={title} className="space-y-3">
                <h4 className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm font-bold text-slate-700">
                  <span>{title}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{requests.length}</span>
                </h4>
                {requests.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-400">
                    No {title.toLowerCase()} appointment requests.
                  </p>
                ) : requests.map((appt: AppointmentRequest) => (
                <div key={appt.id} className="p-4 bg-slate-50 rounded-2xl border flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-800">{appt.patientName} ({appt.accountNo})</p>
                    <p className="text-xs text-slate-500">{appt.serviceType} on {appt.date} at {appt.timeSlot}</p>
                    {appt.doctorName && (
                      <p className="text-xs font-bold text-teal-700 mt-1">Assigned Doctor: {appt.doctorName}</p>
                    )}
                    {appt.room && (
                      <p className="text-xs font-semibold text-emerald-700 mt-0.5">📍 Room/Lab: {appt.room}</p>
                    )}
                    <p className={`text-xs font-bold mt-1 uppercase ${
                      appt.status === 'confirmed' ? 'text-emerald-600' : appt.status === 'pending' ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      Status: {appt.status}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    {appt.status === 'pending' && (
                      <>
                        {/* Doctor Dropdown Selection */}
                        <select
                          value={selectedDoctors[appt.id!] || ''}
                          onChange={(e) => setSelectedDoctors({ ...selectedDoctors, [appt.id!]: e.target.value })}
                          className="p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-[#1b7a57]"
                        >
                          <option value="">Select Doctor...</option>
                          {registeredDoctors.map((doc) => (
                            <option key={doc.id || doc.email} value={doc.fullName}>
                              {doc.fullName} ({doc.specialty})
                            </option>
                          ))}
                        </select>

                        {/* Approve & Assign Button with Automatic Room Assignment */}
                        <button 
                          onClick={async () => {
                            const assignedDocName = selectedDoctors[appt.id!];
                            if (!assignedDocName) {
                              showAppNotice('info', 'Please select a doctor to assign to this appointment.');
                              return;
                            }

                            // Automatic room assignment based on service type
                            let assignedRoom = "General Consultation Room 3";
                            const service = (appt.serviceType || "").toLowerCase();
                            
                            if (service.includes('cardio') || service.includes('ecg')) {
                              assignedRoom = "Cardio Lab (Room 204)";
                            } else if (service.includes('x-ray') || service.includes('imaging') || service.includes('scan')) {
                              assignedRoom = "Radiology & X-Ray Lab";
                            } else if (service.includes('blood') || service.includes('lab') || service.includes('test')) {
                              assignedRoom = "Main Pathology & Blood Laboratory";
                            } else if (service.includes('dental') || service.includes('tooth')) {
                              assignedRoom = "Dental Clinic (Room 102)";
                            }

                            try {
                              await updateAppointmentStatus(appt.id!, 'confirmed', {
                                doctorId: assignedDocName,
                                doctorName: assignedDocName,
                                room: assignedRoom
                              });
                              showAppNotice(
                                'success',
                                `Appointment approved! Assigned to ${assignedDocName} at ${assignedRoom}.`,
                              );
                            } catch (error) {
                              showAppNotice('error', `Error approving appointment: ${getErrorMessage(error)}`);
                            }
                          }}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-sm"
                        >
                          Approve & Assign
                        </button>
                      </>
                    )}

                    <button 
                      onClick={async () => {
                        const accepted = await confirmInUi({
                          title: 'Cancel appointment?',
                          message: `Are you sure you want to cancel the appointment for ${appt.patientName}?`,
                          confirmLabel: 'Cancel appointment',
                          destructive: true,
                        });
                        if (accepted) {
                          try {
                            if (appt.id) {
                              await updateAppointmentStatus(appt.id, 'cancelled');
                              setCancelledCount((count) => count + 1);
                              showAppNotice('success', 'Appointment cancelled successfully.');
                            }
                          } catch (err: unknown) {
                            showAppNotice('error', `Error deleting appointment: ${getErrorMessage(err)}`);
                          }
                        }
                      }}
                      className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-xl text-xs transition shadow-sm"
                    >
                      Cancel / Delete
                    </button>
                  </div>
                </div>
                ))}
              </section>
            ))}
          </div>
        )}

        {adminTab === 'addDoctor' && (
          <div className="max-w-xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-6">
            <div className="flex items-center space-x-3 text-[#1b7a57] border-b pb-3">
              <Stethoscope className="w-6 h-6" />
              <h3 className="font-bold text-lg text-slate-800">Register New Doctor Account</h3>
            </div>
            
            <form onSubmit={async (e: React.FormEvent) => {
              e.preventDefault();
              try {
                await createDoctorAccount(docEmail, docPassword, docName, docSpecialty);
                showAppNotice('success', `Doctor account for ${docName} created successfully.`);
                setDocName('');
                setDocEmail('');
                setDocSpecialty('');
                setDocSpecialtySearch('');
                setDocPassword('');
                setShowDoctorPassword(false);
              } catch (error: unknown) {
                showAppNotice('error', `Error creating doctor account: ${getErrorMessage(error)}`);
              }
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Doctor Full Name</label>
                <input type="text" required value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="e.g. Dr. Sarah Jenkins" className="w-full p-3 bg-slate-50 border rounded-2xl outline-none focus:ring-2 focus:ring-[#1b7a57]" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address / Login ID</label>
                <input type="email" required value={docEmail} onChange={(e) => setDocEmail(e.target.value)} placeholder="e.g. drjenkins@hospital.com" className="w-full p-3 bg-slate-50 border rounded-2xl outline-none focus:ring-2 focus:ring-[#1b7a57]" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Specialization</label>
                <input
                  type="search"
                  required={!docSpecialty}
                  value={docSpecialtySearch}
                  onChange={(e) => {
                    setDocSpecialtySearch(e.target.value);
                    if (docSpecialty) setDocSpecialty('');
                  }}
                  aria-label="Search medical specializations"
                  aria-describedby="doctor-specialty-results"
                  placeholder="Type to search, e.g. cardiologist or heart"
                  className="w-full rounded-2xl border bg-slate-50 p-3 outline-none focus:ring-2 focus:ring-[#1b7a57]"
                />
                <div
                  id="doctor-specialty-results"
                  className="mt-2 max-h-64 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3"
                >
                  {filteredDoctorSpecialtyGroups.length > 0 ? (
                    filteredDoctorSpecialtyGroups.map((group) => (
                      <div key={group.category}>
                        <p className="py-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                          {group.category}
                        </p>
                        <div className="mt-1 space-y-1">
                          {group.specialties.map(([specialty, description]) => (
                            <button
                              key={specialty}
                              type="button"
                              aria-pressed={docSpecialty === specialty}
                              onClick={() => {
                                setDocSpecialty(specialty);
                                setDocSpecialtySearch(specialty);
                              }}
                              className={`w-full rounded-xl p-2.5 text-left transition ${
                                docSpecialty === specialty
                                  ? 'bg-emerald-50 ring-1 ring-emerald-300'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <span className="block text-sm font-semibold text-slate-800">{specialty}</span>
                              <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="p-2 text-sm text-slate-500">No matching specialization. Try a specialty name or related term.</p>
                  )}
                </div>
                {docSpecialty && (
                  <p className="mt-2 text-sm font-semibold text-emerald-700" aria-live="polite">
                    Selected: {docSpecialty} — {doctorSpecialtyDescriptions.get(docSpecialty)}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="doctor-account-password" className="mb-1 block text-sm font-semibold text-slate-700">Password</label>
                <div className="relative">
                  <input
                    id="doctor-account-password"
                    type={showDoctorPassword ? 'text' : 'password'}
                    required
                    value={docPassword}
                    onChange={(e) => setDocPassword(e.target.value)}
                    placeholder="Enter doctor password"
                    className="w-full rounded-2xl border bg-slate-50 p-3 pr-12 outline-none focus:ring-2 focus:ring-[#1b7a57]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDoctorPassword((visible) => !visible)}
                    aria-label={showDoctorPassword ? 'Hide doctor password' : 'Show doctor password'}
                    aria-pressed={showDoctorPassword}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-2xl text-slate-500 hover:text-[#1b7a57] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#1b7a57]"
                  >
                    {showDoctorPassword
                      ? <EyeOff className="h-5 w-5" aria-hidden="true" />
                      : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <button type="submit" className="w-full py-3.5 bg-[#1b7a57] hover:bg-emerald-700 text-white font-bold rounded-2xl shadow transition">
                Create Doctor Account
              </button>
            </form>
          </div>
        )}

        {adminTab === 'addRoom' && (
          <div className="mx-auto max-w-xl space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex items-center space-x-3 border-b pb-3 text-[#1b7a57]">
              <DoorOpen className="h-6 w-6" />
              <h3 className="text-lg font-bold text-slate-800">Register Room Staff Account</h3>
            </div>
            <form onSubmit={async (event: React.FormEvent) => {
              event.preventDefault();
              try {
                await createRoomAccount(roomEmail, roomPassword, roomName);
                showAppNotice(
                  'success',
                  `Room staff account for ${roomName} created successfully. Sign in at /room.`,
                );
                setRoomName('');
                setRoomEmail('');
                setRoomPassword('');
                setShowRoomPassword(false);
              } catch (error) {
                showAppNotice(
                  'error',
                  `Error creating Room staff account: ${error instanceof Error ? error.message : String(error)}`,
                );
              }
            }} className="space-y-4">
              <div>
                <label htmlFor="room-destination" className="mb-1 block text-sm font-semibold text-slate-700">Room / Department</label>
                <select
                  id="room-destination"
                  required
                  value={roomName}
                  onChange={(event) => {
                    const destination = roomDestinations.find((room) => room.name === event.target.value);
                    setRoomName(destination?.name || '');
                  }}
                  className="w-full rounded-2xl border bg-slate-50 p-3 outline-none focus:ring-2 focus:ring-[#1b7a57]"
                >
                  <option value="" disabled>Select a Room or Department</option>
                  <optgroup label="Emergency destinations">
                    {roomDestinations.filter((room) => room.emergency).map((room) => (
                      <option key={room.name} value={room.name}>{room.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Clinics, units, and wards">
                    {roomDestinations.filter((room) => !room.emergency).map((room) => (
                      <option key={room.name} value={room.name}>{room.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Room login email</label>
                <input
                  type="email"
                  required
                  value={roomEmail}
                  onChange={(event) => setRoomEmail(event.target.value)}
                  placeholder="Select a Room or Department above"
                  className="w-full rounded-2xl border bg-slate-50 p-3 outline-none focus:ring-2 focus:ring-[#1b7a57]"
                />
                <p className="mt-1 text-xs text-slate-500">Enter the existing Firebase Authentication email and its current password to link this account to the selected room. Credentials are not stored in the profile document.</p>
              </div>
              <div>
                <label htmlFor="room-account-password" className="mb-1 block text-sm font-semibold text-slate-700">Password</label>
                <div className="relative">
                  <input
                    id="room-account-password"
                    type={showRoomPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={roomPassword}
                    onChange={(event) => setRoomPassword(event.target.value)}
                    placeholder="Set password (at least 6 characters)"
                    className="w-full rounded-2xl border bg-slate-50 p-3 pr-12 outline-none focus:ring-2 focus:ring-[#1b7a57]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRoomPassword((visible) => !visible)}
                    aria-label={showRoomPassword ? 'Hide Room password' : 'Show Room password'}
                    aria-pressed={showRoomPassword}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-2xl text-slate-500 hover:text-[#1b7a57] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#1b7a57]"
                  >
                    {showRoomPassword
                      ? <EyeOff className="h-5 w-5" aria-hidden="true" />
                      : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <button type="submit" className="w-full rounded-2xl bg-[#1b7a57] py-3.5 font-bold text-white shadow transition hover:bg-emerald-700">
                Create Room Account
              </button>
            </form>
          </div>
        )}

        {adminTab === 'progress' && <ProgressUpdate />}
        {adminTab === 'emergencyProfiles' && (
          <AdminEmergencyPatientProfiles onNotify={showAppNotice} />
        )}
        {adminTab === 'emergencyProcedures' && currentUser.uid && (
          <EmergencyProtocolManager routes={emergencyRoutes} adminUid={currentUser.uid} />
        )}
        {adminTab === 'records' && (
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 text-lg mb-4">Patient Records & Directory</h3>
            <p className="text-sm text-slate-500">All registered system user records are searchable here.</p>
          </div>
        )}
      </AdminLayout>
      </>
    );
  }

  if (currentUser.role === 'room') {
    const roomDestination = roomDestinations.find((destination) => destination.name === currentUser.name);
    const showEmergencyQueue = roomDestination?.emergency === true;

    return (
      <RoomLayout
        activeTab={roomTab}
        setActiveTab={setRoomTab}
        roomName={currentUser.name}
        showEmergencyQueue={showEmergencyQueue}
        showPatientRecords={!showEmergencyQueue}
        onLogout={() => {
          void signOut(auth);
          setStaffAuthenticated(false);
          setCurrentUser(null);
          window.history.pushState({}, '', '/room');
        }}
      >
        {roomTab === 'emergency' && showEmergencyQueue && (
          <RoomEmergencyQueue roomName={currentUser.name} queue={liveQueue} />
        )}
        {roomTab === 'progress' && showEmergencyQueue && (
          <EmergencyPatientProgress roomName={currentUser.name} queue={liveQueue} routes={emergencyRoutes} />
        )}
        {roomTab === 'progress' && !showEmergencyQueue && <ProgressUpdate staffRole="room" />}
        {roomTab === 'records' && !showEmergencyQueue && (
          <DoctorPatientRecords
            doctorId={currentUser.uid || ''}
            doctorName={currentUser.name}
            staffRole="room"
          />
        )}
      </RoomLayout>
    );
  }

  // 5. Doctor Dashboard
  if (currentUser.role === 'doctor') {
    return (
      <DoctorLayout activeTab={doctorTab} setActiveTab={setDoctorTab} doctorName={currentUser.name} onLogout={() => { setStaffAuthenticated(false); setCurrentUser(null); window.history.pushState({}, '', '/'); }}>
        {doctorTab === 'queue' && (
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 text-lg mb-4">Doctor's Live Queue </h3>
            {activeQueue.length === 0 ? (
              <p className="text-slate-400 text-sm">No patients currently in consultation queue.</p>
            ) : (
              activeQueue.map((p, i) => (
                <div 
                  key={p.accountNo} 
                  className={`p-4 mb-3 rounded-2xl flex justify-between items-center border shadow-sm ${
                    p.isEmergency ? 'bg-red-50 border-red-200 text-red-900' : 'bg-slate-50 border-slate-100 text-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className="font-bold text-base">{p.fullName}</p>
                      {p.isEmergency && (
                        <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-extrabold rounded-full uppercase">
                          Emergency
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-0.5"> ID: {p.accountNo}</p>
                    {p.traumaType && (
                      <p className="mt-1 text-xs font-semibold text-red-700">
                        {p.traumaType}
                        {p.traumaLevel ? ` · Trauma Level ${p.traumaLevel}` : ''}
                      </p>
                    )}
                    {p.traumaSpecification && (
                      <p className="mt-1 text-xs text-slate-600">
                        Details: {p.traumaSpecification}
                      </p>
                    )}
                    {p.room && (
                      <p className="mt-0.5 text-xs font-semibold text-emerald-700">{p.room}</p>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <span className={`font-extrabold px-3 py-1 rounded-full text-xs ${p.isEmergency ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-[#1b7a57]'}`}>
                      Position #{i + 1}
                    </span>
                    
                    {/* DOCTOR "FINISH / DONE" BUTTON */}
                    <button
                      onClick={async () => {
                        const accepted = await confirmInUi({
                          title: 'Finish consultation?',
                          message: `Mark consultation as finished for ${p.fullName}?`,
                          confirmLabel: 'Finish consultation',
                        });
                        if (accepted) {
                          try {
                            await removeFromQueue(p.accountNo);
                            showAppNotice('success', `Consultation completed for ${p.fullName}.`);
                          } catch (err: unknown) {
                            showAppNotice('error', `Error finishing consultation: ${getErrorMessage(err)}`);
                          }
                        }
                      }}
                      className="px-3.5 py-2 bg-[#1b7a57] hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 transition shadow-sm"
                      title="Mark as Finished / Done"
                    >
                      <Check className="w-4 h-4" />
                      <span>Finish / Done</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        {doctorTab === 'progress' && <DoctorProgressUpdate doctorName={currentUser.name} />}
        {doctorTab === 'records' && (
          <DoctorPatientRecords
            doctorId={currentUser.uid || currentUser.email || currentUser.name}
            doctorName={currentUser.name}
          />
        )}
        {doctorTab === 'appointment' && (
          <div className="min-w-0 space-y-5 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:space-y-6 sm:p-6">
            <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center space-x-2 text-lg font-bold text-slate-800">
                  <CalendarIcon className="h-5 w-5 text-[#1b7a57]" />
                  <span>Doctor Appointment Calendar</span>
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Live appointments assigned to you ({currentUser.name}).
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() =>
                      setDoctorSelectedDate(
                        new Date(
                          doctorSelectedDate.getFullYear(),
                          doctorSelectedDate.getMonth() - 1,
                          1
                        )
                      )
                    }
                    className="rounded-xl bg-slate-100 p-2 transition hover:bg-slate-200"
                  >
                    <ChevronLeft className="h-4 w-4 text-slate-700" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    onClick={() =>
                      setDoctorSelectedDate(
                        new Date(
                          doctorSelectedDate.getFullYear(),
                          doctorSelectedDate.getMonth() + 1,
                          1
                        )
                      )
                    }
                    className="rounded-xl bg-slate-100 p-2 transition hover:bg-slate-200"
                  >
                    <ChevronRight className="h-4 w-4 text-slate-700" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDoctorSelectedDate(new Date())}
                    className="rounded-xl bg-[#1b7a57] px-3 py-2 text-xs font-bold text-white shadow"
                  >
                    Today
                  </button>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-[#1b7a57]">
                  {doctorDisplayedMonth}
                </span>
              </div>
            </div>

            <div>
              <div className="grid grid-cols-7 gap-1 py-1 text-center text-[10px] font-bold text-slate-400 sm:gap-2 sm:text-xs">
                <span><span className="sm:hidden">M</span><span className="hidden sm:inline">Mon</span></span>
                <span><span className="sm:hidden">T</span><span className="hidden sm:inline">Tue</span></span>
                <span><span className="sm:hidden">W</span><span className="hidden sm:inline">Wed</span></span>
                <span><span className="sm:hidden">T</span><span className="hidden sm:inline">Thu</span></span>
                <span><span className="sm:hidden">F</span><span className="hidden sm:inline">Fri</span></span>
                <span><span className="sm:hidden">S</span><span className="hidden sm:inline">Sat</span></span>
                <span><span className="sm:hidden">S</span><span className="hidden sm:inline">Sun</span></span>
              </div>
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {doctorCalendarDays.map((day, index) => {
                  if (day === null) {
                    return <div key={`empty-${index}`} aria-hidden="true" />;
                  }

                  const date = new Date(
                    doctorSelectedDate.getFullYear(),
                    doctorSelectedDate.getMonth(),
                    day
                  );
                  const dateKey = formatLocalDateKey(date);
                  const count = doctorAppointments.filter(
                    (appointment) => appointment.date === dateKey
                  ).length;
                  const selected = dateKey === doctorSelectedDateKey;
                  const today = dateKey === doctorCalendarTodayKey;

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      aria-label={`${date.toLocaleDateString()}, ${count} appointments`}
                      aria-pressed={selected}
                      onClick={() => setDoctorSelectedDate(date)}
                      className={`flex min-h-14 min-w-0 flex-col items-center justify-center rounded-lg border p-1 text-center transition sm:min-h-20 sm:rounded-2xl sm:p-2 ${
                        selected
                          ? 'border-[#1b7a57] bg-[#1b7a57] font-bold text-white shadow-md'
                          : 'border-slate-200 bg-slate-50 font-semibold text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        today && !selected ? 'bg-emerald-100 font-bold text-[#1b7a57]' : ''
                      }`}>
                        {day}
                      </span>
                      {count > 0 && (
                        <>
                          <span className={`mt-1 hidden text-[10px] font-extrabold sm:block ${
                            selected ? 'text-white' : 'text-emerald-700'
                          }`}>
                            {count} appt
                          </span>
                          <span className={`mt-1 h-1.5 w-1.5 rounded-full sm:hidden ${
                            selected ? 'bg-white' : 'bg-emerald-600'
                          }`} />
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <h4 className="text-sm font-bold text-slate-800">
                Appointments for {doctorSelectedDate.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </h4>
              {doctorDayAppointments.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-center text-xs text-slate-400">
                  No appointments assigned to you for this day.
                </div>
              ) : (
                doctorDayAppointments.map((appt) => (
                  <div
                    key={appt.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold text-slate-800">
                        {appt.patientName} ({appt.accountNo})
                      </p>
                      <p className="text-xs text-slate-500">
                        {appt.serviceType} • Time:{' '}
                        <span className="font-bold text-slate-700">{appt.timeSlot}</span>
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                      appt.status === 'confirmed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : appt.status === 'cancelled'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                    }`}>
                      {appt.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
)}
      </DoctorLayout>
    );
  }

  // 6. Patient Dashboard View
  return (
    <>
      <PatientLayout 
        activeTab={patientTab} 
        setActiveTab={(tab) => {
          setShowProfileModal(false);
          setPatientTab(tab);
        }} 
        patientName={patientProfile?.fullName || currentUser.name} 
        accountNo={loggedInAccount} 
        profileOpen={showProfileModal}
        onLogout={() => setCurrentUser(null)}
        onProfileClick={() => setShowProfileModal(true)}
      >
       {patientTab === 'queue' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Sub-Tab Toggle Switch with Lucide Icons */}
          <div className="grid w-full grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 sm:w-fit sm:gap-2 sm:rounded-2xl sm:bg-slate-100 sm:p-1.5">
            <button
              type="button"
              onClick={() => setQueueSubTab('today')}
              className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-[11px] font-bold transition-all sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2 sm:text-xs ${
                queueSubTab === 'today'
                  ? 'bg-[#1b7a57] text-white sm:bg-white sm:text-slate-800 sm:shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <CircleDot className={`h-3.5 w-3.5 shrink-0 ${queueSubTab === 'today' ? 'text-white sm:text-emerald-500' : 'text-emerald-500'} fill-current`} />
              <span className="truncate sm:hidden">Today ({todaysQueue.length})</span>
              <span className="hidden truncate sm:inline">Today's Live Queue ({todaysQueue.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setQueueSubTab('upcoming')}
              className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-[11px] font-bold transition-all sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2 sm:text-xs ${
                queueSubTab === 'upcoming'
                  ? 'bg-[#1b7a57] text-white sm:bg-white sm:text-slate-800 sm:shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Calendar className={`h-3.5 w-3.5 shrink-0 ${queueSubTab === 'upcoming' ? 'text-white sm:text-blue-500' : 'text-blue-500'}`} />
              <span className="truncate sm:hidden">Upcoming ({upcomingAppointments.length})</span>
              <span className="hidden truncate sm:inline">Upcoming Appointments ({upcomingAppointments.length})</span>
            </button>
          </div>

          {/* Conditionally Render Content */}
          {queueSubTab === 'today' ? (
            <>
              {/* Metric Cards */}
              <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 sm:rounded-2xl sm:p-4">
                  <p className="text-[10px] font-bold uppercase leading-tight text-slate-500 sm:text-xs">Queue Position</p>
                  <p className="mt-1 break-words text-lg font-extrabold text-slate-800 sm:text-xl">{dynamicPosition}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 sm:rounded-2xl sm:p-4">
                  <p className="text-[10px] font-bold uppercase leading-tight text-slate-500 sm:text-xs">Waiting Time</p>
                  <p className="mt-1 break-words text-base font-extrabold leading-tight text-slate-800 sm:text-xl">{dynamicWaitTime}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 sm:rounded-2xl sm:p-4">
                  <p className="text-[10px] font-bold uppercase leading-tight text-slate-500 sm:text-xs">Queue Status</p>
                  <p className={`mt-1 break-words text-lg font-extrabold sm:text-xl ${dynamicQueueStatusClass}`}>
                    {dynamicQueueStatus}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 sm:rounded-2xl sm:p-4">
                  <p className="text-[10px] font-bold uppercase leading-tight text-slate-500 sm:text-xs">Queue Speed</p>
                  <p className="mt-1 flex items-center text-lg font-extrabold text-slate-800 sm:text-xl">
                    {dynamicQueueSpeed}
                    <Zap className={`ml-2 h-4 w-4 ${
                      dynamicQueueSpeed === 'Super Slow'
                        ? 'text-red-500 fill-red-500'
                        : dynamicQueueSpeed === 'Moderate'
                          ? 'text-amber-500 fill-amber-500'
                          : dynamicQueueSpeed === 'Fast'
                            ? 'text-emerald-500 fill-emerald-500'
                            : 'text-slate-400'
                    }`} />
                  </p>
                  {patientQueueIndex !== -1 && emergencyPatientsAhead > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      {emergencyPatientsAhead} emergency {emergencyPatientsAhead === 1 ? 'patient' : 'patients'} ahead
                    </p>
                  )}
                </div>
              </div>

              {/* Live Queue Display */}
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-6 lg:grid-cols-2">
                <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-center sm:space-y-3 sm:rounded-3xl sm:p-6">
                  <h3 className="text-base font-bold text-slate-800 sm:text-lg">
                    {currentUser.role === 'patient' ? 'Currently in Position #1' : 'In Consultation'}
                  </h3>
                  <p className="break-words text-xl font-extrabold text-emerald-700 sm:text-2xl">
                    {currentUser.role === 'patient'
                      ? patientQueueDisplay[0]?.accountNo || 'None Active'
                      : todaysQueue[0]?.accountNo || 'None Active'}
                  </p>
                  <p className="text-xs text-slate-400 italic">
                    {currentUser.role === 'patient'
                      ? 'Queue positions update in real time. Patient names are shown only for your own account.'
                      : '*if this is you, please proceed to the consultation room*'}
                  </p>
                </div>

                <UserQueue
                  patients={currentUser.role === 'patient' ? patientQueueDisplay : activeQueue}
                  isPatientView={currentUser.role === 'patient'}
                  currentPatientAccountNo={loggedInAccount}
                  isLoading={currentUser.role === 'patient' && queuePositionsLoading}
                  error={currentUser.role === 'patient' ? queuePositionsError : null}
                />
              </div>
            </>
          ) : (
            /* Upcoming Appointments View with Lucide Icons */
            <div className="rounded-xl border border-slate-200 bg-white p-3 sm:rounded-3xl sm:p-6 sm:shadow-sm">
              <h3 className="mb-1 flex items-start gap-2 text-base font-bold text-slate-800 sm:text-lg">
                <Calendar className="w-5 h-5 text-emerald-600" />
                <span>Upcoming Approved Appointments</span>
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Appointments scheduled for future dates
              </p>
              <hr className="mb-4" />

              {upcomingAppointments.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No upcoming appointments scheduled.</p>
              ) : (
                <div className="space-y-3">
                  {upcomingAppointments.map((item) => {
                    const p = item;
                    return (
                      <div
                        key={p.id}
                        className="flex min-w-0 flex-col items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 transition-all hover:border-slate-200 sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:bg-slate-50 sm:p-4"
                      >
                        <div className="min-w-0 space-y-1.5">
                          <p className="flex min-w-0 flex-wrap items-center gap-x-2 font-bold text-slate-800">
                            <span>{p.patientName || p.fullName}</span>
                            <span className="text-xs font-semibold text-slate-400">({p.accountNo})</span>
                          </p>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                            <span className="flex items-center space-x-1">
                              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="font-bold text-emerald-800">{p.date}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <Clock className="w-3.5 h-3.5 text-slate-500" />
                              <span className="font-semibold text-slate-700">{p.timeSlot}</span>
                            </span>
                          </div>
                          {p.serviceType && (
                            <p className="text-xs text-slate-500">Service: {p.serviceType}</p>
                          )}
                        </div>
                        <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Confirmed</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* end of queue tab*/}
      
      {/* start of appointment tab */}
        {patientTab === 'appointment' && (
          <AppointmentView currentUser={{
            name: patientProfile?.fullName || currentUser.name,
            accountNo: loggedInAccount,
            uid: currentUser.uid || '',
          }} onNotify={showAppNotice} />
        )}
      {/* end of appointment tab */}
        {patientTab === 'progress' && (
          <div className="space-y-4">
            <section className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <DoorOpen className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Room assignment</h2>
                <p className="mt-1 break-words font-bold text-slate-800">
                  {patientRoomAssignment || 'No room assigned yet'}
                </p>
              </div>
            </section>
            {patientDocId
              ? <DiagnosticTestProgress patientId={patientDocId} />
              : <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading your diagnostic progress...</p>}
          </div>
        )}
        {/* Patient Medical Records Tab */}
        {patientTab === 'records' && (
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <header>
              <h3 className="font-bold text-slate-800 text-lg">Patient Medical Records</h3>
              <p className="mt-1 text-sm text-slate-500">Consultation history and medical notes.</p>
            </header>
            {patientDocId ? (
              <PatientMedicalRecordHistory patientId={patientDocId} />
            ) : (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                {patientProfile
                  ? 'Your patient profile could not be linked to its medical records.'
                  : 'Loading your patient profile...'}
              </p>
            )}
          </section>
        )}
        {/* End of Records Tab */}
        {/* Start of Prescriptions Tab */}
        {patientTab === 'prescriptions' && (
          <PatientPrescriptions accountNo={loggedInAccount} />
        )}
      </PatientLayout>
      {/* Interactive Single-Attempt Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-x-0 top-14 bottom-0 z-40 overflow-y-auto overscroll-y-contain bg-[#e2e8e6] md:inset-y-0 md:left-64">
          <div className="mx-auto min-h-full w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
            <section id="personal-profile" className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h4 className="text-lg font-bold text-slate-800">Personal profile</h4>
              {patientProfile && (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Full Name</p>
                  {isEditingPatientName ? (
                    <form
                      className="mt-2 space-y-3"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        if (!patientDocId) {
                          setPatientNameError('Your patient profile could not be found. Please sign in again.');
                          return;
                        }
                        if (patientNameInput.trim() === patientProfile.fullName?.trim()) {
                          setPatientNameError('Enter a different name before saving.');
                          return;
                        }

                        setIsSavingPatientName(true);
                        setPatientNameError(null);
                        try {
                          const fullName = await updatePatientNameOnce(patientDocId, patientNameInput);
                          setPatientProfile((profile) => profile
                            ? { ...profile, fullName, nameEditUsed: true }
                            : profile);
                          setCurrentUser((user) => user ? { ...user, name: fullName } : user);
                          setPatientNameInput(fullName);
                          setIsEditingPatientName(false);
                        } catch (error) {
                          const details = error as { code?: string; message?: string };
                          setPatientNameError(details.code === 'permission-denied'
                            ? 'The name update was denied. Ensure the updated patient rules from firebaseRuling.txt are published in Firebase Console.'
                            : details.message || 'Could not update your name. Please try again.');
                        } finally {
                          setIsSavingPatientName(false);
                        }
                      }}
                    >
                      <input
                        autoFocus
                        type="text"
                        required
                        maxLength={100}
                        value={patientNameInput}
                        onChange={(event) => setPatientNameInput(event.target.value)}
                        aria-label="New full name"
                        className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#1b7a57]"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                        disabled={isSavingPatientName || patientNameInput.trim() === patientProfile.fullName?.trim()}
                          className="rounded-xl bg-[#1b7a57] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {isSavingPatientName ? 'Saving...' : 'Save name (one-time edit)'}
                        </button>
                        <button
                          type="button"
                          disabled={isSavingPatientName}
                          onClick={() => {
                            setPatientNameInput(patientProfile.fullName || '');
                            setPatientNameError(null);
                            setIsEditingPatientName(false);
                          }}
                          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <p className="break-words font-medium text-slate-800">{patientProfile.fullName || currentUser.name}</p>
                      {patientProfile.nameEditUsed !== true && (
                        <button
                          type="button"
                          onClick={() => {
                            setPatientNameInput(patientProfile.fullName || currentUser.name);
                            setPatientNameError(null);
                            setIsEditingPatientName(true);
                          }}
                          className="text-sm font-bold text-emerald-700 underline underline-offset-2"
                        >
                          Edit name once
                        </button>
                      )}
                    </div>
                  )}
                  {patientProfile.nameEditUsed === true && !isEditingPatientName && (
                    <p className="mt-1 text-xs text-slate-500">Your one-time name edit has been used.</p>
                  )}
                  {patientNameError && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{patientNameError}</p>}
                </div>
              )}
              {patientProfile?.profileCompleted ? (
              /* READ-ONLY VIEW */
              <div className="grid grid-cols-1 gap-4 text-sm text-slate-700 sm:grid-cols-2">
                {[
                  ['Email', currentUser.email || 'Not provided'],
                  ['Sex', patientProfile.sex || 'Not specified'],
                  ['Age', patientProfile.age || 'Not specified'],
                  ['Birthday', patientProfile.birthday || 'Not specified'],
                  ['Contact', patientProfile.contact || 'Not specified'],
                  ['Address', patientProfile.address || 'Not specified'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
                    <p className="mt-1 break-words font-medium text-slate-800">{value}</p>
                  </div>
                ))}
                <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 sm:col-span-2">
                  <p className="font-bold text-slate-700">Doctor-managed medical information</p>
                  <p><strong>Allergies:</strong> {patientProfile.allergies || 'None recorded'}</p>
                  <div>
                    <strong>Assigned Specialist{assignedPatientDoctors.length === 1 ? '' : 's'}:</strong>
                    {assignedPatientDoctors.length > 0 ? (
                      <ul className="mt-1 list-inside list-disc">
                        {assignedPatientDoctors.map((doctor) => (
                          <li key={doctor.name}>
                            {doctor.name}
                            {doctor.specialty ? ` (${doctor.specialty})` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span> No specialist has been assigned to your appointments yet.</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              
              /* SINGLE EDIT ATTEMPT FORM */
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!patientDocId) {
                  showAppNotice(
                    'error',
                    'Your patient profile could not be found. Please sign out and sign in again, then contact clinic administration if the issue continues.',
                  );
                  return;
                }
                if (!isConfirmingPatientProfileSave) {
                  setIsConfirmingPatientProfileSave(true);
                  return;
                }

                setIsSavingPatientProfile(true);
                try {
                  await updatePatientPersonalProfile(patientDocId, profileFormData);
                  setPatientProfile((profile) => ({
                    ...profile,
                    ...profileFormData,
                    profileCompleted: true
                  }));
                  setIsConfirmingPatientProfileSave(false);
                  showAppNotice('success', 'Profile details saved successfully.');
                } catch (err) {
                  const error = err as { code?: string; message?: string };
                  const message = error.code === 'permission-denied'
                    ? 'Firestore denied this profile update. Publish the updated patient rules from firebaseRuling.txt in Firebase Console > Firestore Database > Rules.'
                    : error.message || String(err);
                  showAppNotice('error', `Error saving profile: ${message}`);
                } finally {
                  setIsSavingPatientProfile(false);
                }
              }} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Sex</label>
                    <select 
                      value={profileFormData.sex} 
                      onChange={(e) => {
                        setProfileFormData({ ...profileFormData, sex: e.target.value });
                        setIsConfirmingPatientProfileSave(false);
                      }}
                      className="w-full p-2.5 bg-slate-50 border rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[#1b7a57]"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Age</label>
                    <input 
                      type="number" 
                      required 
                      value={profileFormData.age} 
                      readOnly
                      aria-readonly="true"
                      placeholder="Set birthday to calculate age" 
                      className="w-full p-2.5 bg-slate-50 border rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[#1b7a57]" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Birthday</label>
                  <input 
                    type="text" 
                    required 
                    inputMode="numeric"
                    pattern="\d{4}-\d{2}-\d{2}"
                    placeholder="YYYY-MM-DD"
                    value={profileFormData.birthday} 
                    onChange={(e) => {
                      const birthday = e.target.value;
                      setProfileFormData((profile) => ({
                        ...profile,
                        birthday,
                        age: calculateAgeFromBirthday(birthday),
                      }));
                      setIsConfirmingPatientProfileSave(false);
                    }} 
                    className="w-full p-2.5 bg-slate-50 border rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[#1b7a57]" 
                  />
                  <p className="mt-1 text-xs text-slate-500">Type your birthday as YYYY-MM-DD. Age fills in automatically.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Contact Number</label>
                  <input 
                    type="text" 
                    required 
                    value={profileFormData.contact} 
                    onChange={(e) => {
                      setProfileFormData({ ...profileFormData, contact: e.target.value });
                      setIsConfirmingPatientProfileSave(false);
                    }}
                    placeholder="+63 900 000 0000" 
                    className="w-full p-2.5 bg-slate-50 border rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[#1b7a57]" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Home Address</label>
                  <input 
                    type="text" 
                    required 
                    value={profileFormData.address} 
                    onChange={(e) => {
                      setProfileFormData({ ...profileFormData, address: e.target.value });
                      setIsConfirmingPatientProfileSave(false);
                    }}
                    placeholder="House #, Street, City" 
                    className="w-full p-2.5 bg-slate-50 border rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[#1b7a57]" 
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={isSavingPatientProfile}
                  className="w-full py-3 bg-[#1b7a57] hover:bg-emerald-700 text-white font-bold rounded-2xl shadow transition"
                >
                  {isSavingPatientProfile
                    ? 'Saving Profile...'
                    : isConfirmingPatientProfileSave
                      ? 'Confirm and Save Profile'
                      : 'Review Profile Before Saving'}
                </button>
                {isConfirmingPatientProfileSave && (
                  <div
                    role="group"
                    aria-labelledby="confirm-patient-profile-save"
                    className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
                  >
                    <h4 id="confirm-patient-profile-save" className="font-bold text-amber-900">
                      Confirm profile details
                    </h4>
                    <p className="text-sm text-amber-800">
                      Personal profile details can only be submitted once. Review your information, then confirm to save.
                    </p>
                    <button
                      type="button"
                      disabled={isSavingPatientProfile}
                      onClick={() => setIsConfirmingPatientProfileSave(false)}
                      className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-bold text-amber-900 hover:bg-white disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </form>
            )}
            </section>
            <section id="medical-record-history" className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div>
                <h4 className="text-lg font-bold text-slate-800">Complete medical record history</h4>
                <p className="mt-1 text-sm text-slate-500">All medical notes saved to your patient record appear here.</p>
              </div>
              {patientDocId
                ? <PatientMedicalRecordHistory patientId={patientDocId} />
                : <p className="text-sm text-slate-500">Your patient profile is still loading.</p>}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
