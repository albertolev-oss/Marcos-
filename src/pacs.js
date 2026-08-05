const DEFAULT_CONFIG = {
  name: 'PACS FCM UNC',
  vendor: 'VisualMedica',
  baseUrl: 'https://pacs.fcm.unc.edu.ar',
  webPath: '/',
  dicomWebPath: '/dicom-web',
  security: {
    storesCredentials: false,
    requiresInstitutionalAccess: true,
    note: 'No credentials or tokens are committed. Configure secrets in Railway environment variables only.'
  }
};

function normalizePath(value, fallback = '/') {
  const raw = String(value || fallback).trim() || fallback;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function normalizeBaseUrl(value) {
  const raw = String(value || DEFAULT_CONFIG.baseUrl).trim().replace(/,/g, '.');
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withProtocol);
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function getConfig(env = process.env) {
  const baseUrl = normalizeBaseUrl(env.PACS_BASE_URL || DEFAULT_CONFIG.baseUrl);
  const webPath = normalizePath(env.PACS_WEB_PATH || DEFAULT_CONFIG.webPath || '/');
  const dicomWebPath = normalizePath(env.PACS_DICOMWEB_PATH || DEFAULT_CONFIG.dicomWebPath || '/dicom-web');
  const proxyBaseUrl = env.PACS_PROXY_BASE_URL ? normalizeBaseUrl(env.PACS_PROXY_BASE_URL) : '';

  return {
    name: DEFAULT_CONFIG.name,
    vendor: env.PACS_VENDOR || DEFAULT_CONFIG.vendor,
    baseUrl,
    webUrl: `${baseUrl}${webPath}`,
    webPath,
    dicomWebPath,
    dicomweb: {
      qidoRoot: `${baseUrl}${dicomWebPath}/studies`,
      wadoRoot: `${baseUrl}${dicomWebPath}/studies/{StudyInstanceUID}`,
      stowRoot: `${baseUrl}${dicomWebPath}/studies`
    },
    proxy: {
      configured: Boolean(proxyBaseUrl),
      baseUrl: proxyBaseUrl || null
    },
    security: DEFAULT_CONFIG.security
  };
}

function buildStudyQuery(input = {}) {
  const params = new URLSearchParams();
  const patient = input.patient || input.patientId || input.PatientID;
  const accession = input.accession || input.accessionNumber || input.AccessionNumber;
  const modality = input.modality || input.Modality;
  const studyDate = input.studyDate || input.date || input.StudyDate;

  if (patient) params.set('patient', String(patient).trim());
  if (accession) params.set('accession', String(accession).trim());
  if (modality) params.set('modality', String(modality).trim().toUpperCase());
  if (studyDate) params.set('date', String(studyDate).replaceAll('-', '').trim());
  return params;
}

function buildWebSearchUrl(input = {}, env = process.env) {
  const cfg = getConfig(env);
  const params = buildStudyQuery(input);
  const query = params.toString();
  return query ? `${cfg.webUrl}${cfg.webUrl.includes('?') ? '&' : '?'}${query}` : cfg.webUrl;
}

function buildDicomwebQuery(input = {}) {
  const params = new URLSearchParams();
  const patient = input.patient || input.patientId || input.PatientID;
  const accession = input.accession || input.accessionNumber || input.AccessionNumber;
  const modality = input.modality || input.Modality;
  const studyDate = input.studyDate || input.date || input.StudyDate;

  if (patient) params.set('PatientID', String(patient).trim());
  if (accession) params.set('AccessionNumber', String(accession).trim());
  if (modality) params.set('ModalitiesInStudy', String(modality).trim().toUpperCase());
  if (studyDate) params.set('StudyDate', String(studyDate).replaceAll('-', '').trim());
  return params;
}

module.exports = {
  DEFAULT_CONFIG,
  normalizePath,
  normalizeBaseUrl,
  getConfig,
  buildStudyQuery,
  buildWebSearchUrl,
  buildDicomwebQuery
};
