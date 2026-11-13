import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

export interface PatientDirectoryEntry {
  id: string;
  accountNo: string;
  fullName: string;
  email: string;
  sex: string;
  age: string;
  birthday: string;
  contact: string;
  address: string;
  allergies: string;
  temporary?: boolean;
}

export interface PatientMedicalRecord {
  id: string;
  title: string;
  details: string;
  doctorName: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

type EditableEmergencyPatientProfile = Pick<
  PatientDirectoryEntry,
  'fullName' | 'email' | 'sex' | 'age' | 'birthday' | 'contact' | 'address' | 'allergies'
>;

export function subscribeToPatientDirectory(
  callback: (patients: PatientDirectoryEntry[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    collection(db, 'patients'),
    (snapshot) => {
      const patients = snapshot.docs.map((patientDoc) => {
        const data = patientDoc.data();
        return {
          id: patientDoc.id,
          accountNo: typeof data.accountNo === 'string' ? data.accountNo : patientDoc.id,
          fullName: typeof data.fullName === 'string' ? data.fullName : 'Unnamed patient',
          email: typeof data.email === 'string' ? data.email : '',
          sex: typeof data.sex === 'string' ? data.sex : '',
          age: typeof data.age === 'string' ? data.age : '',
          birthday: typeof data.birthday === 'string' ? data.birthday : '',
          contact: typeof data.contact === 'string' ? data.contact : '',
          address: typeof data.address === 'string' ? data.address : '',
          allergies: typeof data.allergies === 'string' ? data.allergies : '',
          temporary: data.temporary === true,
        };
      });
      callback(patients);
    },
    onError,
  );
}

export async function findPatientByAccountNo(accountNo: string): Promise<PatientDirectoryEntry | null> {
  const patientQuery = query(
    collection(db, 'patients'),
    where('accountNo', '==', accountNo.trim()),
  );
  const snapshot = await getDocs(patientQuery);
  const patientDoc = snapshot.docs[0];

  if (!patientDoc) {
    return null;
  }

  return patientDirectoryEntry(patientDoc.id, patientDoc.data());
}

export async function findPatientById(patientId: string): Promise<PatientDirectoryEntry | null> {
  const patientSnapshot = await getDoc(doc(db, 'patients', patientId));
  if (!patientSnapshot.exists()) return null;
  return patientDirectoryEntry(patientSnapshot.id, patientSnapshot.data());
}

function patientDirectoryEntry(id: string, data: Record<string, unknown>): PatientDirectoryEntry {
  return {
    id,
    accountNo: typeof data.accountNo === 'string' ? data.accountNo : id,
    fullName: typeof data.fullName === 'string' ? data.fullName : 'Unnamed patient',
    email: typeof data.email === 'string' ? data.email : '',
    sex: typeof data.sex === 'string' ? data.sex : '',
    age: typeof data.age === 'string' ? data.age : '',
    birthday: typeof data.birthday === 'string' ? data.birthday : '',
    contact: typeof data.contact === 'string' ? data.contact : '',
    address: typeof data.address === 'string' ? data.address : '',
    allergies: typeof data.allergies === 'string' ? data.allergies : '',
    temporary: data.temporary === true,
  };
}

export function subscribeToPatientMedicalRecords(
  patientId: string,
  callback: (records: PatientMedicalRecord[]) => void,
  onError: (error: Error) => void,
) {
  const recordsQuery = query(
    collection(db, 'patients', patientId, 'medicalRecords'),
    orderBy('createdAt', 'desc'),
  );

  return onSnapshot(
    recordsQuery,
    (snapshot) => {
      callback(
        snapshot.docs.map((recordDoc) => {
          const data = recordDoc.data();
          return {
            id: recordDoc.id,
            title: typeof data.title === 'string' ? data.title : '',
            details: typeof data.details === 'string' ? data.details : '',
            doctorName: typeof data.doctorName === 'string' ? data.doctorName : '',
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        }),
      );
    },
    onError,
  );
}

export async function updatePatientAllergies(patientId: string, allergies: string) {
  await updateDoc(doc(db, 'patients', patientId), {
    allergies: allergies.trim() || 'None recorded',
    updatedAt: serverTimestamp(),
  });
}

export async function updateEmergencyPatientProfile(
  patientId: string,
  profile: EditableEmergencyPatientProfile,
) {
  const patientRef = doc(db, 'patients', patientId);
  const patientSnapshot = await getDoc(patientRef);
  const accountNo = patientSnapshot.data()?.accountNo;

  if (
    !patientSnapshot.exists() ||
    typeof accountNo !== 'string' ||
    !accountNo.trim().toUpperCase().startsWith('PTNT-EMER-')
  ) {
    throw new Error('This patient is not an emergency profile with a PTNT-EMER number.');
  }

  const fullName = profile.fullName.trim();
  if (!fullName) {
    throw new Error('Patient name is required.');
  }

  await updateDoc(patientRef, {
    fullName,
    email: profile.email.trim(),
    sex: profile.sex.trim(),
    age: profile.age.trim(),
    birthday: profile.birthday.trim(),
    contact: profile.contact.trim(),
    address: profile.address.trim(),
    allergies: profile.allergies.trim() || 'None recorded',
    updatedAt: serverTimestamp(),
  });
}

const emergencyPatientSubcollections = [
  'medicalRecords',
  'diagnosticPlans',
  'diagnosticTests',
  'emergencyProcedureProgress',
] as const;

function normalizePatientName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, normalizeFirestoreValue(nestedValue)]),
    );
  }
  return value;
}

