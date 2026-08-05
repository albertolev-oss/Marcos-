const { buildWebSearchUrl, buildDicomwebQuery, getConfig } = require('../src/pacs');

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

const input = {
  patient: readArg('patient') || process.env.PATIENT_ID || '',
  accession: readArg('accession') || process.env.ACCESSION_NUMBER || '',
  studyDate: readArg('date') || process.env.STUDY_DATE || '',
  modality: readArg('modality') || process.env.MODALITY || ''
};

const cfg = getConfig();
const dicomQuery = buildDicomwebQuery(input).toString();
const result = {
  webUrl: buildWebSearchUrl(input),
  qidoUrl: dicomQuery ? `${cfg.dicomweb.qidoRoot}?${dicomQuery}` : cfg.dicomweb.qidoRoot,
  input
};

console.log(JSON.stringify(result, null, 2));
