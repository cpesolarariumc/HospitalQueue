import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc,
  getDocs,
  doc, 
  setDoc, 
  updateDoc, 
  serverTimestamp, 
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';  
import { db } from '../firebaseConfig';

export interface QueuePatient {
  accountNo: string;
  patientEmail?: string;
  fullName: string;
  priorityWeight: number;
  isEmergency: boolean;
  traumaType?: string;
  traumaLevel?: 1 | 2 | 3;
  traumaSpecification?: string;
  room?: string;
  patientId?: string;
  emergencyTypeId?: string;
  appointmentId?: string;
  createdAt?: Timestamp | null;
}

export interface QueuePosition {
  id: string;
  accountNo: string;
  priorityWeight: number;
  appointmentId?: string;
  estimatedWaitMinutes?: number;
  waitEstimateVersion?: number;
}

export const STANDARD_WAIT_MINUTES = 5;
export const EMERGENCY_WAIT_MINUTES = 10;
export const EMERGENCY_PRIORITY_WEIGHT = 9_999_999_999_999;
export const QUEUE_WAIT_ESTIMATE_VERSION = 3;

export interface EmergencyRouting {
  id: string;
  symptom: string;
  room: string;
  level?: 1 | 2 | 3;
}

export type TraumaType = string;

const emergencyRoomAliases: Record<string, string> = {
  'trauma operating room / major trauma bay': 'Trauma Operating Room',
  'bay / ct scan': 'Trauma Bay / CT Scan',
  'er resuscitation / acute care bay': 'Resuscitation Room',
  'respiratory care / er resuscitation': 'Respiratory Care Bay',
  'er eye / minor procedure room': 'Minor Trauma / Procedure Room',
};

export function getEmergencyDestination(room: string) {
  const normalizedRoom = room.trim().replace(/\s+/g, ' ').toLowerCase();
  return emergencyRoomAliases[normalizedRoom] || room.trim();
}

export function subscribeToEmergencyRouting(
  callback: (routes: EmergencyRouting[], invalidDocumentIds: string[]) => void,
  onError: (error: Error) => void
) {
  return onSnapshot(
    collection(db, 'er_routing'),
    (snapshot) => {
      const routes: EmergencyRouting[] = [];
      const invalidDocumentIds: string[] = [];

      snapshot.docs.forEach((document) => {
        const data = document.data();
        if (typeof data.symptom !== 'string' || !data.symptom.trim() ||
            typeof data.room !== 'string' || !data.room.trim()) {
          invalidDocumentIds.push(document.id);
          return;
        }

        const level = data.level;
        routes.push({
          id: document.id,
          symptom: data.symptom.trim(),
          room: data.room.trim(),
          ...(level === 1 || level === 2 || level === 3 ? { level } : {}),
        });
      });

      callback(routes, invalidDocumentIds);
    },
    (error) => onError(error)
  );
}

export interface PatientProfile {
  fullName: string;
  accountNo: string;
  email: string;
  sex?: string;
  age?: string;
  birthday?: string;
  contact?: string;
  address?: string;
  allergies?: string;
  profileCompleted?: boolean;
}

/**
 * Real-time listener for Max-Heap live queue
 */
export function subscribeToLiveQueue(
  callback: (queue: QueuePatient[]) => void,
  patientEmail?: string,
) {
  const queuesQuery = patientEmail
    ? query(collection(db, 'queues'), where('patientEmail', '==', patientEmail))
    : query(collection(db, 'queues'), orderBy('priorityWeight', 'desc'));
  return onSnapshot(queuesQuery, (snapshot) => {
    const list: QueuePatient[] = snapshot.docs.map(docSnap => ({
      ...docSnap.data()
    })) as QueuePatient[];
    callback(list);
  });
}

export function subscribeToQueuePositions(
  callback: (positions: QueuePosition[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(db, 'queuePositions'), orderBy('priorityWeight', 'desc')),
    (snapshot) => {
      callback(snapshot.docs.map((positionDoc) => {
        const data = positionDoc.data();
        return {
          id: positionDoc.id,
          accountNo: typeof data.accountNo === 'string' ? data.accountNo : positionDoc.id,
          priorityWeight: typeof data.priorityWeight === 'number' ? data.priorityWeight : 0,
          ...(typeof data.appointmentId === 'string' ? { appointmentId: data.appointmentId } : {}),
          ...(typeof data.estimatedWaitMinutes === 'number' &&
          Number.isFinite(data.estimatedWaitMinutes) &&
          data.estimatedWaitMinutes >= 0
            ? { estimatedWaitMinutes: data.estimatedWaitMinutes }
            : {}),
          ...(typeof data.waitEstimateVersion === 'number'
            ? { waitEstimateVersion: data.waitEstimateVersion }
            : {}),
        };
      }));
    },
    onError,
  );
}