function firestoreDataMatches(left: DocumentData, right: DocumentData) {
  return JSON.stringify(normalizeFirestoreValue(left)) ===
    JSON.stringify(normalizeFirestoreValue(right));
}

async function moveEmergencyPatientSubcollections(
  sourcePatientId: string,
  targetPatientId: string,
) {
  const migrationPlans = await Promise.all(
    emergencyPatientSubcollections.map(async (subcollectionName) => {
      const sourceSnapshot = await getDocs(
        collection(db, 'patients', sourcePatientId, subcollectionName),
      );
      const targetSnapshot = await getDocs(
        collection(db, 'patients', targetPatientId, subcollectionName),
      );
      const targetDocuments = new Map(
        targetSnapshot.docs.map((documentSnapshot) => [
          documentSnapshot.id,
          documentSnapshot.data(),
        ]),
      );
      const documentsToCopy: Array<{ id: string; data: DocumentData }> = [];

      sourceSnapshot.docs.forEach((sourceDocument) => {
        const sourceData = sourceDocument.data();
        const existingTargetData = targetDocuments.get(sourceDocument.id);
        if (existingTargetData && !firestoreDataMatches(existingTargetData, sourceData)) {
          throw new Error(
            `Cannot merge because ${subcollectionName}/${sourceDocument.id} already exists on the selected patient.`,
          );
        }
        if (!existingTargetData) {
          documentsToCopy.push({ id: sourceDocument.id, data: sourceData });
        }
      });

      return {
        subcollectionName,
        sourceDocumentIds: sourceSnapshot.docs.map((documentSnapshot) => documentSnapshot.id),
        documentsToCopy,
      };
    }),
  );

  for (const plan of migrationPlans) {
    for (let start = 0; start < plan.documentsToCopy.length; start += 450) {
      const batch = writeBatch(db);
      plan.documentsToCopy.slice(start, start + 450).forEach(({ id, data }) => {
        batch.set(
          doc(db, 'patients', targetPatientId, plan.subcollectionName, id),
          data,
        );
      });
      await batch.commit();
    }
  }

  for (const plan of migrationPlans) {
    for (let start = 0; start < plan.sourceDocumentIds.length; start += 450) {
      const batch = writeBatch(db);
      plan.sourceDocumentIds.slice(start, start + 450).forEach((documentId) => {
        batch.delete(
          doc(db, 'patients', sourcePatientId, plan.subcollectionName, documentId),
        );
      });
      await batch.commit();
    }
  }
}

