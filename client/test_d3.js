const d3 = require('d3');
const rows = [{"date":"2026-02-04","battles":0,"wins":0}];
console.log(d3.max(rows, (d) => +(d.battles || 0)) ?? 0);