export async function syncQueuePositions(queue: QueuePatient[]) {
  const currentPositions = await getDocs(collection(db, 'queuePositions'));
  const desiredPositions = new Map<string, {
    accountNo: string;
    priorityWeight: number;
    appointmentId?: string;
    estimatedWaitMinutes: number;
    waitEstimateVersion: number;
  }>();
  let minutesBeforePatient = 0;
  queue.forEach((patient) => {
    const accountNo = patient.accountNo.trim();
    desiredPositions.set(accountNo, {
      accountNo,
      priorityWeight: patient.priorityWeight,
      ...(patient.appointmentId ? { appointmentId: patient.appointmentId } : {}),
      estimatedWaitMinutes: minutesBeforePatient,
      waitEstimateVersion: QUEUE_WAIT_ESTIMATE_VERSION,
    });
    minutesBeforePatient += patient.isEmergency
      ? EMERGENCY_WAIT_MINUTES
      : STANDARD_WAIT_MINUTES;
  });
  const operations = [
    ...currentPositions.docs
      .filter((positionDoc) => !desiredPositions.has(positionDoc.id))
      .map((positionDoc) => ({ ref: positionDoc.ref, data: null })),
    ...Array.from(desiredPositions, ([accountNo, data]) => ({
      ref: doc(db, 'queuePositions', accountNo),
      data,
    })),
  ];

  for (let start = 0; start < operations.length; start += 450) {
    const batch = writeBatch(db);
    operations.slice(start, start + 450).forEach(({ ref, data }) => {
      if (data) {
        batch.set(ref, data);
      } else {
        batch.delete(ref);
      }
    });
    await batch.commit();
  }
}

/**
 * Add patient to live queue with Max-Heap priority weights
 */
export async function addPatientToQueue(
  fullName: string,
  accountNo: string,
  isEmergency: boolean,
  routing?: EmergencyRouting,
  traumaSpecification?: string
) {
  const traumaLevel = routing?.level;
  const priorityWeight = traumaLevel
    ? (4 - traumaLevel) * 10_000_000_000_000 + Date.now()
    : isEmergency
      ? EMERGENCY_PRIORITY_WEIGHT
      : Date.now();
  const queueRef = doc(db, 'queues', accountNo);
  const existingPatientQuery = query(
    collection(db, 'patients'),
    where('accountNo', '==', accountNo.trim()),
  );
  const existingPatients = await getDocs(existingPatientQuery);
  const linkedPatient = existingPatients.docs[0];
  const queueData = {
    fullName,
    accountNo,
    ...(linkedPatient
      ? {
          patientId: typeof linkedPatient.data().uid === 'string'
            ? linkedPatient.data().uid
            : linkedPatient.id,
          patientEmail: typeof linkedPatient.data().email === 'string'
            ? linkedPatient.data().email
            : '',
        }
      : {}),
    priorityWeight,
    isEmergency,
    ...(routing
      ? {
          traumaType: routing.symptom,
          emergencyTypeId: routing.id,
          ...(traumaLevel ? { traumaLevel } : {}),
          room: getEmergencyDestination(routing.room),
          ...(routing.symptom.toLowerCase() === 'other emergency' && traumaSpecification
            ? { traumaSpecification }
            : {}),
        }
      : {}),
    createdAt: serverTimestamp(),
  };
  const queuePositionRef = doc(db, 'queuePositions', accountNo.trim());
  const queuePositionData = {
    accountNo: accountNo.trim(),
    priorityWeight,
  };

  if (!isEmergency) {
    const batch = writeBatch(db);
    batch.set(queueRef, queueData);
    batch.set(queuePositionRef, queuePositionData);
    await batch.commit();
    return;
  }

  const batch = writeBatch(db);
  let patientId: string;

  if (!linkedPatient) {
    const patientRef = doc(collection(db, 'patients'));
    patientId = patientRef.id;
    batch.set(patientRef, {
      accountNo: accountNo.trim(),
      fullName: fullName.trim(),
      email: '',
      temporary: true,
      profileCompleted: false,
      sex: 'Not Specified',
      age: '',
      birthday: '',
      contact: '',
      address: '',
      allergies: 'None recorded',
      createdAt: serverTimestamp(),
    });
  } else {
    patientId = typeof linkedPatient.data().uid === 'string'
      ? linkedPatient.data().uid
      : linkedPatient.id;
  }

  batch.set(queueRef, {
    ...queueData,
    patientId,
    patientEmail: linkedPatient && typeof linkedPatient.data().email === 'string'
      ? linkedPatient.data().email
      : '',
  });
  batch.set(queuePositionRef, queuePositionData);
  await batch.commit();
}