async function moveEmergencyPatientAccountReferences(
  sourceAccountNo: string,
  targetAccountNo: string,
  targetPatientId: string,
  fullName: string,
) {
  const [prescriptions, appointments] = await Promise.all([
    getDocs(query(collection(db, 'prescriptions'), where('userId', '==', sourceAccountNo))),
    getDocs(query(collection(db, 'appointments'), where('accountNo', '==', sourceAccountNo))),
  ]);
  const operations = [
    ...prescriptions.docs.map((prescription) => ({
      ref: prescription.ref,
      data: { userId: targetAccountNo },
    })),
    ...appointments.docs.map((appointment) => ({
      ref: appointment.ref,
      data: {
        accountNo: targetAccountNo,
        patientId: targetPatientId,
        patientName: fullName,
      },
    })),
  ];

  for (let start = 0; start < operations.length; start += 450) {
    const batch = writeBatch(db);
    operations.slice(start, start + 450).forEach(({ ref, data }) => {
      batch.update(ref, data);
    });
    await batch.commit();
  }
}

export async function mergeEmergencyPatientProfile(
  sourcePatientId: string,
  targetPatientId: string,
  profile: EditableEmergencyPatientProfile,
) {
  const sourcePatientRef = doc(db, 'patients', sourcePatientId);
  const targetPatientRef = doc(db, 'patients', targetPatientId);
  const initialSnapshots = await Promise.all([
    getDoc(sourcePatientRef),
    getDoc(targetPatientRef),
  ]);
  if (!initialSnapshots[0].exists() || !initialSnapshots[1].exists()) {
    throw new Error('One of the patient profiles could not be found.');
  }
  const sourceData = initialSnapshots[0].data();
  const targetData = initialSnapshots[1].data();
  if (!sourceData || !targetData) {
    throw new Error('One of the patient profiles could not be read.');
  }
  const sourceAccountNo = sourceData?.accountNo;
  const targetAccountNo = targetData?.accountNo;

  if (
    sourceData?.temporary !== true ||
    typeof sourceAccountNo !== 'string' ||
    !sourceAccountNo.trim().toUpperCase().startsWith('PTNT-EMER-')
  ) {
    throw new Error('The temporary emergency profile could not be verified.');
  }
  if (
    targetData?.temporary === true ||
    typeof targetAccountNo !== 'string' ||
    targetAccountNo.trim().toUpperCase().startsWith('PTNT-EMER-')
  ) {
    throw new Error('Select an existing, non-temporary patient account to merge into.');
  }
  if (
    normalizePatientName(profile.fullName) !== normalizePatientName(String(targetData.fullName || ''))
  ) {
    throw new Error('The selected patient name no longer matches the emergency profile.');
  }

  await moveEmergencyPatientSubcollections(sourcePatientId, targetPatientId);
  await moveEmergencyPatientAccountReferences(
    sourceAccountNo.trim(),
    targetAccountNo.trim(),
    targetPatientId,
    profile.fullName.trim(),
  );

  const sourceQueueRef = doc(db, 'queues', sourceAccountNo.trim());
  const targetQueueRef = doc(db, 'queues', targetAccountNo.trim());
  const sourcePositionRef = doc(db, 'queuePositions', sourceAccountNo.trim());
  const targetPositionRef = doc(db, 'queuePositions', targetAccountNo.trim());

  await runTransaction(db, async (transaction) => {
    const [
      sourceSnapshot,
      targetSnapshot,
      sourceQueueSnapshot,
      targetQueueSnapshot,
      sourcePositionSnapshot,
      targetPositionSnapshot,
    ] = await Promise.all([
      transaction.get(sourcePatientRef),
      transaction.get(targetPatientRef),
      transaction.get(sourceQueueRef),
      transaction.get(targetQueueRef),
      transaction.get(sourcePositionRef),
      transaction.get(targetPositionRef),
    ]);

    if (!sourceSnapshot.exists() || !targetSnapshot.exists()) {
      throw new Error('One of the patient profiles was removed before the merge completed.');
    }

    const currentSource = sourceSnapshot.data();
    const currentTarget = targetSnapshot.data();
    if (
      currentSource.temporary !== true ||
      currentSource.accountNo !== sourceAccountNo ||
      currentTarget.accountNo !== targetAccountNo ||
      normalizePatientName(String(currentTarget.fullName || '')) !==
        normalizePatientName(profile.fullName)
    ) {
      throw new Error('Patient profile data changed during the merge. Reload and try again.');
    }

    const existingText = (field: keyof EditableEmergencyPatientProfile) => {
      const value = currentTarget[field];
      return typeof value === 'string' ? value.trim() : '';
    };
    const keepExistingUnlessIncomingSet = (field: keyof EditableEmergencyPatientProfile) => {
      const incoming = profile[field].trim();
      return incoming || existingText(field);
    };
    const mergedEmail = existingText('email') || profile.email.trim();
    const incomingAllergies = profile.allergies.trim();
    const existingAllergies = existingText('allergies');
    const mergedAllergies =
      !incomingAllergies ||
      (
        incomingAllergies.toLowerCase() === 'none recorded' &&
        existingAllergies &&
        existingAllergies.toLowerCase() !== 'none recorded'
      )
        ? existingAllergies || 'None recorded'
        : incomingAllergies;

    transaction.update(targetPatientRef, {
      fullName: profile.fullName.trim(),
      email: mergedEmail,
      sex: profile.sex.trim().toLowerCase() === 'not specified'
        ? existingText('sex') || profile.sex.trim()
        : keepExistingUnlessIncomingSet('sex'),
      age: keepExistingUnlessIncomingSet('age'),
      birthday: keepExistingUnlessIncomingSet('birthday'),
      contact: keepExistingUnlessIncomingSet('contact'),
      address: keepExistingUnlessIncomingSet('address'),
      allergies: mergedAllergies,
      updatedAt: serverTimestamp(),
    });

    const sourceQueueData = sourceQueueSnapshot.data();
    const targetQueueData = targetQueueSnapshot.data();
    if (sourceQueueSnapshot.exists() || targetQueueSnapshot.exists()) {
      const queuePriorities = [sourceQueueData?.priorityWeight, targetQueueData?.priorityWeight]
        .filter((weight): weight is number => typeof weight === 'number' && Number.isFinite(weight));
      transaction.set(targetQueueRef, {
        ...(targetQueueData || {}),
        ...(sourceQueueData || {}),
        accountNo: targetAccountNo,
        fullName: profile.fullName.trim(),
        patientId: targetPatientId,
        patientEmail: mergedEmail,
        ...(queuePriorities.length > 0 ? { priorityWeight: Math.max(...queuePriorities) } : {}),
      });
    }
    if (sourceQueueSnapshot.exists()) transaction.delete(sourceQueueRef);

    const sourcePositionData = sourcePositionSnapshot.data();
    const targetPositionData = targetPositionSnapshot.data();
    if (sourcePositionSnapshot.exists() || targetPositionSnapshot.exists()) {
      const positionPriorities = [
        sourcePositionData?.priorityWeight,
        targetPositionData?.priorityWeight,
        sourceQueueData?.priorityWeight,
        targetQueueData?.priorityWeight,
      ].filter((weight): weight is number => typeof weight === 'number' && Number.isFinite(weight));
      transaction.set(targetPositionRef, {
        accountNo: targetAccountNo,
        priorityWeight: positionPriorities.length > 0 ? Math.max(...positionPriorities) : 0,
        ...(typeof sourcePositionData?.appointmentId === 'string'
          ? { appointmentId: sourcePositionData.appointmentId }
          : typeof targetPositionData?.appointmentId === 'string'
            ? { appointmentId: targetPositionData.appointmentId }
            : {}),
      });
    }
    if (sourcePositionSnapshot.exists()) transaction.delete(sourcePositionRef);
    transaction.delete(sourcePatientRef);
  });
}

export async function addPatientMedicalRecord(
  patientId: string,
  title: string,
  details: string,
  doctorName: string,
  doctorId: string,
) {
  await addDoc(collection(db, 'patients', patientId, 'medicalRecords'), {
    title: title.trim(),
    details: details.trim(),
    doctorName,
    doctorId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function editPatientMedicalRecord(
  patientId: string,
  recordId: string,
  title: string,
  details: string,
  doctorName: string,
  doctorId: string,
) {
  await updateDoc(doc(db, 'patients', patientId, 'medicalRecords', recordId), {
    title: title.trim(),
    details: details.trim(),
    doctorName,
    doctorId,
    updatedAt: serverTimestamp(),
  });
}
