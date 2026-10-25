import { prepareData } from "./prepare-data";
const { rows, enrichment } = await prepareData();
console.log(
  `Validated ${enrichment.entries.length} reference entries, ${rows.filter((v) => v.senses.length).length} entries with sourced or explicitly labeled machine glosses; ${rows.reduce((n, v) => n + v.examples.length, 0)} examples rechecked against target Band. No database writes.`,
);
