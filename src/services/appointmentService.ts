import { 
  collection,
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  doc,
  where,
  runTransaction,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

export interface AppointmentSlot {
  id: string;
  date: string;
  timeSlot: string;
}

export function getAppointmentSlotId(date: string, timeSlot: string) {
  return `${date}_${timeSlot}`;
}

export interface AppointmentRequest {
  id?: string;
  patientId?: string;
  slotId?: string;
  accountNo: string;
  patientName: string;
  date: string;      
  timeSlot: string;  
  serviceType: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt?: Timestamp | null;
  doctorId?: string;
  doctorName?: string;
  room?: string;
}

//Request a new appointment from patient view
export async function requestAppointment(data: Omit<AppointmentRequest, 'id' | 'status' | 'createdAt'> & { patientId: string }) {
  const appointmentRef = doc(collection(db, 'appointments'));
  const slotRef = doc(db, 'appointmentSlots', getAppointmentSlotId(data.date, data.timeSlot));
  const appointmentData = {
    ...data,
    slotId: slotRef.id,
    status: 'pending' as const,
    createdAt: serverTimestamp(),
  };
  await runTransaction(db, async (transaction) => {
    const slotSnapshot = await transaction.get(slotRef);
    if (slotSnapshot.exists()) {
      throw new Error('That appointment time has just been booked. Choose another available time.');
    }

    transaction.set(appointmentRef, appointmentData);
    transaction.set(slotRef, {
      date: data.date,
      timeSlot: data.timeSlot,
      appointmentId: appointmentRef.id,
    });
  });
}

export function subscribeToAppointmentSlots(
  date: string,
  callback: (slots: AppointmentSlot[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(db, 'appointmentSlots'), where('date', '==', date)),
    (snapshot) => callback(snapshot.docs.map((slotDoc) => ({
      id: slotDoc.id,
      date: typeof slotDoc.data().date === 'string' ? slotDoc.data().date : '',
      timeSlot: typeof slotDoc.data().timeSlot === 'string' ? slotDoc.data().timeSlot : '',
    }))),
    onError,
  );
}

/**
 * Real-time listener for appointments
 */
export function subscribeToAppointments(
  callback: (appointments: AppointmentRequest[]) => void,
  patientId?: string,
  onError?: (error: Error) => void,
) {
  const appointmentsRef = patientId
    ? query(collection(db, 'appointments'), where('patientId', '==', patientId))
    : query(collection(db, 'appointments'), orderBy('createdAt', 'desc'));
  return onSnapshot(appointmentsRef, (snapshot) => {
    const list: AppointmentRequest[] = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    })) as AppointmentRequest[];
    callback(list);
  }, (error) => {
    if (onError) {
      onError(error);
    } else {
      console.error('Could not load appointment requests:', error);
    }
  });
}

/**
 * Update appointment status (confirm, cancel, etc.).
 * Automatically pushes confirmed bookings into the live daily queue.
 */
export async function updateAppointmentStatus(
  appointmentId: string, 
  status: 'confirmed' | 'cancelled',
  assignedData?: { doctorId: string; doctorName: string; room?: string } 
) {
  const apptRef = doc(db, 'appointments', appointmentId);
  await runTransaction(db, async (transaction) => {
    const appointmentSnapshot = await transaction.get(apptRef);
    if (!appointmentSnapshot.exists()) {
      throw new Error('The appointment could not be found.');
    }

    const appointment = appointmentSnapshot.data();
    const accountNo = typeof appointment.accountNo === 'string'
      ? appointment.accountNo.trim()
      : '';
    const queueRef = accountNo ? doc(db, 'queues', accountNo) : null;
    const queuePositionRef = accountNo ? doc(db, 'queuePositions', accountNo) : null;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const appointmentStatus = typeof appointment.status === 'string'
      ? appointment.status.toLowerCase()
      : '';
    const serviceType = typeof appointment.serviceType === 'string'
      ? appointment.serviceType.toLowerCase()
      : '';
    const isInActiveQueue =
      appointmentStatus === 'confirmed' ||
      appointmentStatus === 'approved' ||
      (serviceType.includes('emergency') && appointmentStatus !== 'cancelled');
    const shouldRemoveQueueEntry =
      status === 'cancelled' &&
      appointment.date === today &&
      isInActiveQueue;
    const updateData: Record<string, string> = { status };
    if (assignedData?.doctorId) updateData.doctorId = assignedData.doctorId;
    if (assignedData?.doctorName) updateData.doctorName = assignedData.doctorName;
    if (assignedData?.room) updateData.room = assignedData.room;

    const slotRef = status === 'cancelled' &&
      typeof appointment.date === 'string' &&
      typeof appointment.timeSlot === 'string'
      ? doc(
        db,
        'appointmentSlots',
        getAppointmentSlotId(appointment.date, appointment.timeSlot),
      )
      : null;
    const [slotSnapshot, queueSnapshot, queuePositionSnapshot] = await Promise.all([
      slotRef ? transaction.get(slotRef) : Promise.resolve(null),
      shouldRemoveQueueEntry && queueRef ? transaction.get(queueRef) : Promise.resolve(null),
      shouldRemoveQueueEntry && queuePositionRef
        ? transaction.get(queuePositionRef)
        : Promise.resolve(null),
    ]);

    transaction.update(apptRef, updateData);
    if (shouldRemoveQueueEntry) {
      if (queueRef && queueSnapshot?.exists()) transaction.delete(queueRef);
      if (queuePositionRef && queuePositionSnapshot?.exists()) transaction.delete(queuePositionRef);
    }
    if (status === 'confirmed' && queuePositionRef && appointment.date === today) {
      transaction.set(queuePositionRef, {
        accountNo,
        priorityWeight: typeof appointment.priorityWeight === 'number'
          ? appointment.priorityWeight
          : 0,
        appointmentId,
      });
    }
    if (slotRef && slotSnapshot?.exists() && slotSnapshot.data().appointmentId === appointmentId) {
      transaction.delete(slotRef);
    }
  });
}

export function subscribeToDoctors(
  callback: (doctors: Array<{ id: string; [field: string]: unknown }>) => void,
) {
  const q = query(collection(db, 'users'), where('role', '==', 'doctor'));
  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    callback(list);
  });
}