/**
 * Save a newly created patient's initial record to Firestore /patients/{uid}
 */
export async function savePatientProfile(
  uid: string,
  fullName: string,
  email: string,
  phone: string
): Promise<void> {
  const accountNo = `PTNT-${uid.slice(0, 6).toUpperCase()}`;

  const patientRef = doc(db, 'patients', uid);
  await setDoc(patientRef, {
    uid,
    accountNo,
    fullName,
    email,
    contact: phone,
    sex: 'Not Specified',
    age: '',
    birthday: '',
    address: '',
    allergies: 'None recorded',
    profileCompleted: false,
    createdAt: serverTimestamp(),
  });
}

/**
 * Single-attempt update for patient personal details
 */
export async function updatePatientPersonalProfile(docId: string, data: {
  sex: string;
  age: string;
  birthday: string;
  contact: string;
  address: string;
}) {
  const patientRef = doc(db, 'patients', docId);
  await updateDoc(patientRef, {
    ...data,
    profileCompleted: true,
  });
}

export async function updatePatientNameOnce(docId: string, fullName: string) {
  const normalizedName = fullName.trim().replace(/\s+/g, ' ');
  if (!normalizedName || normalizedName.length > 100) {
    throw new Error('Enter a name between 1 and 100 characters.');
  }

  await updateDoc(doc(db, 'patients', docId), {
    fullName: normalizedName,
    nameEditUsed: true,
    updatedAt: serverTimestamp(),
  });

  return normalizedName;
}

/**
 * Creates and saves a prescription record to Firestore
 */
export async function createPrescription(userId: string, doctorName: string, prescriptionText: string) {
  await addDoc(collection(db, 'prescriptions'), {
    userId,
    doctorName,
    prescriptionText,
    createdAt: serverTimestamp(),
  });
}

export interface PatientPrescription {
  id: string;
  userId: string;
  doctorName: string;
  prescriptionText: string;
  createdAt?: Timestamp | null;
}

export function subscribeToPatientPrescriptions(
  accountNo: string,
  callback: (prescriptions: PatientPrescription[]) => void,
  onError: (error: Error) => void,
) {
  const prescriptionsQuery = query(
    collection(db, 'prescriptions'),
    where('userId', '==', accountNo),
  );

  return onSnapshot(
    prescriptionsQuery,
    (snapshot) => {
      const prescriptions = snapshot.docs.map((prescriptionDoc) => {
        const data = prescriptionDoc.data();
        return {
          id: prescriptionDoc.id,
          userId: typeof data.userId === 'string' ? data.userId : '',
          doctorName: typeof data.doctorName === 'string' ? data.doctorName : '',
          prescriptionText: typeof data.prescriptionText === 'string' ? data.prescriptionText : '',
          createdAt: data.createdAt ?? null,
        };
      });
      prescriptions.sort(
        (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
      );
      callback(prescriptions);
    },
    onError,
  );
}

export async function removeFromQueue(userId: string) {
  const accountNo = userId.trim();
  const queueRef = doc(db, 'queues', accountNo);
  const appointmentsQuery = query(
    collection(db, 'appointments'),
    where('accountNo', '==', accountNo),
  );
  const appointmentSnapshot = await getDocs(appointmentsQuery);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const activeTodayAppointments = appointmentSnapshot.docs.filter((appointmentDoc) => {
    const appointment = appointmentDoc.data();
    const status = typeof appointment.status === 'string'
      ? appointment.status.toLowerCase()
      : '';
    const serviceType = typeof appointment.serviceType === 'string'
      ? appointment.serviceType.toLowerCase()
      : '';
    const isEmergency = appointment.isEmergency === true || serviceType.includes('emergency');
    const isConfirmed = status === 'confirmed' || status === 'approved';

    return appointment.date === today && (isConfirmed || (isEmergency && status !== 'cancelled'));
  });

  const batch = writeBatch(db);
  batch.delete(queueRef);
  batch.delete(doc(db, 'queuePositions', accountNo));
  activeTodayAppointments.forEach((appointmentDoc) => {
    batch.update(appointmentDoc.ref, { status: 'cancelled' });
  });
  await batch.commit();
}