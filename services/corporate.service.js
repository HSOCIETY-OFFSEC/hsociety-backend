import { Asset, DashboardActivity, Notification, Pentest, PentestReport } from '../models/index.js';
import { emitNotifications } from '../sockets/socket.store.js';

const ACTIVE_STATUSES = new Set(['pending', 'in-progress', 'draft']);

const toEngagementCard = (doc) => ({
  id: doc._id.toString(),
  name: doc.title || doc.metadata?.target?.identifier || 'Untitled engagement',
  scope: (doc.scope || []).join(', ') || doc.description || 'Scope TBD',
  status: doc.status || 'pending',
  startDate: doc.startedAt?.getTime?.() || doc.createdAt?.getTime?.() || null,
  expectedCompletion: doc.metadata?.estimatedCompletion || null,
  summary: doc.metadata?.notes || doc.description || 'Engagement requested',
  reportAvailable: Boolean(doc.metadata?.reportAvailable),
});

const getCorporateQuery = (user) => {
  if (user.role === 'admin') return {};
  if (user.role === 'pentester') return { assignedTo: user.id };
  return { requestedBy: user.id };
};

export async function listEngagements(user) {
  const docs = await Pentest.find(getCorporateQuery(user)).sort({ createdAt: -1 }).lean();
  const cards = docs.map(toEngagementCard);
  return {
    active: cards.filter((item) => ACTIVE_STATUSES.has(item.status)),
    past: cards.filter((item) => !ACTIVE_STATUSES.has(item.status)),
  };
}

export async function requestEngagement(user, payload = {}) {
  const target = payload.target || {};
  const scope = Array.isArray(payload.scope)
    ? payload.scope
    : String(payload.scope || '')
        .split(/[\n,]/)
        .map((part) => part.trim())
        .filter(Boolean);

  const pentest = await Pentest.create({
    title: target.identifier || payload.name || payload.title || 'Corporate Engagement',
    description: target.description || payload.description || '',
    scope,
    requestedBy: user.id,
    status: 'pending',
    metadata: {
      target,
      schedule: payload.schedule || {},
      notes: payload.notes || '',
      estimatedCompletion: payload.estimatedCompletion || null,
      reportAvailable: false,
      paymentStatus: 'pending_approval',
      invoice: {
        amount: Number(payload.amount || 0),
        currency: payload.currency || 'USD',
      },
    },
  });

  await DashboardActivity.create({
    type: 'engagement',
    title: pentest.title,
    status: 'pending',
    icon: 'shield',
    userId: user.id,
    metadata: { pentestId: pentest._id.toString() },
  });

  const admins = await Pentest.db.model('User').find({ role: 'admin' }).select('_id').lean();
  if (admins.length) {
    const inserted = await Notification.insertMany(
      admins.map((admin) => ({
        userId: admin._id,
        type: 'engagement',
        title: 'New engagement request',
        message: `${user.name || user.email} requested ${pentest.title}`,
        metadata: { pentestId: pentest._id.toString() },
      }))
    );
    emitNotifications(inserted);
  }

  return {
    invoiceId: `INV-${Date.now()}`,
    engagementId: pentest._id.toString(),
    status: pentest.status,
  };
}

export async function listReports(user) {
  if (user.role === 'pentester') {
    const docs = await PentestReport.find({ createdBy: user.id })
      .sort({ createdAt: -1 })
      .lean();
    const pentestIds = docs.map((doc) => doc.pentestId).filter(Boolean);
    const pentests = await Pentest.find({ _id: { $in: pentestIds } })
      .select('title')
      .lean();
    const pentestMap = pentests.reduce((acc, doc) => {
      acc[doc._id.toString()] = doc.title || 'Engagement';
      return acc;
    }, {});

    return docs.map((doc) => ({
      id: doc._id.toString(),
      title: doc.title || 'Pentest Report',
      engagementName: pentestMap[doc.pentestId?.toString?.()] || 'Engagement',
      date: doc.submittedAt?.getTime?.() || doc.createdAt?.getTime?.() || Date.now(),
      status: doc.status || 'draft',
      downloadUrl: '',
      pentestId: doc.pentestId?.toString?.() || '',
      summary: doc.summary || '',
      findingsCount: Array.isArray(doc.findings) ? doc.findings.length : 0,
    }));
  }

  const query = {
    ...getCorporateQuery(user),
    status: 'completed',
    'metadata.reportAvailable': true,
  };
  const docs = await Pentest.find(query).sort({ completedAt: -1, updatedAt: -1 }).lean();

  return docs.map((doc) => ({
    id: doc._id.toString(),
    title: `${doc.title || 'Engagement'} Report`,
    engagementName: doc.title || 'Engagement',
    date: doc.completedAt?.getTime?.() || doc.updatedAt?.getTime?.() || Date.now(),
    status: doc.metadata?.reportStatus || 'Final',
    downloadUrl: '',
  }));
}

