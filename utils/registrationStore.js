// Temporary in-memory store for pending registrations
// In production, use a persistent store like Redis

const pendingRegistrations = new Map();

const savePendingRegistration = (email, data) => {
  pendingRegistrations.set(email, {
    ...data,
    createdAt: Date.now(),
  });
};

const getPendingRegistration = (email) => {
  return pendingRegistrations.get(email);
};

const deletePendingRegistration = (email) => {
  pendingRegistrations.delete(email);
};

module.exports = {
  savePendingRegistration,
  getPendingRegistration,
  deletePendingRegistration,
};


