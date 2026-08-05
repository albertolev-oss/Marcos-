const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  getConfig,
  normalizeBaseUrl,
  normalizePath,
  buildWebSearchUrl,
  buildDicomwebQuery
} = require('../src/pacs');

async function main() {
  assert.equal(normalizeBaseUrl('pacs,fcm.unc.edu.ar'), 'https://pacs.fcm.unc.edu.ar');
  assert.equal(normalizePath('dicom-web'), '/dicom-web');

  const cfg = getConfig({});
  assert.equal(cfg.baseUrl, 'https://pacs.fcm.unc.edu.ar');
  assert.equal(cfg.vendor, 'VisualMedica');

  const webUrl = buildWebSearchUrl(
    { patient: '123', accession: 'ACC-1', studyDate: '2026-06-13', modality: 'ct' },
    {}
  );
  assert.match(webUrl, /patient=123/);
  assert.match(webUrl, /accession=ACC-1/);
  assert.match(webUrl, /date=20260613/);
  assert.match(webUrl, /modality=CT/);

  const dicomQuery = buildDicomwebQuery({ patientId: '123', accessionNumber: 'ACC-1', studyDate: '20260613', modality: 'mr' });
  assert.equal(dicomQuery.get('PatientID'), '123');
  assert.equal(dicomQuery.get('AccessionNumber'), 'ACC-1');
  assert.equal(dicomQuery.get('StudyDate'), '20260613');
  assert.equal(dicomQuery.get('ModalitiesInStudy'), 'MR');

  const openapi = fs.readFileSync(path.join(__dirname, '..', 'public', 'openapi.yaml'), 'utf8');
  assert.match(openapi, /openapi: 3\.1\.0/);
  assert.match(openapi, /operationId: buildStudyLink/);
  assert.match(openapi, /name: x-api-key/);

  console.log('check ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