export async function getRemediationSummary(user) {
  const docs = await Pentest.find(getCorporateQuery(user)).lean();
  const totals = docs.reduce(
    (acc, doc) => {
      const vuln = doc.metadata?.vulnerabilities || {};
      const critical = Number(vuln.critical || 0);
      const high = Number(vuln.high || 0);
      const medium = Number(vuln.medium || 0);
      const low = Number(vuln.low || 0);
      const fixed = Number(doc.metadata?.fixedVulnerabilities || 0);
      const total = critical + high + medium + low;
      acc.total += total;
      acc.fixed += Math.min(fixed, total);
      return acc;
    },
    { total: 0, fixed: 0 }
  );

  const open = Math.max(0, totals.total - totals.fixed);
  const remediationRate = totals.total ? Math.round((totals.fixed / totals.total) * 100) : 0;

  return {
    totalVulnerabilities: totals.total,
    fixedVulnerabilities: totals.fixed,
    openVulnerabilities: open,
    remediationRate,
  };
}

export async function getRemediationReports(user) {
  const docs = await Pentest.find(getCorporateQuery(user)).sort({ updatedAt: -1 }).limit(20).lean();
  return docs.map((doc) => ({
    id: doc._id.toString(),
    title: `${doc.title || 'Engagement'} Remediation`,
    generatedOn: doc.updatedAt?.getTime?.() || Date.now(),
    owner: doc.metadata?.owner || 'HSOCIETY Recovery Team',
    downloadUrl: '',
  }));
}

export async function listAssets(user) {
  const query = user.role === 'admin' ? {} : { ownerId: user.id };
  const items = await Asset.find(query).sort({ createdAt: -1 }).lean();
  return items.map((asset) => ({
    id: asset._id.toString(),
    type: asset.type,
    name: asset.name,
    details: asset.details,
    metadata: asset.metadata || {},
  }));
}

export async function createAsset(user, payload = {}) {
  const doc = await Asset.create({
    ownerId: user.role === 'admin' && payload.ownerId ? payload.ownerId : user.id,
    type: payload.type || 'Domain',
    name: String(payload.name || '').trim(),
    details: String(payload.details || '').trim(),
    metadata: payload.metadata || {},
    createdBy: user.id,
  });
  return {
    id: doc._id.toString(),
    type: doc.type,
    name: doc.name,
    details: doc.details,
    metadata: doc.metadata || {},
  };
}

export async function updateAsset(user, assetId, payload = {}) {
  const query = user.role === 'admin' ? { _id: assetId } : { _id: assetId, ownerId: user.id };
  const updates = {};
  if (payload.type) updates.type = payload.type;
  if (payload.name !== undefined) updates.name = String(payload.name || '').trim();
  if (payload.details !== undefined) updates.details = String(payload.details || '').trim();
  if (payload.metadata && typeof payload.metadata === 'object') updates.metadata = payload.metadata;

  const doc = await Asset.findOneAndUpdate(query, { $set: updates }, { new: true }).lean();
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    type: doc.type,
    name: doc.name,
    details: doc.details,
    metadata: doc.metadata || {},
  };
}

export async function deleteAsset(user, assetId) {
  const query = user.role === 'admin' ? { _id: assetId } : { _id: assetId, ownerId: user.id };
  const result = await Asset.findOneAndDelete(query);
  return Boolean(result);
}

const invoiceFromPentest = (doc) => {
  const invoice = doc.metadata?.invoice || {};
  return {
    id: `INV-${doc._id.toString().slice(-6).toUpperCase()}`,
    engagementName: doc.title || 'Engagement',
    date: doc.createdAt?.getTime?.() || Date.now(),
    amount: Number(invoice.amount || 0),
    currency: invoice.currency || 'USD',
    status: doc.metadata?.paymentStatus === 'approved' ? 'Paid' : 'Pending',
    downloadUrl: '',
  };
};

export async function listInvoices(user) {
  const docs = await Pentest.find(getCorporateQuery(user)).sort({ createdAt: -1 }).lean();
  return docs.map(invoiceFromPentest);
}

export async function listAgreements(user) {
  const docs = await Pentest.find(getCorporateQuery(user)).sort({ createdAt: -1 }).lean();
  return docs.map((doc) => ({
    id: `AGR-${doc._id.toString().slice(-6).toUpperCase()}`,
    title: `${doc.title || 'Engagement'} Scope Agreement`,
    date: doc.createdAt?.getTime?.() || Date.now(),
    downloadUrl: '',
  }));
}

export async function listNotifications(user) {
  const query = user.role === 'admin' ? {} : { userId: user.id };
  const docs = await Notification.find(query).sort({ createdAt: -1 }).limit(50).lean();
  return docs.map((item) => ({
    id: item._id.toString(),
    type: item.type,
    title: item.title,
    message: item.message,
    read: Boolean(item.read),
    createdAt: item.createdAt,
    metadata: item.metadata || {},
  }));
}

export async function markNotificationRead(user, notificationId) {
  const query = user.role === 'admin'
    ? { _id: notificationId }
    : { _id: notificationId, userId: user.id };
  const doc = await Notification.findOneAndUpdate(query, { $set: { read: true } }, { new: true }).lean();
  return doc ? { id: doc._id.toString(), read: true } : null;
}

export async function markAllNotificationsRead(user) {
  const query = user.role === 'admin' ? {} : { userId: user.id };
  const result = await Notification.updateMany(query, { $set: { read: true } });
  return { modifiedCount: Number(result.modifiedCount || 0) };
}
