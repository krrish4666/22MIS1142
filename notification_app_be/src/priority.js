'use strict';

const CATEGORY_WEIGHTS = {
  placement: 3,
  result: 2,
  event: 1
};

function normalizeNotification(input) {
  const category = String(input.category || input.type || input.Type || input.notificationType || '').toLowerCase();
  const createdAtValue = input.createdAt || input.created_at || input.timestamp || input.Timestamp || input.date;
  const createdAt = createdAtValue ? new Date(createdAtValue) : new Date(0);
  const message = input.message || input.Message || input.body || input.description || '';

  return {
    id: input.id || input.ID || input.notificationID || input.notificationId || input._id,
    title: input.title || input.Title || input.subject || message,
    message,
    category,
    studentID: input.studentID || input.studentId || input.rollNo,
    isRead: Boolean(input.isRead || input.read),
    createdAt: Number.isNaN(createdAt.getTime()) ? null : createdAt.toISOString(),
    raw: input
  };
}

function scoreNotification(notification, now = Date.now()) {
  const normalized = normalizeNotification(notification);
  const categoryWeight = CATEGORY_WEIGHTS[normalized.category] || 0;
  const createdAtMs = normalized.createdAt ? new Date(normalized.createdAt).getTime() : 0;
  const ageHours = createdAtMs > 0 ? Math.max(0, (now - createdAtMs) / 36e5) : Number.MAX_SAFE_INTEGER;
  const recencyScore = 1 / (1 + ageHours / 24);

  return {
    normalized,
    score: categoryWeight * 1000 + recencyScore * 100
  };
}

function getPriorityInbox(notifications, limit = 10) {
  return notifications
    .map((notification) => scoreNotification(notification))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const rightDate = right.normalized.createdAt ? Date.parse(right.normalized.createdAt) : 0;
      const leftDate = left.normalized.createdAt ? Date.parse(left.normalized.createdAt) : 0;
      return rightDate - leftDate;
    })
    .slice(0, limit)
    .map(({ normalized, score }) => ({
      ...normalized,
      priorityScore: Number(score.toFixed(4))
    }));
}

module.exports = {
  CATEGORY_WEIGHTS,
  normalizeNotification,
  scoreNotification,
  getPriorityInbox
};
